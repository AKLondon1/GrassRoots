import { describe, expect, it, vi } from "vitest";

/**
 * A poll reply must be attributed to the family that sent it.
 *
 * `respondentId` reaches the action from a hidden form field, so it is a request
 * rather than a fact. Before `assertOwnsPollRespondent` existed the action upserted
 * against whatever id arrived, which is the same attribution class as the
 * availability bug fixed in Task 9.
 *
 * The check is deliberately NOT the availability pattern.
 * `poll_responses.respondent_id` references `poll_respondents`, which carries
 * `player_id` XOR `membership_id`. A poll can ask a question of a child or of an
 * adult directly, and walking the guardian link over a membership-based respondent
 * rejects every legitimate adult reply. Both arms are asserted below, because
 * getting one right and the other wrong is the plausible failure.
 */

const ORGANISATION = "00000000-0000-4000-8000-000000000101";
const POLL = "00000000-0000-4000-8000-000000001301";
const OPTION = "00000000-0000-4000-8000-000000001311";
const RESPONDENT = "00000000-0000-4000-8000-000000003002";
const OUR_MEMBERSHIP = "00000000-0000-4000-8000-000000000301";
const OUR_GUARDIAN = "00000000-0000-4000-8000-000000000401";
const OUR_CHILD = "00000000-0000-4000-8000-000000000601";
const ANOTHER_FAMILY_CHILD = "00000000-0000-4000-8000-000000000603";
const ANOTHER_MEMBERSHIP = "00000000-0000-4000-8000-000000000302";

type Row = Record<string, unknown>;

const upserts: Row[] = [];
let respondentRow: Row | null = null;

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => {
    function builder(table: string) {
      const filters: Row = {};
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return chain;
        },
        maybeSingle: async () => {
          if (table === "memberships") return { data: { id: OUR_MEMBERSHIP }, error: null };
          if (table === "guardians") return { data: { id: OUR_GUARDIAN }, error: null };
          if (table === "poll_respondents") return { data: respondentRow, error: null };
          if (table === "player_guardians") {
            // Only our own child is linked. Anything else resolves to no row, which is
            // what the guardian arm must refuse on.
            const linked = filters.player_id === OUR_CHILD && filters.guardian_id === OUR_GUARDIAN;
            return { data: linked ? { id: "link-1" } : null, error: null };
          }
          return { data: null, error: null };
        },
        upsert: async (row: Row) => {
          upserts.push(row);
          return { data: null, error: null };
        },
      };
      return chain;
    }

    return {
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
      from: (table: string) => builder(table),
    };
  },
}));

const { saveProductionPollResponse } = await import("@/features/polls/actions");

function reply() {
  const formData = new FormData();
  Object.entries({
    organisationId: ORGANISATION,
    pollId: POLL,
    optionId: OPTION,
    respondentId: RESPONDENT,
    workspace: "riverside-juniors",
    response: "available",
  }).forEach(([key, value]) => formData.append(key, value));
  return formData;
}

describe("saveProductionPollResponse attribution", () => {
  it("saves a reply for a respondent standing for a linked child", async () => {
    upserts.length = 0;
    respondentRow = { player_id: OUR_CHILD, membership_id: null };

    await saveProductionPollResponse(reply());

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ respondent_id: RESPONDENT, response: "available" });
  });

  it("refuses a respondent standing for another family's child", async () => {
    upserts.length = 0;
    respondentRow = { player_id: ANOTHER_FAMILY_CHILD, membership_id: null };

    await expect(saveProductionPollResponse(reply())).rejects.toThrow("You are not linked to this player.");
    expect(upserts).toHaveLength(0);
  });

  it("saves a reply for a respondent standing for the caller's own membership", async () => {
    // The case the Task 9 pattern would wrongly reject. An adult-facing poll creates
    // a respondent with membership_id and no player at all, so there is no guardian
    // link to walk and nothing for assertLinkedToPlayer to find.
    upserts.length = 0;
    respondentRow = { player_id: null, membership_id: OUR_MEMBERSHIP };

    await saveProductionPollResponse(reply());

    expect(upserts).toHaveLength(1);
  });

  it("refuses a respondent standing for another adult's membership", async () => {
    upserts.length = 0;
    respondentRow = { player_id: null, membership_id: ANOTHER_MEMBERSHIP };

    await expect(saveProductionPollResponse(reply())).rejects.toThrow(
      "This poll response belongs to someone else.",
    );
    expect(upserts).toHaveLength(0);
  });

  it("refuses without accusing anyone when the respondent row cannot be read", async () => {
    // Reading poll_respondents is itself gated on the poll being open, so a missing
    // row means either another family's respondent or a deadline that passed while
    // the form sat on screen. The second is blameless and far more common.
    upserts.length = 0;
    respondentRow = null;

    await expect(saveProductionPollResponse(reply())).rejects.toThrow("The poll may have closed.");
    expect(upserts).toHaveLength(0);
  });
});
