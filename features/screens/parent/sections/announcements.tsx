import { Megaphone } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Status } from "@/components/ui/status";

import { card, formatDateTime, type SectionContext } from "./shared";

/**
 * Club and team announcements, newest first.
 *
 * Ported from `ParentAnnouncements` in `core-football.tsx`. The card, the megaphone
 * and the New/Read badge are kept. The demo's "Mark as read in preview" button is
 * not: it existed only to drive a `DemoFeedback` block, and marking a message read
 * is a write path that belongs with the rest of the notification work rather than
 * smuggled into a port.
 *
 * READ STATE COMES FROM THE DELIVERY ROW. `announcement_recipients` is populated by
 * the `enqueue_published_announcement_deliveries` trigger when an announcement is
 * published, one row per member of the audience, and carries `read_at`.
 *
 * The recipients query filters on organisation alone, which is safe here and is not
 * the trap that `loadLinkedChildren` guards against. `announcement_recipients_own`
 * matches the reader's own membership and nothing else, so RLS narrowing is the
 * whole answer. Migration 0028 added a publisher arm, but that reaches only
 * announcements the caller may manage, which a guardian never can.
 */

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  published_at: string;
  team_id: string | null;
}

interface RecipientRow {
  announcement_id: string;
  read_at: string | null;
}

export async function AnnouncementsSection({ db, organisationId }: SectionContext) {
  const [{ data: announcementData, error: announcementError }, { data: recipientData, error: recipientError }] =
    await Promise.all([
      db
        .from("announcements")
        .select("id,title,body,published_at,team_id")
        .eq("organisation_id", organisationId)
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(20),
      db.from("announcement_recipients").select("announcement_id,read_at").eq("organisation_id", organisationId),
    ]);
  if (announcementError || recipientError) throw new Error("We could not load club announcements.");
  const announcements = (announcementData ?? []) as AnnouncementRow[];
  const recipients = (recipientData ?? []) as RecipientRow[];

  if (!announcements.length) {
    return (
      <EmptyState
        title="No announcements"
        description="Published updates for your linked teams will appear here."
      />
    );
  }

  return (
    <section data-testid="parent-announcements" className="space-y-4" aria-label="Club announcements">
      {announcements.map((item) => {
        const delivery = recipients.find((row) => row.announcement_id === item.id);
        // No delivery row means the announcement predates the trigger or reached this
        // reader by team audience rather than an addressed row. Treating that as
        // unread would nag; treating it as read would hide it. It simply carries no
        // badge.
        const isRead = Boolean(delivery?.read_at);
        return (
          <article className={card} key={item.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Megaphone className="size-5 text-primary-strong" aria-hidden="true" />
                <h2 className="text-xl font-semibold text-ink">{item.title}</h2>
              </div>
              {delivery ? (
                <Status tone={isRead ? "neutral" : "info"}>{isRead ? "Read" : "New"}</Status>
              ) : null}
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted">{item.body}</p>
            <p className="mt-3 text-xs font-semibold text-muted">
              {item.team_id ? "Team update" : "Club update"} · {formatDateTime(item.published_at)}
            </p>
          </article>
        );
      })}
    </section>
  );
}
