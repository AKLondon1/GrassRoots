import { describe, expect, it } from "vitest";

import {
  appRoles,
  getScreensForRole,
  screenRegistry,
} from "@/lib/navigation/screen-registry";

const expectedScreenIds = {
  parent: ["home", "actions", "schedule", "payments", "help"],
  coach: ["today", "team", "calendar", "training", "players"],
  club: ["overview", "teams", "people", "pitch-planner", "safeguarding"],
  platform: ["organisations", "plans", "feature-flags", "health", "audited-access"],
} as const;

describe("screen registry", () => {
  it("registers the required screen families for every application role", () => {
    expect(appRoles).toEqual(["parent", "coach", "club", "platform"]);

    for (const role of appRoles) {
      const ids = getScreensForRole(role).map((screen) => screen.id);
      expect(ids).toEqual(expect.arrayContaining([...expectedScreenIds[role]]));
    }
  });

  it("gives every screen capability and complete state copy", () => {
    for (const screen of screenRegistry) {
      expect(screen.capability).toMatch(/^[a-z]+:[a-z-]+$/);
      expect(screen.componentKind).toMatch(/^(agenda|board|calendar|detail|directory|form|list|planner|report|settings)$/);
      expect(screen.states.loading).toMatch(/…$/);
      expect(screen.states.empty.title).not.toBe("");
      expect(screen.states.empty.description).not.toBe("");
      expect(screen.states.error).not.toBe("");
      expect(screen.states.denied).not.toBe("");
    }
  });
});
