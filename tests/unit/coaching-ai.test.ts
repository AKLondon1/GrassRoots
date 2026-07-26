import { describe, expect, it } from "vitest";

import { assertProviderSafeInput, buildCoachingSuggestionRequest, parseCoachingSuggestion, sanitizeCoachingContext } from "@/features/coaching/ai/provider";

describe("coaching AI provider boundary", () => {
  it("is strict, non-storing and excludes sensitive fields", () => {
    const context = sanitizeCoachingContext({ playerDisplayName: "Jamie", objective: "Scan before receiving", recentSessionThemes: ["passing"], medical: "asthma", safeguarding: "private", privateObservation: "coach only" });
    expect(JSON.stringify(context)).not.toMatch(/asthma|safeguarding|coach only/i);
    const request = buildCoachingSuggestionRequest({ model: "gpt-5.6", context });
    expect(request.store).toBe(false);
    expect(request.text.format).toMatchObject({ type: "json_schema", strict: true });
  });

  it("rejects sensitive keys or content at the external provider boundary", () => {
    expect(() => assertProviderSafeInput({ playerDisplayName: "Jamie", objective: "Return after an asthma review", recentSessionThemes: ["passing"] })).toThrow(/sensitive/i);
    expect(() => assertProviderSafeInput({ playerDisplayName: "Jamie", objective: "Scan early", recentSessionThemes: ["passing"], privateObservation: "coach only" })).toThrow(/approved fields/i);
  });

  it("handles refusal and unparsed output explicitly without writing data", () => {
    expect(parseCoachingSuggestion({ status: "incomplete", refusal: "I cannot assist." })).toEqual({ status: "refused", reason: "I cannot assist." });
    expect(parseCoachingSuggestion({ status: "completed", output_text: "not-json" }).status).toBe("unparsed");
  });
});
