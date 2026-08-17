import { afterEach, describe, expect, it, vi } from "vitest";

import { AttendanceQueue, resolveAttendanceConflict } from "@/features/coaching/attendance-queue";
import { DurableAttendanceQueue, type AttendanceStore } from "@/features/coaching/attendance-store";

describe("offline attendance queue", () => {
  it("stores only non-sensitive attendance fields and stable idempotency keys", () => {
    const queue = new AttendanceQueue();
    const item = queue.enqueue({ organisationId: "org", sessionId: "session", playerId: "player", status: "present", occurredAt: "2026-08-02T08:31:00.000Z" });
    expect(item.idempotencyKey).toBe("org:session:player:2026-08-02T08:31:00.000Z");
    expect(JSON.stringify(queue.pending())).not.toMatch(/medical|safeguarding|observation|note/i);
    expect(queue.enqueue(item)).toEqual(item);
  });

  it("keeps an action recorded for a session that kicked off more than a day ago", () => {
    const queue = new AttendanceQueue();
    const longAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    queue.enqueue({ organisationId: "org", sessionId: "session", playerId: "player", status: "present", occurredAt: longAgo });
    // The retention window runs from when the coach queued the action, not from
    // kick-off, so catching up on an old session must not purge it on sight.
    expect(queue.pending()).toHaveLength(1);
  });

  it("resolves conflicts by the newest explicit action and records the decision", () => {
    const result = resolveAttendanceConflict(
      { organisationId: "org", sessionId: "session", playerId: "player", status: "absent", occurredAt: "2026-08-02T08:32:00.000Z" },
      { organisationId: "org", sessionId: "session", playerId: "player", status: "present", occurredAt: "2026-08-02T08:35:00.000Z" },
    );
    expect(result.resolved.status).toBe("present");
    expect(result.strategy).toBe("latest-action-wins");
  });
});

describe("durable attendance queue", () => {
  afterEach(() => vi.useRealTimers());
  it("recovers queued actions after a new queue instance is created", async () => {
    let persisted: readonly import("@/features/coaching/attendance-queue").QueuedAttendanceAction[] = [];
    const store: AttendanceStore = { load: async () => [...persisted], save: async (items) => { persisted = [...items]; } };
    const first = await DurableAttendanceQueue.open(store);
    await first.enqueue({ organisationId: "org", sessionId: "session", playerId: "jamie", status: "present", occurredAt: "2026-08-02T08:31:00.000Z" });
    const recovered = await DurableAttendanceQueue.open(store);
    expect(recovered.pending()).toHaveLength(1);
    expect(JSON.stringify(persisted)).not.toMatch(/medical|safeguarding|observation|note/i);
  });

  it("physically purges an item that expires after the queue has already opened", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T08:00:00Z"));
    let persisted: readonly import("@/features/coaching/attendance-queue").QueuedAttendanceAction[] = [];
    const store: AttendanceStore = { load: async () => [...persisted], save: async (items) => { persisted = [...items]; } };
    const queue = await DurableAttendanceQueue.open(store);
    await queue.enqueue({ organisationId: "org", sessionId: "session", playerId: "jamie", status: "present", occurredAt: new Date().toISOString() });
    vi.setSystemTime(new Date("2026-08-03T08:01:00Z"));
    expect(await queue.pruneExpired()).toBe(1);
    expect(queue.pending()).toHaveLength(0);
    expect(persisted).toHaveLength(0);
  });
});
