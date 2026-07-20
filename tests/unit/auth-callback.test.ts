import { describe, expect, it, vi } from "vitest";

import {
  completeAuthCallback,
  createAuthResponseHeaders,
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

  it("rejects backslash network-path redirects", async () => {
    const exchangeCode = vi.fn().mockResolvedValue({ error: null });

    await expect(
      completeAuthCallback(
        "https://grassroots.example/auth/callback?code=ok&next=%2F%5Cevil.example",
        exchangeCode,
      ),
    ).resolves.toEqual({ destination: "/", status: "success" });
  });
});
