// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type CookieWrite = {
  name: string;
  value: string;
  options: {
    httpOnly?: boolean;
    path?: string;
    sameSite?: "lax" | "strict" | "none";
    secure?: boolean;
  };
};

const boundary = vi.hoisted(() => ({
  cookieStore: {
    getAll: vi.fn(() => []),
    set: vi.fn(),
  },
  createServerClient: vi.fn(),
  setAll: undefined as
    | ((cookiesToSet: CookieWrite[]) => Promise<void> | void)
    | undefined,
}));

vi.mock("@/lib/env", () => ({
  environment: {
    dataMode: "supabase",
    public: {
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    },
  },
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => boundary.cookieStore),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: boundary.createServerClient,
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const sessionCookie: CookieWrite = {
  name: "sb-project-auth-token",
  value: "session-cookie",
  options: {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: true,
  },
};

describe("Route Handler Supabase cookies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundary.setAll = undefined;
    boundary.createServerClient.mockImplementation(
      (
        _url: string,
        _key: string,
        options: {
          cookies: {
            setAll: (cookiesToSet: CookieWrite[]) => Promise<void> | void;
          };
        },
      ) => {
        boundary.setAll = options.cookies.setAll;
        return { auth: {} };
      },
    );
  });

  it("writes SSR cookies to the supplied response with one setAll argument", async () => {
    const response = NextResponse.next();

    await createServerSupabaseClient(response);
    await boundary.setAll?.([sessionCookie]);

    expect(response.cookies.get("sb-project-auth-token")).toMatchObject({
      value: "session-cookie",
    });
    expect(boundary.cookieStore.set).not.toHaveBeenCalled();
  });

  it("falls back to the request cookie store when no response is supplied", async () => {
    await createServerSupabaseClient();
    await boundary.setAll?.([sessionCookie]);

    expect(boundary.cookieStore.set).toHaveBeenCalledWith(
      "sb-project-auth-token",
      "session-cookie",
      sessionCookie.options,
    );
  });
});
