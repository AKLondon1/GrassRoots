import { describe, expect, it } from "vitest";

import { createCalendarRouteHandler, GET } from "@/app/api/calendar/[token]/route";
import { riversideDemoCalendarToken } from "@/lib/demo/seed";

describe("private calendar route", () => {
  it("serves a redacted ICS feed for the active demo token", async () => {
    const response = await GET(new Request(`http://localhost/api/calendar/${riversideDemoCalendarToken}`), {
      params: Promise.resolve({ token: riversideDemoCalendarToken }),
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    expect(body).toContain("Under 11s training");
    expect(body).not.toContain("Jamie Morgan");
    expect(body).not.toContain("available");
  });

  it("returns not found without disclosing whether a token was revoked or unknown", async () => {
    const revokedHandler = createCalendarRouteHandler(() => ({
      async findCalendarToken() { return { id: "token-1", organisationId: "org-1", tokenHash: "hash", revokedAt: "2026-07-21T12:00:00.000Z" }; },
      async listCalendarEvents() { return []; },
    }));
    const response = await revokedHandler(new Request(`http://localhost/api/calendar/${riversideDemoCalendarToken}`), {
      params: Promise.resolve({ token: riversideDemoCalendarToken }),
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Calendar not found");
  });
});
