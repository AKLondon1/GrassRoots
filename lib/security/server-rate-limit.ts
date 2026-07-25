import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DistributedRateLimitDecision { allowed: boolean; remaining: number; resetAt: string }

export async function consumeDistributedRateLimit(client: SupabaseClient, key: string, options: { limit: number; windowSeconds: number }): Promise<DistributedRateLimitDecision> {
  const digest = createHash("sha256").update(key).digest("hex");
  const { data, error } = await client.rpc("consume_rate_limit", { requested_bucket_digest: digest, requested_limit: options.limit, requested_window_seconds: options.windowSeconds });
  const row = ((data ?? []) as Array<{ allowed: boolean; remaining: number; reset_at: string }>)[0];
  if (error || !row) throw new Error("Distributed rate-limit state is unavailable.");
  return { allowed: row.allowed, remaining: row.remaining, resetAt: row.reset_at };
}

export function distributedRateLimitHeaders(decision: DistributedRateLimitDecision, limit: number): HeadersInit {
  return { "RateLimit-Limit": String(limit), "RateLimit-Remaining": String(decision.remaining), "RateLimit-Reset": String(Math.ceil(Date.parse(decision.resetAt) / 1000)) };
}
