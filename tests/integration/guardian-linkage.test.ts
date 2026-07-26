import { describe, expect, it } from "vitest";

import { HouseholdAccessDeniedError } from "@/features/households/service";
import { DemoRepository } from "@/lib/demo/repository";
import { createRiversideDemoSeed } from "@/lib/demo/seed";

describe("guardian linkage", () => {
  it("returns linked children across a many-to-many household graph", () => {
    const repository = new DemoRepository(createRiversideDemoSeed());
    const summary = repository.getHouseholdSummary(
      "00000000-0000-4000-8000-000000000101",
      "00000000-0000-4000-8000-000000000501",
      "00000000-0000-4000-8000-000000000401",
      "00000000-0000-4000-8000-000000000301",
    );

    expect(summary.players).toHaveLength(2);
    expect(summary.guardianCount).toBe(1);
  });

  it("does not let a guardian enumerate another household or club", () => {
    const repository = new DemoRepository(createRiversideDemoSeed());

    expect(() =>
      repository.getHouseholdSummary(
        "00000000-0000-4000-8000-000000000101",
        "00000000-0000-4000-8000-000000000502",
        "00000000-0000-4000-8000-000000000401",
        "00000000-0000-4000-8000-000000000301",
      ),
    ).toThrow(HouseholdAccessDeniedError);
    expect(() => repository.snapshot("organisation-northfield")).toThrow(
      HouseholdAccessDeniedError,
    );
  });
});
