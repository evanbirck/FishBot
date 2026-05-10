import { z } from "zod";
import { DEFAULT_OPENAI_MODEL } from "@/lib/constants";
import { ConfigurationError } from "@/lib/errors";

const requiredString = z.string().trim().min(1);
const optionalString = z.string().trim().optional().default("");
const optionalNumberFromString = z
  .union([z.number(), z.string()])
  .optional()
  .default("0")
  .transform((value) => {
    if (typeof value === "number") return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  });
const booleanFromString = z
  .union([z.boolean(), z.string()])
  .optional()
  .default("false")
  .transform((value) => {
    if (typeof value === "boolean") return value;
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  });

const browserEnvBaseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: requiredString.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString
});

function normalizeSupabasePublicKey<T extends z.infer<typeof browserEnvBaseSchema>>(env: T, context: z.RefinementCtx) {
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!publishableKey) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
      message: "Required"
    });
    return z.NEVER;
  }

  return {
    ...env,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY || publishableKey
  };
}

export const browserEnvSchema = browserEnvBaseSchema.transform(normalizeSupabasePublicKey);

export const serverEnvSchema = browserEnvBaseSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: requiredString,
  OPENAI_API_KEY: requiredString,
  OPENAI_SUMMARY_MODEL: z.string().trim().min(1).default(DEFAULT_OPENAI_MODEL),
  YOUTUBE_API_KEY: requiredString,
  YOUTUBE_CHANNEL_ID: requiredString,
  YOUTUBE_CHANNEL_HANDLE: optionalString,
  GMAIL_SMTP_HOST: optionalString.default("smtp.gmail.com"),
  GMAIL_SMTP_PORT: optionalNumberFromString.default(465),
  GMAIL_SMTP_USER: optionalString,
  GMAIL_APP_PASSWORD: optionalString,
  EMAIL_FROM: optionalString,
  EMAIL_TO: z.string().trim().email().optional().or(z.literal("")).default(""),
  EMAIL_ACTION_SECRET: optionalString,
  CRON_SECRET: requiredString,
  ENABLE_EMAIL: booleanFromString.default("false"),
  ENABLE_STT_FALLBACK: booleanFromString.default("false"),
  APP_BASE_URL: requiredString.url(),
  DASHBOARD_PASSWORD: requiredString,
  OPENAI_INPUT_COST_PER_1M: optionalNumberFromString,
  OPENAI_OUTPUT_COST_PER_1M: optionalNumberFromString
}).transform(normalizeSupabasePublicKey);

export type BrowserEnv = z.infer<typeof browserEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const REQUIRED_BROWSER_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
] as const;

export const REQUIRED_SERVER_ENV_KEYS = [
  ...REQUIRED_BROWSER_ENV_KEYS,
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "YOUTUBE_API_KEY",
  "YOUTUBE_CHANNEL_ID",
  "CRON_SECRET",
  "APP_BASE_URL",
  "DASHBOARD_PASSWORD"
] as const;

type EnvSource = Record<string, string | undefined>;

export function parseBrowserEnv(source: EnvSource): BrowserEnv {
  const parsed = browserEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigurationError(formatEnvError("browser", parsed.error));
  }
  return parsed.data;
}

export function parseServerEnv(source: EnvSource): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigurationError(formatEnvError("server", parsed.error));
  }
  if (parsed.data.ENABLE_EMAIL && (!parsed.data.GMAIL_SMTP_USER || !parsed.data.GMAIL_APP_PASSWORD || !parsed.data.EMAIL_TO)) {
    throw new ConfigurationError("Server env is invalid: provide GMAIL_SMTP_USER, GMAIL_APP_PASSWORD, and EMAIL_TO when ENABLE_EMAIL is true.");
  }
  return parsed.data;
}

export function getBrowserEnv(): BrowserEnv {
  return parseBrowserEnv(process.env);
}

export function getServerEnv(): ServerEnv {
  return parseServerEnv(process.env);
}

export function inspectEnvReadiness(source: EnvSource = process.env) {
  const browserMissing = REQUIRED_BROWSER_ENV_KEYS.filter((key) => {
    if (key === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") {
      return !source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !source.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
    return !source[key];
  });
  const serverMissing = REQUIRED_SERVER_ENV_KEYS.filter((key) => !source[key]);

  return {
    browserReady: browserMissing.length === 0,
    serverReady: serverMissing.length === 0,
    browserMissing,
    serverMissing,
    optional: {
      OPENAI_SUMMARY_MODEL: source.OPENAI_SUMMARY_MODEL || DEFAULT_OPENAI_MODEL,
      ENABLE_EMAIL: source.ENABLE_EMAIL ?? "false",
      EMAIL_READY: Boolean(source.GMAIL_SMTP_USER && source.GMAIL_APP_PASSWORD && source.EMAIL_TO),
      ENABLE_STT_FALLBACK: source.ENABLE_STT_FALLBACK ?? "false",
      APP_BASE_URL: Boolean(source.APP_BASE_URL),
      EMAIL_FROM: Boolean(source.EMAIL_FROM),
      EMAIL_ACTION_SECRET: Boolean(source.EMAIL_ACTION_SECRET),
      OPENAI_INPUT_COST_PER_1M: source.OPENAI_INPUT_COST_PER_1M ?? "0",
      OPENAI_OUTPUT_COST_PER_1M: source.OPENAI_OUTPUT_COST_PER_1M ?? "0"
    }
  };
}

function formatEnvError(scope: "browser" | "server", error: z.ZodError): string {
  const details = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  return `${scope[0]?.toUpperCase()}${scope.slice(1)} env is invalid: ${details}`;
}
