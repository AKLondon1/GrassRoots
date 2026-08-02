import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";
import { saveProductionPollResponse } from "@/features/polls/actions";

import { card, formatDate, formatDateTime, formatTime, type SectionContext } from "./shared";

/**
 * Time polls for this child's teams.
 *
 * THE TRAP THIS SECTION EXISTS TO HANDLE. A poll stays readable after it closes;
 * its respondent rows do not. Two policies disagree on purpose:
 *
 *   polls_view_team               no deadline at all
 *   can_access_poll_respondent    requires status = 'open' and closes_at >= now()
 *
 * So the moment a deadline passes, the poll still reads and every respondent row
 * vanishes. The previous version filtered the closed poll out of the query
 * altogether, which made the two states indistinguishable: a parent who missed a
 * deadline saw the same blank screen as a parent whose club had never run a poll.
 * One of those needs an explanation and the other does not.
 *
 * Now a closed poll renders as closed. It has no form, because there is nothing
 * useful to submit and the database would refuse it anyway, and it does not claim
 * the family was left out, because they were not.
 */

interface PollRow {
  id: string;
  team_id: string;
  title: string;
  status: string;
  closes_at: string;
}

interface PollOptionRow {
  id: string;
  poll_id: string;
  starts_at: string;
  ends_at: string;
  pitch_capacity: number | null;
}

interface PollRespondentRow {
  id: string;
  poll_id: string;
}

interface PollResponseRow {
  option_id: string;
  respondent_id: string;
  response: "available" | "unavailable" | "maybe";
}

/**
 * Mirrors can_access_poll_respondent's condition exactly, because that is what
 * decides whether the respondent rows behind the form are readable.
 *
 * Compared as instants, never as strings. `now` is Z-suffixed and PostgREST returns
 * `closes_at` with a `+00:00` offset, so a lexical comparison of two correct
 * timestamps gives the wrong answer.
 */
function isStillOpen(poll: PollRow, now: string): boolean {
  return poll.status === "open" && new Date(poll.closes_at).getTime() >= new Date(now).getTime();
}

export async function PollsSection({ db, organisationId, workspace, child, now }: SectionContext) {
  // No deadline filter. Closed polls are part of what this screen has to explain.
  const { data: pollData, error: pollError } = await db
    .from("polls")
    .select("id,team_id,title,status,closes_at")
    .eq("organisation_id", organisationId)
    .in("team_id", child.teamIds)
    .order("closes_at", { ascending: false })
    .limit(20);
  if (pollError) throw new Error("We could not load time polls.");
  const polls = (pollData ?? []) as PollRow[];

  if (!polls.length) {
    return (
      <EmptyState
        title="No time polls"
        description={`When a coach asks families to choose a time for ${child.firstName}'s team, it appears here.`}
      />
    );
  }

  // Options and respondents are fetched only for polls still open. A closed poll
  // renders no form, so its options are never needed, and its respondent rows are
  // unreadable by definition. Asking for them would return nothing and invite
  // somebody later to read that nothing as a bug.
  const openPollIds = polls.filter((poll) => isStillOpen(poll, now)).map((poll) => poll.id);

  const [{ data: optionData, error: optionError }, { data: respondentData, error: respondentError }] =
    openPollIds.length
      ? await Promise.all([
          db
            .from("poll_options")
            .select("id,poll_id,starts_at,ends_at,pitch_capacity")
            .eq("organisation_id", organisationId)
            .in("poll_id", openPollIds)
            .order("starts_at"),
          db
            .from("poll_respondents")
            .select("id,poll_id")
            .eq("organisation_id", organisationId)
            .eq("player_id", child.playerId)
            .in("poll_id", openPollIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
  if (optionError || respondentError) throw new Error("We could not load poll choices.");
  const options = (optionData ?? []) as PollOptionRow[];
  const respondents = (respondentData ?? []) as PollRespondentRow[];

  const { data: responseData, error: responseError } = respondents.length
    ? await db
        .from("poll_responses")
        .select("option_id,respondent_id,response")
        .eq("organisation_id", organisationId)
        .in(
          "respondent_id",
          respondents.map((respondent) => respondent.id),
        )
    : { data: [], error: null };
  if (responseError) throw new Error("We could not load your current poll responses.");
  const responses = (responseData ?? []) as PollResponseRow[];

  return (
    <section className="space-y-4" aria-label="Time polls">
      {polls.map((poll) => {
        const open = isStillOpen(poll, now);
        const respondent = respondents.find((row) => row.poll_id === poll.id);
        return (
          <article className={card} key={poll.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Status tone={open ? "info" : "neutral"}>{open ? "Open poll" : "Closed"}</Status>
              <span className="text-sm text-muted">
                {open
                  ? `Closes ${formatDate(poll.closes_at)} at ${formatTime(poll.closes_at)}`
                  : `Closed ${formatDateTime(poll.closes_at)}`}
              </span>
            </div>
            <h2 className="mt-4 text-xl font-semibold">{poll.title}</h2>

            {!open ? (
              <p className="mt-5 rounded-xl bg-surface px-4 py-3 text-sm text-muted">
                This poll has closed, so replies can no longer be changed. Your coach will
                confirm the chosen time.
              </p>
            ) : respondent ? (
              <div className="mt-5 space-y-6">
                <section aria-label={`Responses for ${child.name}`}>
                  <h3 className="font-semibold">{child.name}</h3>
                  <div className="mt-3 divide-y divide-border">
                    {options
                      .filter((option) => option.poll_id === poll.id)
                      .map((option) => {
                        const current = responses.find(
                          (response) =>
                            response.respondent_id === respondent.id && response.option_id === option.id,
                        )?.response;
                        return (
                          <form action={saveProductionPollResponse} className="py-4" key={option.id}>
                            <input type="hidden" name="organisationId" value={organisationId} />
                            <input type="hidden" name="pollId" value={poll.id} />
                            <input type="hidden" name="optionId" value={option.id} />
                            <input type="hidden" name="respondentId" value={respondent.id} />
                            <input type="hidden" name="workspace" value={workspace} />
                            <p className="font-medium">
                              {formatDate(option.starts_at)} · {formatTime(option.starts_at)}–
                              {formatTime(option.ends_at)}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              {option.pitch_capacity
                                ? `Pitch capacity ${option.pitch_capacity}`
                                : "Capacity not set"}
                            </p>
                            <fieldset className="mt-3 flex flex-wrap gap-2">
                              <legend className="sr-only">Response for this time</legend>
                              {["available", "unavailable", "maybe"].map((response) => (
                                <label
                                  className="flex min-h-10 items-center gap-2 rounded-xl border border-border-strong px-3 text-sm font-semibold capitalize has-[:checked]:border-primary has-[:checked]:bg-primary-light"
                                  key={response}
                                >
                                  <input
                                    defaultChecked={current === response}
                                    name="response"
                                    required
                                    type="radio"
                                    value={response}
                                  />
                                  {response}
                                </label>
                              ))}
                            </fieldset>
                            <Button className="mt-3" size="small" type="submit">
                              Save this time
                            </Button>
                          </form>
                        );
                      })}
                  </div>
                </section>
              </div>
            ) : (
              <p className="mt-5 rounded-xl bg-surface px-4 py-3 text-sm text-muted">
                {child.firstName} has not been included in this poll. Contact the organiser if
                they should be.
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}
