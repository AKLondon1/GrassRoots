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
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  OPENAI_API_KEY: optionalString,
});

export type EnvironmentInput = Record<string, string | undefined>;

export function parseEnvironment(input: EnvironmentInput) {
  const raw = rawEnvironmentSchema.parse(input);
  const hasUrl = Boolean(raw.NEXT_PUBLIC_SUPABASE_URL);
  const hasAnonKey = Boolean(raw.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (raw.NODE_ENV === "production" && !raw.NEXT_PUBLIC_DATA_MODE) {
    throw new Error(
      "Production requires an explicit data mode: demo or supabase.",
    );
  }

  if (hasUrl !== hasAnonKey) {
    throw new Error("Supabase URL and anonymous key must be configured together.");
  }

  const dataMode = raw.NEXT_PUBLIC_DATA_MODE ?? (hasUrl ? "supabase" : "demo");

  if (dataMode === "supabase" && !hasUrl) {
    throw new Error("Supabase mode requires a URL and anonymous key.");
  }

  return {
    nodeEnv: raw.NODE_ENV,
    dataMode,
    public: {
      NEXT_PUBLIC_DATA_MODE: dataMode,
      NEXT_PUBLIC_SUPABASE_URL: raw.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: raw.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    server: {
      SUPABASE_SERVICE_ROLE_KEY: raw.SUPABASE_SERVICE_ROLE_KEY,
      STRIPE_SECRET_KEY: raw.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: raw.STRIPE_WEBHOOK_SECRET,
      OPENAI_API_KEY: raw.OPENAI_API_KEY,
    },
  } as const;
}

export const environment = parseEnvironment(process.env);
