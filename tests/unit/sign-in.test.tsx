import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  requestMagicLinkForMode,
  type MagicLinkSender,
} from "@/app/(auth)/sign-in/actions";
import { SignInScreen } from "@/components/auth/sign-in-screen";
import { buildGoogleOAuthRequest } from "@/lib/supabase/oauth";

describe("sign in", () => {
  it("builds a Google callback from the configured canonical origin", () => {
    expect(
      buildGoogleOAuthRequest(
        "https://grassroots-beta.vercel.app",
        "/invite/secure-token",
        "https://grassroots-beta.vercel.app",
        "production",
      ),
    ).toEqual({
      nextPath: "/invite/secure-token",
      redirectTo:
        "https://grassroots-beta.vercel.app/auth/callback?next=%2Finvite%2Fsecure-token",
    });
  });

  it("rejects missing canonical origin in production", () => {
    expect(
      buildGoogleOAuthRequest(
        "https://grassroots-beta.vercel.app",
        "/app",
        undefined,
        "production",
      ),
    ).toBeNull();
  });

  it("rejects a mismatched request origin in production", () => {
    expect(
      buildGoogleOAuthRequest(
        "https://attacker.example",
        "/app",
        "https://grassroots-beta.vercel.app",
        "production",
      ),
    ).toBeNull();
  });

  it("normalises an external OAuth return path", () => {
    expect(
      buildGoogleOAuthRequest(
        "http://localhost:3000",
        "https://attacker.example",
        "http://localhost:3000",
        "development",
      )?.nextPath,
    ).toBe("/");
  });

  it("shows visibly labelled adult demo role entry links in demo mode", () => {
    render(<SignInScreen mode="demo" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in to GrassRoots" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/fictional adult accounts/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Parent demo" })).toHaveAttribute(
      "href",
      "/app/riverside-juniors/home?role=parent",
    );
    expect(screen.getByRole("link", { name: "Coach demo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Club admin demo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Platform demo" })).toBeInTheDocument();
  });

  it("offers both Google and email sign-in, and no demo controls, in Supabase mode", () => {
    // This assertion previously read "without email", and was the thing keeping the
    // magic-link route off the screen. The action, the form component and the tests
    // below have all existed since fe22ca8; only the screen never rendered the form.
    // Phase 14 reverses that, because Google-only means no human and no test can sign
    // in without a Google account.
    render(<SignInScreen mode="supabase" nextPath="/invite/raw-token" />);

    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Email me a sign-in link" }),
    ).toBeInTheDocument();
    // Both forms carry the same normalised return path.
    expect(
      [...document.querySelectorAll('input[name="next"]')].map((input) =>
        input.getAttribute("value"),
      ),
    ).toEqual(["/invite/raw-token", "/invite/raw-token"]);
    expect(screen.queryByRole("link", { name: /demo/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/prior approval or a valid GrassRoots club invitation/i),
    ).toBeVisible();
    expect(screen.getByText(/club invitation is still required/i)).toBeVisible();
  });

  it("offers no password field, in either mode", () => {
    // The magic-links-only decision, made assertable. A password input appearing here
    // would mean this codebase had started storing credentials, and with them a reset
    // flow, a strength policy and a credential-stuffing surface.
    for (const mode of ["supabase", "demo"] as const) {
      const { unmount } = render(<SignInScreen mode={mode} />);
      expect(document.querySelector('input[type="password"]')).toBeNull();
      expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
      unmount();
    }
  });

  it("shows a provider-specific recoverable error", () => {
    render(<SignInScreen authError="provider" mode="supabase" />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      /Google sign-in could not be started/i,
    );
  });

  it("returns a validation error without sending an invalid email", async () => {
    const sender = vi.fn<MagicLinkSender>();
    const formData = new FormData();
    formData.set("email", "not-an-email");

    const state = await requestMagicLinkForMode("supabase", formData, sender);

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.email).toMatch(/valid email/i);
    expect(sender).not.toHaveBeenCalled();
  });

  it("never reports fake success in demo mode", async () => {
    const sender = vi.fn<MagicLinkSender>();
    const formData = new FormData();
    formData.set("email", "alex@example.test");

    const state = await requestMagicLinkForMode("demo", formData, sender);

    expect(state).toEqual({
      status: "error",
      message: "Email sign-in is not available in demo mode.",
    });
    expect(sender).not.toHaveBeenCalled();
  });

  it("normalises and sends a valid email in Supabase mode", async () => {
    const sender = vi.fn<MagicLinkSender>().mockResolvedValue({ error: null });
    const formData = new FormData();
    formData.set("email", "  Alex@Example.Test ");

    const state = await requestMagicLinkForMode(
      "supabase",
      formData,
      sender,
      "https://grassroots.example/auth/callback",
    );

    expect(sender).toHaveBeenCalledWith(
      "alex@example.test",
      "https://grassroots.example/auth/callback",
    );
    expect(state.status).toBe("success");
    expect(state.message).toMatch(/sign-in link is on its way/i);
  });

  it("answers a registered and an unregistered address identically", async () => {
    // The enumeration guarantee. `shouldCreateUser: false` means Supabase reports an
    // error for an address with no account, so without this the form would answer
    // "does this parent have an account at this club" one address at a time.
    const formData = new FormData();
    formData.set("email", "alex@example.test");
    const registered = await requestMagicLinkForMode(
      "supabase",
      formData,
      vi.fn<MagicLinkSender>().mockResolvedValue({ error: null }),
    );
    const unregistered = await requestMagicLinkForMode(
      "supabase",
      formData,
      vi
        .fn<MagicLinkSender>()
        .mockResolvedValue({ error: { message: "User not found" } }),
    );

    expect(unregistered).toEqual(registered);
    expect(unregistered.status).toBe("success");
    // And the wording must not quietly assert a link was sent, because for an
    // unregistered address none was.
    expect(unregistered.message).not.toMatch(/we (have )?sent|check your email/i);
  });

  it("returns an inline error when the auth provider is unavailable", async () => {
    const sender = vi
      .fn<MagicLinkSender>()
      .mockRejectedValue(new Error("network unavailable"));
    const formData = new FormData();
    formData.set("email", "alex@example.test");

    await expect(
      requestMagicLinkForMode("supabase", formData, sender),
    ).resolves.toEqual({
      status: "error",
      message: "We could not send the sign-in link. Try again in a moment.",
    });
  });
});
