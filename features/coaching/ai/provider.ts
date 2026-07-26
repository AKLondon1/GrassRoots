import { z } from "zod";

export const coachingSuggestionSchema = z.object({
  title: z.string().min(1).max(80),
  summary: z.string().min(1).max(600),
  nextSteps: z.array(z.string().min(1).max(160)).min(1).max(3),
});

export interface SafeCoachingContext {
  playerDisplayName: string;
  objective: string;
  recentSessionThemes: readonly string[];
}

const providerInputKeys = new Set(["organisationId", "teamId", "playerDisplayName", "objective", "recentSessionThemes"]);
const sensitiveContent = /\b(medical|medication|allerg(?:y|ies|ic)|asthma|injur(?:y|ies|ed)|safeguard(?:ing)?|disclosure|diagnos(?:is|ed)|health|email|phone|address|emergency contact)\b/i;

export function assertProviderSafeInput(input: Record<string, unknown>): void {
  if (Object.keys(input).some((key) => !providerInputKeys.has(key))) throw new Error("Only approved fields can cross the provider boundary.");
  const allowedContent = [input.playerDisplayName, input.objective, ...(Array.isArray(input.recentSessionThemes) ? input.recentSessionThemes : [])];
  if (allowedContent.some((value) => typeof value === "string" && sensitiveContent.test(value))) throw new Error("Potentially sensitive content cannot cross the provider boundary.");
}

export function sanitizeCoachingContext(input: Record<string, unknown>): SafeCoachingContext {
  const schema = z.object({ playerDisplayName: z.string().min(1).max(80), objective: z.string().min(1).max(300), recentSessionThemes: z.array(z.string().min(1).max(80)).max(8) });
  return schema.parse({ playerDisplayName: input.playerDisplayName, objective: input.objective, recentSessionThemes: input.recentSessionThemes });
}

export function buildCoachingSuggestionRequest({ model, context }: { model: string; context: SafeCoachingContext }) {
  return {
    model,
    store: false as const,
    input: [
      { role: "developer" as const, content: "Draft a positive, age-appropriate development suggestion for human coach review. Do not infer health, safeguarding, diagnosis or personal characteristics." },
      { role: "user" as const, content: JSON.stringify(context) },
    ],
    text: {
      format: {
        type: "json_schema" as const,
        name: "coaching_suggestion",
        strict: true as const,
        schema: z.toJSONSchema(coachingSuggestionSchema),
      },
    },
  };
}

export type ParsedCoachingSuggestion =
  | { status: "ready"; suggestion: z.infer<typeof coachingSuggestionSchema> }
  | { status: "refused"; reason: string }
  | { status: "unparsed"; reason: string };

export function parseCoachingSuggestion(response: { status?: string; refusal?: string; output_text?: string }): ParsedCoachingSuggestion {
  if (response.refusal) return { status: "refused", reason: response.refusal };
  if (response.status !== "completed" || !response.output_text) return { status: "unparsed", reason: "The provider did not return a completed structured response." };
  try {
    const result = coachingSuggestionSchema.safeParse(JSON.parse(response.output_text));
    return result.success ? { status: "ready", suggestion: result.data } : { status: "unparsed", reason: "The provider output did not match the approved schema." };
  } catch {
    return { status: "unparsed", reason: "The provider output was not valid JSON." };
  }
}
