import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({
  createReader: vi.fn(() => ({})),
  getUser: vi.fn().mockResolvedValue({
    data: { user: { id: "adult-coach" } },
    error: null,
  }),
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
  resolve: vi.fn().mockResolvedValue({
    status: "allowed",
    href: "/app/riverside-juniors/today",
  }),
  supabase: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: access.supabase,
}));
vi.mock("@/features/tenancy/authenticated-home", () => ({
  createSupabaseAuthenticatedHomeReader: access.createReader,
  resolveAuthenticatedHome: access.resolve,
}));
vi.mock("next/navigation", () => ({
  redirect: access.redirect,
}));
vi.mock("@/app/(auth)/sign-out/actions", () => ({
  signOutCurrentSession: access.signOut,
}));

import AuthenticatedHomePage from "@/app/app/page";

describe("authenticated home route", () => {
  it("redirects an authenticated member to their RLS-resolved workspace", async () => {
    access.supabase.mockResolvedValueOnce({
      auth: { getUser: access.getUser },
    });

    await expect(AuthenticatedHomePage()).rejects.toThrow("redirect");

    expect(access.resolve).toHaveBeenCalledWith({}, "adult-coach");
    expect(access.redirect).toHaveBeenCalledWith("/app/riverside-juniors/today");
  });

  it("redirects a missing session to the safe app return path", async () => {
    access.supabase.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });

    await expect(AuthenticatedHomePage()).rejects.toThrow("redirect");

    expect(access.redirect).toHaveBeenCalledWith("/sign-in?next=%2Fapp");
  });

  it("offers an unassigned adult a safe way to sign out and switch accounts", async () => {
    access.supabase.mockResolvedValueOnce({
      auth: { getUser: access.getUser },
    });
    access.resolve.mockResolvedValueOnce({ status: "invitation-required" });

    render(await AuthenticatedHomePage());

    expect(
      screen.getByRole("button", { name: "Sign out and switch account" }),
    ).toBeEnabled();
    expect(screen.getByText(/does not have an active GrassRoots organisation membership/i)).toBeVisible();
  });
});
