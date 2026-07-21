import { describe, expect, it } from "vitest";

import { HouseholdAccessDeniedError } from "@/features/households/service";
import { DemoRepository } from "@/lib/demo/repository";
import { createRiversideDemoSeed, riversideDemoIds } from "@/lib/demo/seed";

describe("guardian isolation", () => {
  it("denies cross-household and cross-organisation reads", () => {
    const repository = new DemoRepository(createRiversideDemoSeed());

    expect(() =>
      repository.getHouseholdSummary(
        riversideDemoIds.organisation,
        riversideDemoIds.households.taylor,
        riversideDemoIds.guardians.parent,
        riversideDemoIds.memberships.parent,
      ),
    ).toThrow(HouseholdAccessDeniedError);
    expect(() => repository.snapshot("organisation-northfield")).toThrow(
      HouseholdAccessDeniedError,
    );
  });
});
