import { createErrorReference } from "@/lib/security/request";

export function buildHealthSnapshot(input: {
  dataMode: "demo" | "supabase";
  database: "reachable" | "unavailable" | "demo";
  emailConfigured: boolean;
  stripeConfigured: boolean;
  scannerConfigured: boolean;
}, checkedAt = new Date().toISOString()) {
  const checks = {
    database: input.dataMode === "demo" ? "demo" : input.database,
    email: input.emailConfigured ? "configured" : "unconfigured",
    payments: input.stripeConfigured ? "configured" : "unconfigured",
    fileScanning: input.scannerConfigured ? "configured" : "unconfigured",
  } as const;
  return {
    status: checks.database === "unavailable" ? "unavailable" : Object.values(checks).every((value) => value === "configured" || value === "reachable" || value === "demo") ? "ok" : "degraded",
    checkedAt,
    checks,
  } as const;
}


export function normaliseOperationalError(error: unknown, occurredAt = new Date().toISOString(), requestId = crypto.randomUUID()) {
  const frameworkDigest = error instanceof Error && "digest" in error && typeof error.digest === "string" && /^[a-zA-Z0-9_-]{4,80}$/.test(error.digest) ? error.digest : undefined;
  return {
    errorRef: createErrorReference(occurredAt, requestId),
    occurredAt,
    classification: error instanceof Error ? error.name : "UnknownError",
    ...(frameworkDigest ? { frameworkDigest } : {}),
  } as const;
}

export function reportOperationalError(error: unknown, context: string) {
  const event = normaliseOperationalError(error);
  console.error(JSON.stringify({ level: "error", event: context, ...event }));
  return event.errorRef;
}
