import { describe, expect, it } from "vitest";

import {
  appRoles,
  getScreensForRole,
  screenRegistry,
} from "@/lib/navigation/screen-registry";
import * as navigation from "@/lib/navigation/screen-registry";

const expectedScreenIds = {
  parent: ["home", "actions", "schedule", "payments", "help"],
  coach: ["today", "team", "calendar", "training", "players"],
  club: ["overview", "teams", "people", "pitch-planner", "safeguarding"],
  platform: ["organisations", "plans", "feature-flags", "health", "audited-access"],
} as const;

describe("screen registry", () => {
  it("does not manufacture access policy from registered screens", () => {
    expect("getCapabilitiesForRole" in navigation).toBe(false);
  });

  it("registers the required screen families for every application role", () => {
    expect(appRoles).toEqual(["parent", "coach", "club", "platform"]);

    for (const role of appRoles) {
      const ids = getScreensForRole(role).map((screen) => screen.id);
      expect(ids).toEqual(expect.arrayContaining([...expectedScreenIds[role]]));
    }
  });

  it("gives every screen capability and complete state copy", () => {
    for (const screen of screenRegistry) {
      expect(screen).toMatchObject({
        section: screen.id,
        path: `/app/[workspace]/${screen.id}`,
      });
      expect(screen.capability).toMatch(/^[a-z]+:[a-z-]+$/);
      expect(screen.componentKind).toMatch(/^(agenda|board|calendar|detail|directory|form|list|planner|report|settings)$/);
      expect(screen.states.loading).toMatch(/…$/);
      expect(screen.states.empty.title).not.toBe("");
      expect(screen.states.empty.description).not.toBe("");
      expect(screen.states.error).not.toBe("");
      expect(screen.states.denied).not.toBe("");
    }
  });

  it("resolves allowed, capability-denied, role-denied, and unknown sections", () => {
    const registryApi = navigation as unknown as {
      resolveScreenSection?: (input: {
        capabilities: readonly string[];
        role: "parent" | "coach";
        section: string;
      }) =>
        | { status: "allowed"; screen: { id: string } }
        | { status: "denied"; screen: { id: string } }
        | { status: "unknown" };
    };

    expect(registryApi.resolveScreenSection).toBeTypeOf("function");
    const resolve = registryApi.resolveScreenSection!;

    expect(
      resolve({ role: "parent", section: "home", capabilities: ["family:view"] }),
    ).toMatchObject({ status: "allowed", screen: { id: "home" } });
    expect(
      resolve({ role: "parent", section: "home", capabilities: [] }),
    ).toMatchObject({ status: "denied", screen: { id: "home" } });
    expect(
      resolve({ role: "parent", section: "today", capabilities: ["family:view"] }),
    ).toMatchObject({ status: "denied", screen: { id: "today" } });
    expect(
      resolve({ role: "parent", section: "not-a-screen", capabilities: [] }),
    ).toEqual({ status: "unknown" });
  });

  it("builds encoded workspace links from literal registry paths", () => {
    const registryApi = navigation as unknown as {
      getScreenHref?: (
        workspace: string,
        screen: (typeof screenRegistry)[number],
        role: "parent",
      ) => string;
    };

    expect(registryApi.getScreenHref).toBeTypeOf("function");
    expect(registryApi.getScreenHref!("Riverside Juniors", getScreensForRole("parent")[0], "parent"))
      .toBe("/app/Riverside%20Juniors/home?role=parent");
  });
});
