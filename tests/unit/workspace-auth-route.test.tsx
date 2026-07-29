import { describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({
  createReader: vi.fn(() => ({})),
  getUser: vi.fn().mockResolvedValue({
    data: { user: { id: "adult-coach" } },
    error: null,
  }),
  resolve: vi.fn().mockResolvedValue({
    status: "allowed",
    organisationId: "organisation-riverside",
    membershipId: "membership-coach",
    role: "coach",
    capabilities: ["team:view"],
  }),
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
}));

vi.mock("@/lib/env", () => ({
  environment: { dataMode: "supabase" },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: { getUser: access.getUser },
  }),
}));
vi.mock("@/features/tenancy/service", () => ({
  createSupabaseTenancyAccessReader: access.createReader,
  resolveProductionWorkspaceAccess: access.resolve,
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not found");
  }),
  redirect: access.redirect,
}));

import WorkspaceSectionPage from "@/app/app/[workspace]/[section]/page";

describe("Supabase workspace route", () => {
  it("uses auth.getUser and ignores a forged platform role query", async () => {
    const result = await WorkspaceSectionPage({
      params: Promise.resolve({
        section: "today",
        workspace: "riverside-juniors",
      }),
      searchParams: Promise.resolve({ role: "platform" }),
    });

    expect(access.getUser).toHaveBeenCalledOnce();
    // The forged role is forwarded, not trusted: resolveProductionWorkspaceAccess
    // honours a requested role only when the member holds it, so the resolved role
    // below stays "coach". That fallback is pinned in tenancy-service.test.ts.
    expect(access.resolve).toHaveBeenCalledWith(
      expect.anything(),
      "riverside-juniors",
      "adult-coach",
      "platform",
    );
    expect(result).toMatchObject({
      props: {
        capabilities: ["team:view"],
        isDemo: false,
        role: "coach",
      },
    });
  });

  it("redirects an unauthenticated request to a safe internal sign-in return path", async () => {
    access.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    await expect(
      WorkspaceSectionPage({
        params: Promise.resolve({
          section: "today",
          workspace: "riverside-juniors",
        }),
        searchParams: Promise.resolve({ role: "platform" }),
      }),
    ).rejects.toThrow("redirect");
    expect(access.redirect).toHaveBeenCalledWith(
      "/sign-in?next=%2Fapp%2Friverside-juniors%2Ftoday",
    );
  });
});
