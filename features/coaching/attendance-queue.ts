export type AttendanceStatus = "expected" | "present" | "absent" | "late" | "left-early" | "excused" | "injured" | "observing" | "trialist" | "unknown" | "unexpected";

export interface AttendanceAction {
  organisationId: string;
  sessionId: string;
  playerId?: string;
  attendeeLabel?: string;
  status: AttendanceStatus;
  occurredAt: string;
}

export type QueuedAttendanceAction = AttendanceAction & { idempotencyKey: string; queuedAt: string; expiresAt: string };

function validateAction(action: AttendanceAction): void {
  if (![action.organisationId, action.sessionId].every((value) => value.trim()) || (!action.playerId?.trim() && !action.attendeeLabel?.trim())) throw new Error("Attendance scope is required.");
  if (Number.isNaN(Date.parse(action.occurredAt))) throw new Error("Attendance actions need a valid timestamp.");
}

export class AttendanceQueue {
  private readonly items = new Map<string, QueuedAttendanceAction>();

  pruneExpired(now = Date.now()): number {
    let removed = 0;
    for (const [key, item] of this.items) if (Date.parse(item.expiresAt) <= now) { this.items.delete(key); removed += 1; }
    return removed;
  }

  enqueue(action: AttendanceAction | QueuedAttendanceAction): QueuedAttendanceAction {
    validateAction(action);
    const attendeeKey = action.playerId ?? `guest:${action.attendeeLabel?.trim().toLowerCase()}`;
    const idempotencyKey = `${action.organisationId}:${action.sessionId}:${attendeeKey}:${action.occurredAt}`;
    // The 24-hour window is a retention control on how long a child identifier may
    // sit on this device, so it runs from when the action was queued, not from when
    // the attendance happened. Deriving it from `occurredAt` purged anything recorded
    // for a session that kicked off more than a day ago, which is ordinary use.
    const queuedAt = "queuedAt" in action ? action.queuedAt : new Date().toISOString();
    const expiresAt = "expiresAt" in action ? action.expiresAt : new Date(Date.parse(queuedAt) + 24 * 60 * 60 * 1000).toISOString();
    const safe: QueuedAttendanceAction = {
      organisationId: action.organisationId,
      sessionId: action.sessionId,
      playerId: action.playerId,
      attendeeLabel: action.attendeeLabel?.trim(),
      status: action.status,
      occurredAt: action.occurredAt,
      idempotencyKey,
      queuedAt,
      expiresAt,
    };
    this.items.set(idempotencyKey, safe);
    return structuredClone(safe);
  }

  pending(): QueuedAttendanceAction[] {
    this.pruneExpired();
    return [...this.items.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).map((item) => structuredClone(item));
  }

  acknowledge(idempotencyKey: string): boolean {
    return this.items.delete(idempotencyKey);
  }
}

export function resolveAttendanceConflict(remote: AttendanceAction, local: AttendanceAction) {
  validateAction(remote);
  validateAction(local);
  if (remote.organisationId !== local.organisationId || remote.sessionId !== local.sessionId || remote.playerId !== local.playerId || remote.attendeeLabel !== local.attendeeLabel) throw new Error("Attendance conflicts must refer to the same scoped record.");
  const resolved = Date.parse(local.occurredAt) >= Date.parse(remote.occurredAt) ? local : remote;
  return { resolved: structuredClone(resolved), strategy: "latest-action-wins" as const, remoteOccurredAt: remote.occurredAt, localOccurredAt: local.occurredAt };
}
