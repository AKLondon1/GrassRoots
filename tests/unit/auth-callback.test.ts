import { describe, expect, it, vi } from "vitest";

import {
  completeAuthCallback,
  createAuthResponseHeaders,
  isConsumedFlowStateError,
} from "@/lib/supabase/auth-callback";

describe("Supabase auth callback", () => {
  it("marks session-writing responses private and non-cacheable", () => {
    const headers = createAuthResponseHeaders();

    expect(headers.get("cache-control")).toMatch(/private/);
    expect(headers.get("cache-control")).toMatch(/no-store/);
    expect(headers.get("pragma")).toBe("no-cache");
  });

  it("exchanges a PKCE code and accepts only an internal next path", async () => {
    const exchangeCode = vi.fn().mockResolvedValue({ error: null });

    await expect(
      completeAuthCallback(
        "https://grassroots.example/auth/callback?code=secure-code&next=%2Fapp",
        exchangeCode,
      ),
    ).resolves.toEqual({ destination: "/app", status: "success" });
    expect(exchangeCode).toHaveBeenCalledWith("secure-code");
  });

  it("routes a successful callback without a return path to authenticated home", async () => {
    await expect(
      completeAuthCallback(
        "https://grassroots-beta.vercel.app/auth/callback?code=secure-code",
        async () => ({ error: null }),
      ),
    ).resolves.toEqual({ destination: "/app", status: "success" });
  });

  it("rejects external redirects and reports a failed exchange", async () => {
    const exchangeCode = vi.fn().mockResolvedValue({
      error: { message: "expired" },
    });

    await expect(
      completeAuthCallback(
        "https://grassroots.example/auth/callback?code=expired&next=https://evil.example",
        exchangeCode,
      ),
    ).resolves.toEqual({ destination: "/sign-in?error=callback", status: "error" });
  });

  it("completes sign-in when a consumed code is retried with a valid session", async () => {
    const exchangeCode = vi.fn().mockResolvedValue({
      error: { message: "PKCE code has already been consumed" },
    });
    const hasValidSession = vi.fn().mockResolvedValue(true);

    await expect(
      completeAuthCallback(
        "https://grassroots.example/auth/callback?code=consumed&next=%2Fapp",
        exchangeCode,
        hasValidSession,
      ),
    ).resolves.toEqual({ destination: "/app", status: "success" });
    expect(hasValidSession).toHaveBeenCalledOnce();
  });

  it("redirects a concurrent flow-state duplicate to the destination without a session", async () => {
    const exchangeCode = vi.fn().mockResolvedValue({
      error: {
        code: "flow_state_not_found",
        message: "invalid flow state, no valid flow state found",
      },
    });
    const hasValidSession = vi.fn().mockResolvedValue(false);

    await expect(
      completeAuthCallback(
        "https://grassroots.example/auth/callback?code=raced&next=%2Fapp",
        exchangeCode,
        hasValidSession,
      ),
    ).resolves.toEqual({ destination: "/app", status: "success" });
    expect(hasValidSession).not.toHaveBeenCalled();
  });

  it("recognises flow-state duplicates by message when no error code is present", async () => {
    const exchangeCode = vi.fn().mockResolvedValue({
      error: { message: "No valid flow state found" },
    });

    await expect(
      completeAuthCallback(
        "https://grassroots.example/auth/callback?code=raced&next=%2Fapp",
        exchangeCode,
        vi.fn().mockResolvedValue(false),
      ),
    ).resolves.toEqual({ destination: "/app", status: "success" });
  });

  it("reports an error when the exchange fails and no session exists", async () => {
    const exchangeCode = vi.fn().mockResolvedValue({
      error: { message: "invalid code" },
    });
    const hasValidSession = vi.fn().mockResolvedValue(false);

    await expect(
      completeAuthCallback(
        "https://grassroots.example/auth/callback?code=bad&next=%2Fapp",
        exchangeCode,
        hasValidSession,
      ),
    ).resolves.toEqual({ destination: "/sign-in?error=callback", status: "error" });
  });

  it("does not consult the session check when the exchange succeeds", async () => {
    const exchangeCode = vi.fn().mockResolvedValue({ error: null });
    const hasValidSession = vi.fn().mockResolvedValue(false);

    await expect(
      completeAuthCallback(
        "https://grassroots.example/auth/callback?code=fresh&next=%2Fapp",
        exchangeCode,
        hasValidSession,
      ),
    ).resolves.toEqual({ destination: "/app", status: "success" });
    expect(hasValidSession).not.toHaveBeenCalled();
  });

  it("rejects backslash network-path redirects", async () => {
    const exchangeCode = vi.fn().mockResolvedValue({ error: null });

    await expect(
      completeAuthCallback(
        "https://grassroots.example/auth/callback?code=ok&next=%2F%5Cevil.example",
        exchangeCode,
      ),
    ).resolves.toEqual({ destination: "/app", status: "success" });
  });
});

describe("isConsumedFlowStateError", () => {
  it("matches Supabase flow-state codes and messages only", () => {
    expect(
      isConsumedFlowStateError({ code: "flow_state_not_found", message: "404" }),
    ).toBe(true);
    expect(
      isConsumedFlowStateError({ code: "flow_state_expired", message: "404" }),
    ).toBe(true);
    expect(
      isConsumedFlowStateError({
        message: "invalid flow state, no valid flow state found",
      }),
    ).toBe(true);

    expect(isConsumedFlowStateError(null)).toBe(false);
    expect(isConsumedFlowStateError({ message: "Invalid PKCE code" })).toBe(false);
    expect(
      isConsumedFlowStateError({
        code: "bad_oauth_state",
        message: "OAuth state parameter missing",
      }),
    ).toBe(false);
    expect(
      isConsumedFlowStateError({ message: "access_denied by the provider" }),
    ).toBe(false);
  });
});
