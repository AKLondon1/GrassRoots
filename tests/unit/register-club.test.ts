import { describe, expect, it, vi } from "vitest";

import { createClubForMode } from "@/app/(marketing)/register-club/actions";

describe("club registration", () => {
  it("validates and creates an organisation for an authenticated production account", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "org-1", error: null });
    const form = new FormData();
    form.set("name", "Riverside Juniors");
    form.set("slug", "riverside-juniors");
    await expect(createClubForMode("supabase", form, rpc)).resolves.toEqual({ status: "created", message: "Club created.", workspace: "riverside-juniors" });
    expect(rpc).toHaveBeenCalledWith("create_organisation", { organisation_name: "Riverside Juniors", organisation_slug: "riverside-juniors" });
  });

  it("never pretends demo registration persisted", async () => {
    const rpc = vi.fn();
    const form = new FormData();
    form.set("name", "Demo Club");
    form.set("slug", "demo-club");
    await expect(createClubForMode("demo", form, rpc)).resolves.toMatchObject({ status: "error", message: expect.stringMatching(/demo/i) });
    expect(rpc).not.toHaveBeenCalled();
  });
});
