// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  createClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: auth.createClient,
}));

import { GET } from "@/app/(auth)/auth/callback/route";
import { NextRequest, type NextResponse } from "next/server";

function configureClient({
  exchangeError = null,
  user = null,
  writeSessionCookie = false,
}: {
  exchangeError?: { message: string } | null;
  user?: { id: string } | null;
  writeSessionCookie?: boolean;
}) {
  auth.exchangeCodeForSession.mockResolvedValue({ error: exchangeError });
  auth.getUser.mockResolvedValue({
    data: { user },
    error: user ? null : { message: "No authenticated user" },
  });
  auth.createClient.mockImplementation(async (response: NextResponse) => {
    if (writeSessionCookie) {
      response.cookies.set("sb-project-auth-token", "session-cookie", {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: true,
      });
    }
    return {
      auth: {
        exchangeCodeForSession: auth.exchangeCodeForSession,
        getUser: auth.getUser,
      },
    };
  });
}

describe("OAuth callback Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("attaches the PKCE session cookie to the redirect response", async () => {
    configureClient({ writeSessionCookie: true });

    const response = await GET(
      new NextRequest(
        "https://grassroots.example/auth/callback?code=single-use-code&next=%2Fapp",
      ),
    );

    expect(auth.exchangeCodeForSession).toHaveBeenCalledOnce();
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("single-use-code");
    expect(response.headers.get("location")).toBe(
      "https://grassroots.example/app",
    );
    expect(response.cookies.get("sb-project-auth-token")).toMatchObject({
      value: "session-cookie",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("creates the Supabase client only once per request", async () => {
    configureClient({ writeSessionCookie: true });

    await GET(
      new NextRequest(
        "https://grassroots.example/auth/callback?code=single-use-code",
      ),
    );

    expect(auth.createClient).toHaveBeenCalledOnce();
  });

  it("accepts an already-consumed code when the request has a valid session", async () => {
    configureClient({
      exchangeError: { message: "PKCE code has already been consumed" },
      user: { id: "returning-user" },
    });

    const response = await GET(
      new NextRequest(
        "https://grassroots.example/auth/callback?code=consumed-code&next=%2Fapp",
      ),
    );

    expect(auth.exchangeCodeForSession).toHaveBeenCalledOnce();
    expect(auth.getUser).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe(
      "https://grassroots.example/app",
    );
  });

  it("rejects a failed exchange when no authenticated session exists", async () => {
    configureClient({
      exchangeError: { message: "Invalid PKCE code" },
      user: null,
    });

    const response = await GET(
      new NextRequest(
        "https://grassroots.example/auth/callback?code=invalid-code&next=%2Fapp",
      ),
    );

    expect(auth.exchangeCodeForSession).toHaveBeenCalledOnce();
    expect(auth.getUser).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe(
      "https://grassroots.example/sign-in?error=callback",
    );
  });
});
