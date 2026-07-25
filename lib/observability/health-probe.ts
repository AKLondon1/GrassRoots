import "server-only";

import { environment } from "@/lib/env";
import { buildHealthSnapshot } from "@/lib/observability/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function probePlatformHealth() {
  let database: "reachable" | "unavailable" | "demo" = environment.dataMode === "demo" ? "demo" : "unavailable";
  if (environment.dataMode === "supabase") {
    const admin = createSupabaseAdminClient();
    if (admin) {
      try {
        const result = await Promise.race([
          admin.from("organisations").select("id", { head: true, count: "exact" }).limit(1),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("database health timeout")), 2_500)),
        ]);
        database = result.error ? "unavailable" : "reachable";
      } catch {
        database = "unavailable";
      }
    }
  }
  return buildHealthSnapshot({
    dataMode: environment.dataMode,
    database,
    emailConfigured: Boolean(environment.server.RESEND_API_KEY && environment.server.EMAIL_FROM),
    stripeConfigured: Boolean(environment.server.STRIPE_SECRET_KEY && environment.server.STRIPE_WEBHOOK_SECRET),
    scannerConfigured: Boolean(environment.server.SCANNER_API_URL && environment.server.SCANNER_API_TOKEN),
  });
}
