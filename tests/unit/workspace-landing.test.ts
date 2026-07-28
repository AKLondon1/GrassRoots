import { describe, expect, it } from "vitest";

import {
  getDefaultScreen,
  getDefaultScreenForRoles,
  parseAppRole,
  parseRequestedRole,
} from "@/lib/navigation/screen-registry";

describe("workspace landing", () => {
  it("lands a multi-role member on their highest-priority role's default screen", () => {
    expect(getDefaultScreenForRoles(["club", "parent"]).section).toBe(
      getDefaultScreen("club").section,
    );
  });

  it("lands a parent-only member on the parent default screen", () => {
    expect(getDefaultScreenForRoles(["parent"]).section).toBe(
      getDefaultScreen("parent").section,
    );
  });

  it("falls back to the parent default when no role is held", () => {
    expect(getDefaultScreenForRoles([]).section).toBe(
      getDefaultScreen("parent").section,
    );
  });

  it("returns undefined for an unknown requested role rather than defaulting", () => {
    expect(parseRequestedRole("nonsense")).toBeUndefined();
    expect(parseRequestedRole(undefined)).toBeUndefined();
    expect(parseRequestedRole("coach")).toBe("coach");
  });

  it("leaves parseAppRole's demo-mode default untouched", () => {
    expect(parseAppRole("nonsense")).toBe("parent");
    expect(parseAppRole(undefined)).toBe("parent");
  });
});
