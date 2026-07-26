import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
);

const rawEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_DATA_MODE: z.enum(["demo", "supabase"]).optional(),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  CRON_SECRET: optionalString,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: optionalString,
  OPENAI_COACHING_ENABLED: z.enum(["true", "false"]).default("false"),
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  PUSH_PROVIDER_URL: optionalUrl,
  PUSH_PROVIDER_TOKEN: optionalString,
  PUSH_SUBSCRIPTION_ENCRYPTION_KEY: optionalString,
  SCANNER_API_URL: optionalUrl,
  SCANNER_API_TOKEN: optionalString,
  APP_ORIGIN: optionalUrl,
});

export type EnvironmentInput = Record<string, string | undefined>;

function isCanonicalHttpsOrigin(value: string) {
  const url = new URL(value);

  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    !url.hostname.includes("*") &&
    value === url.origin
  );
}

export function parseEnvironment(input: EnvironmentInput) {
  const raw = rawEnvironmentSchema.parse(input);
  const hasUrl = Boolean(raw.NEXT_PUBLIC_SUPABASE_URL);
  const hasAnonKey = Boolean(raw.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (raw.NODE_ENV === "production" && !raw.NEXT_PUBLIC_DATA_MODE) {
    throw new Error(
      "Production requires an explicit data mode: demo or supabase.",
    );
  }

  if (
    raw.NODE_ENV === "production" &&
    (!raw.APP_ORIGIN || !isCanonicalHttpsOrigin(raw.APP_ORIGIN))
  ) {
    throw new Error("Production requires APP_ORIGIN to be the canonical HTTPS origin.");
  }

  if (hasUrl !== hasAnonKey) {
    throw new Error("Supabase URL and anonymous key must be configured together.");
  }

  const dataMode = raw.NEXT_PUBLIC_DATA_MODE ?? (hasUrl ? "supabase" : "demo");

  if (dataMode === "supabase" && !hasUrl) {
    throw new Error("Supabase mode requires a URL and anonymous key.");
  }

  if (raw.NODE_ENV === "production" && dataMode === "supabase" && (!raw.SUPABASE_SERVICE_ROLE_KEY || raw.SUPABASE_SERVICE_ROLE_KEY.length < 32)) {
    throw new Error("Production Supabase mode requires a service-role key of at least 32 characters.");
  }
  if (raw.NODE_ENV === "production" && dataMode === "supabase" && (!raw.CRON_SECRET || raw.CRON_SECRET.length < 32)) {
    throw new Error("Production Supabase mode requires a CRON_SECRET of at least 32 characters.");
  }
  if (Boolean(raw.STRIPE_SECRET_KEY) !== Boolean(raw.STRIPE_WEBHOOK_SECRET)) {
    throw new Error("Stripe secret key and webhook secret must be configured together.");
  }
  if ((raw.STRIPE_SECRET_KEY && raw.STRIPE_SECRET_KEY.length < 16) || (raw.STRIPE_WEBHOOK_SECRET && raw.STRIPE_WEBHOOK_SECRET.length < 16)) {
    throw new Error("Stripe secrets are too short.");
  }
  if (raw.OPENAI_COACHING_ENABLED === "true" && (!raw.OPENAI_API_KEY || raw.OPENAI_API_KEY.length < 20)) {
    throw new Error("Enabled coaching assistance requires OPENAI_API_KEY.");
  }
  if (Boolean(raw.RESEND_API_KEY) !== Boolean(raw.EMAIL_FROM)) throw new Error("Email provider key and sender must be configured together.");
  const pushValues = [raw.PUSH_PROVIDER_URL, raw.PUSH_PROVIDER_TOKEN, raw.NEXT_PUBLIC_VAPID_PUBLIC_KEY, raw.PUSH_SUBSCRIPTION_ENCRYPTION_KEY];
  if (pushValues.some(Boolean) && !pushValues.every(Boolean)) throw new Error("Push provider URL, token, VAPID public key and subscription encryption key must be configured together.");
  if (Boolean(raw.SCANNER_API_URL) !== Boolean(raw.SCANNER_API_TOKEN)) throw new Error("Scanner provider URL and token must be configured together.");
  if (raw.PUSH_SUBSCRIPTION_ENCRYPTION_KEY && raw.PUSH_SUBSCRIPTION_ENCRYPTION_KEY.length < 32) throw new Error("Push subscription encryption key must be at least 32 characters.");
  if (raw.NODE_ENV === "production" && raw.PUSH_PROVIDER_URL && new URL(raw.PUSH_PROVIDER_URL).protocol !== "https:") throw new Error("Production push provider URL must use HTTPS.");
  if (raw.NODE_ENV === "production" && raw.SCANNER_API_URL && new URL(raw.SCANNER_API_URL).protocol !== "https:") throw new Error("Production scanner provider URL must use HTTPS.");

  return {
    nodeEnv: raw.NODE_ENV,
    dataMode,
    public: {
      NEXT_PUBLIC_DATA_MODE: dataMode,
      NEXT_PUBLIC_SUPABASE_URL: raw.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: raw.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: raw.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    },
    server: {
      SUPABASE_SERVICE_ROLE_KEY: raw.SUPABASE_SERVICE_ROLE_KEY,
      CRON_SECRET: raw.CRON_SECRET,
      STRIPE_SECRET_KEY: raw.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: raw.STRIPE_WEBHOOK_SECRET,
      OPENAI_API_KEY: raw.OPENAI_API_KEY,
      OPENAI_MODEL: raw.OPENAI_MODEL ?? "gpt-5.6",
      OPENAI_COACHING_ENABLED: raw.OPENAI_COACHING_ENABLED === "true",
      RESEND_API_KEY: raw.RESEND_API_KEY,
      EMAIL_FROM: raw.EMAIL_FROM,
      PUSH_PROVIDER_URL: raw.PUSH_PROVIDER_URL,
      PUSH_PROVIDER_TOKEN: raw.PUSH_PROVIDER_TOKEN,
      PUSH_SUBSCRIPTION_ENCRYPTION_KEY: raw.PUSH_SUBSCRIPTION_ENCRYPTION_KEY,
      SCANNER_API_URL: raw.SCANNER_API_URL,
      SCANNER_API_TOKEN: raw.SCANNER_API_TOKEN,
      APP_ORIGIN: raw.APP_ORIGIN,
    },
  } as const;
}

export const environment = parseEnvironment(process.env);
