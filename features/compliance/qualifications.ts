export type QualificationStatus = "current" | "expiring" | "expired";

export function qualificationStatus(expiresOn: string, now = new Date()): QualificationStatus {
  const end = new Date(`${expiresOn}T23:59:59.999Z`);
  if (Number.isNaN(end.getTime())) throw new Error("Qualification expiry date is invalid.");
  if (end < now) return "expired";
  const days = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
  return days <= 30 ? "expiring" : "current";
}
