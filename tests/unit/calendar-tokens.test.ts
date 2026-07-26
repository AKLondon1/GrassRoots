import { describe, expect, it } from "vitest";

import { createCalendarFeed } from "@/features/events/service";

describe("private calendar feeds", () => {
  it("returns a redacted ICS feed for an active opaque token", async () => {
    const repository = {
      async findCalendarToken() {
        return { id: "token-id", organisationId: "org-1", tokenHash: "hash", revokedAt: null };
      },
      async listCalendarEvents() {
        return [{ id: "event-1", title: "Under 11s training", startsAt: "2026-09-05T09:00:00.000Z", endsAt: "2026-09-05T10:00:00.000Z", locationName: "Riverside Sports Ground", playerName: "Jamie Morgan", availabilityNote: "Medical appointment" }];
      },
    };

    const feed = await createCalendarFeed(repository, "opaque-private-token");

    expect(feed).toContain("BEGIN:VCALENDAR");
    expect(feed).toContain("SUMMARY:Under 11s training");
    expect(feed).not.toContain("Jamie Morgan");
    expect(feed).not.toContain("Medical appointment");
  });

  it("rejects a revoked token", async () => {
    const repository = {
      async findCalendarToken() {
        return { id: "token-id", organisationId: "org-1", tokenHash: "hash", revokedAt: "2026-07-20T12:00:00.000Z" };
      },
      async listCalendarEvents() { return []; },
    };

    await expect(createCalendarFeed(repository, "opaque-private-token")).rejects.toThrow("not available");
  });
});
