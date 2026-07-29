import { describe, expect, it } from "vitest";

import {
  getDefaultScreen,
  getDefaultScreenForRoles,
  parseAppRole,
  parseRequestedRole,
} from "@/lib/navigation/screen-registry";

describe("workspace landing", () => {
  const clubDefault = getDefaultScreen("club");
  const parentDefault = getDefaultScreen("parent");

  it("lands a multi-role member on their highest-priority role's default screen", () => {
    expect(
      getDefaultScreenForRoles(["club", "parent"], [clubDefault.capability])
        .section,
    ).toBe(clubDefault.section);
  });

  it("lands a parent-only member on the parent default screen", () => {
    expect(
      getDefaultScreenForRoles(["parent"], [parentDefault.capability]).section,
    ).toBe(parentDefault.section);
  });

  it("never lands a member on a screen their capabilities cannot open", () => {
    // A club admin whose roles grant club:manage but not club:view is real: it is
    // exactly what the seeded club-admin role does. Landing them on the registered
    // default put them straight into "Overview is not available for this role".
    const capabilities = ["events:view"];
    const landing = getDefaultScreenForRoles(["club", "parent"], capabilities);

    expect(landing.section).not.toBe(clubDefault.section);
    expect(capabilities).toContain(landing.capability);
  });

  it("falls back to the role default when no capability permits any screen", () => {
    expect(getDefaultScreenForRoles(["club"], []).section).toBe(
      clubDefault.section,
    );
  });

  it("falls back to the parent default when no role is held", () => {
    expect(getDefaultScreenForRoles([], []).section).toBe(
      parentDefault.section,
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
