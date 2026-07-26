import { describe, expect, it } from "vitest";

import {
  resolveAuthenticatedHome,
  type AuthenticatedHomeReader,
} from "@/features/tenancy/authenticated-home";

describe("authenticated home", () => {
  it("routes an assigned adult to the first active workspace", async () => {
    const reader: AuthenticatedHomeReader = {
      async findFirstActiveWorkspace() {
        return { workspace: "riverside-juniors", roleKey: "coach" };
      },
    };

    await expect(
      resolveAuthenticatedHome(reader, "adult-1"),
    ).resolves.toEqual({
      status: "allowed",
      href: "/app/riverside-juniors/today",
    });
  });

  it("denies an authenticated adult without an active assigned membership", async () => {
    const reader: AuthenticatedHomeReader = {
      async findFirstActiveWorkspace() {
        return null;
      },
    };

    await expect(
      resolveAuthenticatedHome(reader, "adult-uninvited"),
    ).resolves.toEqual({ status: "invitation-required" });
  });
});
