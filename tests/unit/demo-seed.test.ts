import { describe, expect, it } from "vitest";

import { listDemoSessions } from "@/lib/demo/session";
import { createRiversideDemoSeed } from "@/lib/demo/seed";

describe("Riverside Juniors demo seed", () => {
  it("is deterministic, fictional and contains the AC-01 setup slice", () => {
    const first = createRiversideDemoSeed();
    const second = createRiversideDemoSeed();

    expect(second).toEqual(first);
    expect(first.organisation).toMatchObject({
      name: "Riverside Juniors",
      slug: "riverside-juniors",
    });
    expect(first.seasons).toHaveLength(1);
    expect(first.teams.map(({ name }) => name)).toEqual([
      "Under 7s",
      "Under 11s",
    ]);
    expect(first.teams.every(({ organisationId }) => organisationId === first.organisation.id)).toBe(true);
  });

  it("maps only adult demo subjects to users and never maps a player to auth", () => {
    const seed = createRiversideDemoSeed();
    const sessionSubjectIds = listDemoSessions().map(({ subject }) => subject.id);

    expect(seed.adults.map(({ userId }) => userId)).toEqual(
      expect.arrayContaining(sessionSubjectIds),
    );
    expect(seed.players.every((player) => !("userId" in player))).toBe(true);
    expect(seed.adults.every(({ email }) => email.endsWith("@example.test"))).toBe(true);
  });

  it("includes deterministic, fictional finance and governance acceptance data", () => {
    const seed = createRiversideDemoSeed();
    expect(seed.financeGovernance.invoice).toMatchObject({ currency: "GBP", totalPence: 12500, provider: "manual-development" });
    expect(seed.financeGovernance.consent.version).toBe(3);
    expect(seed.financeGovernance.platformSubscription.kind).toBe("platform-subscription");
    expect(JSON.stringify(seed.financeGovernance.sensitiveAccess)).not.toMatch(/body|clinicalNotes|detail/i);
  });
});
