const correctableFields = new Set(["displayName", "guardianEmail"]);

export function createCorrectionRequest(input: { userId: string; field: string; proposedValue: string; reason: string }) {
  if (!correctableFields.has(input.field)) throw new Error("That field cannot be corrected through this workflow.");
  if (!input.userId.trim() || !input.proposedValue.trim() || input.reason.trim().length < 5) throw new Error("A correction value and reason are required.");
  return {
    userId: input.userId,
    field: input.field as "displayName" | "guardianEmail",
    proposedValue: input.proposedValue.trim(),
    reason: input.reason.trim(),
    status: "pending" as const,
  };
}

export function buildAnonymisationPatch(userId: string) {
  const safeId = userId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
  if (!safeId) throw new Error("A user identifier is required.");
  return {
    displayName: "Former member",
    guardianEmail: `deleted+${safeId}@invalid.grassroots.local`,
  } as const;
}

export function evaluateRetention(
  input: { deleteAfter: string; legalHoldUntil: string | null },
  now = new Date().toISOString(),
): "pending" | "held" | "eligible" {
  const current = Date.parse(now);
  const deleteAfter = Date.parse(input.deleteAfter);
  if (input.legalHoldUntil && Date.parse(input.legalHoldUntil) > current) return "held";
  return current >= deleteAfter ? "eligible" : "pending";
}
