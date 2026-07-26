import { describe, expect, it } from "vitest";

import { createAuditedExport, createPersistedExport, escapeCsvCell } from "@/features/operations/exports";
import { searchKnowledge } from "@/features/operations/search";
import { createSupportSession, isSupportSessionActive } from "@/features/operations/support";

describe("club operations", () => {
  it("searches only records allowed by the actor's capabilities", () => {
    const results = searchKnowledge(
      [
        { id: "public", title: "Pitch handbook", kind: "document", requiredCapability: "documents:manage", text: "booking rules" },
        { id: "private", title: "Welfare case", kind: "audit", requiredCapability: "safeguarding:view", text: "restricted" },
      ],
      "pitch",
      ["documents:manage"],
    );
    expect(results.map(({ id }) => id)).toEqual(["public"]);
    expect(searchKnowledge(results, "", ["documents:manage"])).toEqual([]);
  });

  it("neutralises spreadsheet formula cells and watermarks exports", () => {
    expect(escapeCsvCell("=HYPERLINK(\"bad\")")).toBe("\"'=HYPERLINK(\"\"bad\"\")\"");
    expect(escapeCsvCell("\t=1+1")).toBe("'\t=1+1");
    const result = createAuditedExport({
      organisationId: "org-1",
      organisationName: "Riverside Juniors",
      actorMembershipId: "member-1",
      capability: "reports:view",
      format: "csv",
      title: "Pitch allocation",
      rows: [{ Team: "Under 11s", Notes: "+unsafe" }],
      now: "2026-07-21T12:00:00.000Z",
    });
    expect(result.content).toContain("GrassRoots · Riverside Juniors");
    expect(result.content).toContain("'+unsafe");
    expect(result.audit.action).toBe("export.created");
  });

  it("persists the audit record before returning an export", async () => {
    const records: unknown[] = [];
    const result = await createPersistedExport({
      organisationId: "org-1", organisationName: "Riverside Juniors", actorMembershipId: "member-1",
      capability: "reports:view", format: "pdf", title: "Facilities", rows: [], now: "2026-07-21T12:00:00.000Z",
    }, { append: async (record) => { records.push(record); } });
    expect(records).toHaveLength(1);
    expect(result.content).toContain("%PDF-1.4");
  });

  it("requires a reason and expires support access", () => {
    expect(() => createSupportSession({ organisationId: "org-1", actorId: "operator-1", reason: " ", now: "2026-07-21T12:00:00.000Z", durationMinutes: 30 })).toThrow(/reason/i);
    const session = createSupportSession({ organisationId: "org-1", actorId: "operator-1", reason: "Investigate booking reference GR-18", now: "2026-07-21T12:00:00.000Z", durationMinutes: 30 });
    expect(isSupportSessionActive(session, "2026-07-21T12:29:59.000Z")).toBe(true);
    expect(isSupportSessionActive(session, "2026-07-21T12:30:00.000Z")).toBe(false);
    expect(session.audit.action).toBe("support.session.started");
  });
});
