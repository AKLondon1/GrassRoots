import { describe, expect, it } from "vitest";

import { outstandingResponses } from "@/features/availability/request-service";

const NOW = new Date("2026-08-05T12:00:00Z");

describe("outstandingResponses", () => {
  it("counts outstanding replies per instance", () => {
    const [summary] = outstandingResponses(
      [{ id: "e1", response_deadline: "2026-08-06T18:00:00Z" }],
      [{ event_instance_id: "e1", player_id: "p1" }],
      new Map([["e1", 5]]),
      NOW,
    );

    expect(summary).toEqual({
      eventInstanceId: "e1",
      expected: 5,
      replied: 1,
      outstanding: 4,
      deadlinePassed: false,
    });
  });

  it("marks a passed deadline and never reports negative outstanding", () => {
    const [summary] = outstandingResponses(
      [{ id: "e1", response_deadline: "2026-08-04T18:00:00Z" }],
      [
        { event_instance_id: "e1", player_id: "p1" },
        { event_instance_id: "e1", player_id: "p2" },
      ],
      new Map([["e1", 1]]),
      NOW,
    );

    expect(summary!.deadlinePassed).toBe(true);
    expect(summary!.outstanding).toBe(0);
  });

  it("treats a null deadline as never passed", () => {
    const [summary] = outstandingResponses(
      [{ id: "e1", response_deadline: null }],
      [],
      new Map([["e1", 3]]),
      NOW,
    );

    expect(summary!.deadlinePassed).toBe(false);
    expect(summary!.outstanding).toBe(3);
  });

  it("counts one child once even when two rows exist for them", () => {
    const [summary] = outstandingResponses(
      [{ id: "e1", response_deadline: null }],
      [
        { event_instance_id: "e1", player_id: "p1" },
        { event_instance_id: "e1", player_id: "p1" },
      ],
      new Map([["e1", 4]]),
      NOW,
    );

    expect(summary!.replied).toBe(1);
    expect(summary!.outstanding).toBe(3);
  });

  it("does not let one instance's replies count towards another", () => {
    const [first, second] = outstandingResponses(
      [
        { id: "e1", response_deadline: null },
        { id: "e2", response_deadline: null },
      ],
      [
        { event_instance_id: "e1", player_id: "p1" },
        { event_instance_id: "e1", player_id: "p2" },
      ],
      new Map([
        ["e1", 3],
        ["e2", 3],
      ]),
      NOW,
    );

    expect(first!.replied).toBe(2);
    expect(second!.replied).toBe(0);
    expect(second!.outstanding).toBe(3);
  });

  it("reports nothing expected for an instance with no squad recorded", () => {
    const [summary] = outstandingResponses(
      [{ id: "e1", response_deadline: null }],
      [],
      new Map(),
      NOW,
    );

    expect(summary!.expected).toBe(0);
    expect(summary!.outstanding).toBe(0);
  });

  it("treats a deadline exactly at now as not yet passed", () => {
    const [summary] = outstandingResponses(
      [{ id: "e1", response_deadline: NOW.toISOString() }],
      [],
      new Map([["e1", 1]]),
      NOW,
    );

    expect(summary!.deadlinePassed).toBe(false);
  });

  it("returns one summary per instance, in the order given", () => {
    const summaries = outstandingResponses(
      [
        { id: "e2", response_deadline: null },
        { id: "e1", response_deadline: null },
      ],
      [],
      new Map(),
      NOW,
    );

    expect(summaries.map((summary) => summary.eventInstanceId)).toEqual(["e2", "e1"]);
  });
});
