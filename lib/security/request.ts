const sensitiveKey = /(?:address|allerg|authori[sz]ation|card|concern|cookie|dob|email|guardian|medical|message|note|password|phone|secret|session|token)/i;

function opaqueDigest(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function assertSameOriginMutation(
  request: Request,
  options: { trustedNonBrowser?: boolean } = {},
): void {
  if (options.trustedNonBrowser) return;
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return;
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || new URL(origin).origin !== requestUrl.origin || fetchSite === "cross-site") {
    throw new Error("The request origin could not be verified.");
  }
}

export function trustedClientIdentifier(headers: Headers): string {
  const candidate = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    ?? headers.get("cf-connecting-ip")?.trim();
  if (!candidate || !/^[0-9a-f:.]{3,64}$/i.test(candidate)) return "edge-unavailable";
  return candidate.toLowerCase();
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: number;
}

export class InMemoryRateLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly options: { limit: number; windowMs: number }) {
    if (!Number.isInteger(options.limit) || options.limit < 1 || options.windowMs < 1) {
      throw new Error("Rate limits require a positive limit and window.");
    }
  }

  consume(key: string, now = Date.now()): RateLimitDecision {
    const normalisedKey = opaqueDigest(key);
    let entry = this.entries.get(normalisedKey);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + this.options.windowMs };
      this.entries.set(normalisedKey, entry);
    }
    entry.count += 1;
    return {
      allowed: entry.count <= this.options.limit,
      limit: this.options.limit,
      remaining: Math.max(0, this.options.limit - entry.count),
      resetAt: entry.resetAt,
    };
  }
}

export function redactSensitiveValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      sensitiveKey.test(key) ? "[REDACTED]" : redactSensitiveValue(child),
    ]),
  );
}

export function createErrorReference(occurredAt = new Date().toISOString(), requestId = crypto.randomUUID()): string {
  const digest = opaqueDigest(`${occurredAt}:${requestId}`).slice(0, 12).toUpperCase();
  return `GR-${digest}`;
}

export function rateLimitHeaders(decision: RateLimitDecision): HeadersInit {
  return {
    "RateLimit-Limit": String(decision.limit),
    "RateLimit-Remaining": String(decision.remaining),
    "RateLimit-Reset": String(Math.ceil(decision.resetAt / 1000)),
  };
}
