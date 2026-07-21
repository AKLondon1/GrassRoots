import { describe, expect, it } from "vitest";

import { DemoRepository } from "@/lib/demo/repository";
import { createRiversideDemoSeed } from "@/lib/demo/seed";

const organisationId = "00000000-0000-4000-8000-000000000101";

describe("fictional club setup", () => {
  it("keeps season, team, manager invitation and people in one organisation", () => {
    const repository = new DemoRepository(createRiversideDemoSeed());
    const setup = repository.getClubSetup(organisationId);

    expect(setup.organisation.slug).toBe("riverside-juniors");
    expect(setup.activeSeason.organisationId).toBe(organisationId);
    expect(setup.teams.find(({ name }) => name === "Under 7s")?.organisationId).toBe(
      organisationId,
    );
    expect(setup.managerInvitation).toMatchObject({
      organisationId,
      deliveryStatus: "not-sent",
    });
    expect(setup.managerInvitation.email).toMatch(/@example\.test$/);
  });

  it("describes demo mutations as local and non-persistent", () => {
    const repository = new DemoRepository(createRiversideDemoSeed());

    expect(repository.persistence).toEqual({
      mode: "demo",
      persistent: false,
      deliveryEnabled: false,
    });
  });
});
