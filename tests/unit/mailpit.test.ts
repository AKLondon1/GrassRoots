import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractLocalConfirmationUrl,
  waitForMagicLink,
} from "@/tests/e2e/support/mailpit";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractLocalConfirmationUrl", () => {
  it("extracts the local confirmation URL from a plain-text message", () => {
    const url = extractLocalConfirmationUrl({
      Text: "Follow http://localhost:54321/auth/v1/verify?token=abc&type=magiclink&redirect_to=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback",
      HTML: "",
    });

    expect(url).toContain("/auth/v1/verify?");
    expect(new URL(url).searchParams.get("token")).toBe("abc");
  });

  it("decodes HTML entities in a custom confirmation link", () => {
    const url = extractLocalConfirmationUrl({
      Text: "",
      HTML:
        '<p><a href="http://localhost:54321/auth/v1/verify?token=custom&amp;type=magiclink&amp;redirect_to=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback">Sign in</a></p>',
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get("token")).toBe("custom");
    expect(parsed.searchParams.get("type")).toBe("magiclink");
    expect(parsed.searchParams.get("redirect_to")).toBe(
      "http://localhost:3000/auth/callback",
    );
  });

  it("accepts the exact IPv4 loopback origin emitted by the local stack", () => {
    const url = extractLocalConfirmationUrl({
      Text:
        "http://127.0.0.1:54321/auth/v1/verify?token=loopback&type=magiclink",
      HTML: "",
    });

    expect(new URL(url).origin).toBe("http://127.0.0.1:54321");
  });

  it.each([
    "No confirmation link is present.",
    "https://localhost:54321/auth/v1/verify?token=wrong-scheme",
    "http://127.0.0.2:54321/auth/v1/verify?token=wrong-host",
    "http://localhost:54322/auth/v1/verify?token=wrong-port",
    "http://localhost:54321/auth/v1/token?token=wrong-path",
  ])("rejects a body without an allowed local confirmation link: %s", (body) => {
    expect(() => extractLocalConfirmationUrl({ Text: body, HTML: "" })).toThrow(
      "local confirmation link",
    );
  });
});

describe("waitForMagicLink", () => {
  it("loads the newest eligible message for the exact recipient", async () => {
    const confirmationUrl =
      "http://localhost:54321/auth/v1/verify?token=fresh&type=magiclink";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            messages: [
              {
                ID: "wrong-recipient",
                To: [{ Address: "someone.else@example.test" }],
                Created: "2026-08-01T09:59:59.000Z",
              },
              {
                ID: "too-old",
                To: [{ Address: "alex.morgan@example.test" }],
                Created: "2026-08-01T09:59:59.000Z",
              },
              {
                ID: "fresh-message",
                To: [{ Address: "alex.morgan@example.test" }],
                Created: "2026-08-01T10:00:01.000Z",
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ Text: confirmationUrl, HTML: "" }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      waitForMagicLink({
        email: "alex.morgan@example.test",
        requestedAfter: new Date("2026-08-01T10:00:00.000Z"),
        timeoutMs: 100,
      }),
    ).resolves.toBe(confirmationUrl);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:54324/api/v1/message/fresh-message",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
