import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  requestMagicLinkForMode,
  type MagicLinkSender,
} from "@/app/(auth)/sign-in/actions";
import { SignInScreen } from "@/components/auth/sign-in-screen";

describe("sign in", () => {
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

  it("renders the real email magic-link form only in Supabase mode", () => {
    render(<SignInScreen mode="supabase" />);

    expect(screen.getByLabelText("Email address")).toHaveAttribute("type", "email");
    expect(
      screen.getByRole("button", { name: "Email me a sign-in link" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /demo/i })).not.toBeInTheDocument();
  });

  it("preserves a safe invitation return path through magic-link sign in", () => {
    render(<SignInScreen mode="supabase" nextPath="/invite/raw-token" />);

    expect(
      document.querySelector('input[name="next"]'),
    ).toHaveAttribute("value", "/invite/raw-token");
  });

  it("shows an honest callback error", () => {
    render(<SignInScreen callbackError mode="supabase" />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      /sign-in link could not be completed/i,
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
    expect(state.message).toMatch(/check your email/i);
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
