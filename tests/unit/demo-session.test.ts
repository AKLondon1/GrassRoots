import { describe, expect, it } from "vitest";

import { getDemoSession, listDemoSessions } from "@/lib/demo/session";

describe("demo sessions", () => {
  it("contains only explicit non-persistent adult previews", () => {
    const sessions = listDemoSessions();

    expect(sessions).toHaveLength(4);
    expect(sessions.every((session) => session.mode === "demo")).toBe(true);
    expect(sessions.every((session) => session.persistent === false)).toBe(true);
    expect(sessions.every((session) => session.subject.kind === "adult")).toBe(true);
    expect(sessions.map((session) => session.role)).toEqual([
      "parent",
      "coach",
      "club",
      "platform",
    ]);
  });

  it("selects capabilities and an organisation scope for the requested role", () => {
    const session = getDemoSession("coach");

    expect(session.capabilities).toContain("events:manage");
    expect(session.scope).toEqual({
      kind: "organisation",
      organisationId: session.organisation.id,
    });
    expect(session.organisation.slug).toBe("riverside-juniors");
  });
});
