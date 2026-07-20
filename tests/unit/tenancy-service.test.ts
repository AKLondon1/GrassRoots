import { describe, expect, it } from "vitest";

import { selectActiveMembership } from "@/features/tenancy/service";

describe("tenancy service", () => {
  it("selects only the requested organisation membership for an adult", () => {
    const memberships = [
      {
        id: "membership-riverside",
        organisationId: "organisation-riverside",
        userId: "adult-alex",
        status: "active" as const,
      },
      {
        id: "membership-northfield",
        organisationId: "organisation-northfield",
        userId: "adult-alex",
        status: "active" as const,
      },
    ];

    expect(
      selectActiveMembership(
        memberships,
        "adult-alex",
        "organisation-northfield",
      )?.id,
    ).toBe("membership-northfield");
  });

  it("does not fall back to another organisation", () => {
    expect(
      selectActiveMembership(
        [
          {
            id: "membership-riverside",
            organisationId: "organisation-riverside",
            userId: "adult-alex",
            status: "active",
          },
        ],
        "adult-alex",
        "organisation-northfield",
      ),
    ).toBeUndefined();
  });
});
