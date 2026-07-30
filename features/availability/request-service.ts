/**
 * How many replies a manager is still waiting for.
 *
 * Pure by design. `now` is a parameter rather than a call to `new Date()`, so the
 * deadline logic is deterministic under test and a screen rendering several
 * instances judges them all against the same instant.
 *
 * Consumed by the coach schedule (Task 7) and the squad picker (Task 10).
 */

export interface OutstandingSummary {
  readonly eventInstanceId: string;
  /** Active players on the instance's team. Coaches and volunteers are excluded. */
  readonly expected: number;
  readonly replied: number;
  readonly outstanding: number;
  readonly deadlinePassed: boolean;
}

export interface InstanceDeadline {
  readonly id: string;
  readonly response_deadline: string | null;
}

export interface PlayerReply {
  readonly event_instance_id: string;
  readonly player_id: string;
}

export function outstandingResponses(
  instances: readonly InstanceDeadline[],
  responses: readonly PlayerReply[],
  expectedByInstance: ReadonlyMap<string, number>,
  now: Date,
): OutstandingSummary[] {
  // Counted as a set of player ids, not a row count. Two rows for one child, from
  // a resend or an edit, must not read as two replies.
  const repliedByInstance = new Map<string, Set<string>>();
  responses.forEach(({ event_instance_id, player_id }) => {
    const players = repliedByInstance.get(event_instance_id) ?? new Set<string>();
    players.add(player_id);
    repliedByInstance.set(event_instance_id, players);
  });

  return instances.map((instance) => {
    const expected = expectedByInstance.get(instance.id) ?? 0;
    const replied = repliedByInstance.get(instance.id)?.size ?? 0;
    return {
      eventInstanceId: instance.id,
      expected,
      replied,
      // Never negative. More replies than expected is possible when a player
      // leaves the team after replying, and "minus one outstanding" helps nobody.
      outstanding: Math.max(0, expected - replied),
      // A null deadline means replies stay open, so it has not passed.
      deadlinePassed: instance.response_deadline
        ? new Date(instance.response_deadline) < now
        : false,
    };
  });
}
