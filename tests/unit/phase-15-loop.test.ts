import { describe, expect, it } from "vitest";

import { createIterationPlan } from "@/scripts/run-phase-15-loop.mjs";

describe("Phase 15 local loop", () => {
  it("defines three complete iterations with no remote reset surface", () => {
    const plan = createIterationPlan();

    expect(plan).toHaveLength(3);
    for (const iteration of plan) {
      const reset = iteration.steps.find((step) => step.name === "reset local database");
      expect(reset).toMatchObject({
        tool: "supabase",
        args: ["db", "reset", "--local"],
      });

      const serialized = JSON.stringify(iteration);
      expect(serialized).not.toContain("--linked");
      expect(serialized).not.toContain("--db-url");
      expect(serialized).not.toContain("mxpuicrkfnyychmwqhus");
      expect(iteration.steps.map((step) => step.name)).toEqual([
        "reset local database",
        "read local service status",
        "seed confirmed auth identities",
        "preflight auth",
        "preflight database",
        "pgTAP",
        "Vitest",
        "typecheck",
        "lint",
        "production build",
        "demo browser suite",
        "signed-in browser suite",
      ]);
    }
  });
});
