/**
 * Typed access to environment variables. Each getter throws a clear message
 * when a required variable is missing, so failures point at the fix.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got "${raw}".`);
  }
  return parsed;
}

/** Model for the demo and default eval runs. Haiku keeps a public demo cheap; override with CINEQUERY_MODEL. */
export const DEFAULT_MODEL = "claude-haiku-5-5";

export const env = {
  /** Owner connection — scripts only (schema, loader, roles). */
  adminDatabaseUrl: () => required("DATABASE_URL_ADMIN"),
  /** SELECT-only role used by the agent's tools. */
  readonlyDatabaseUrl: () => required("DATABASE_URL_READONLY"),
  /** Role that may only write ops.requests. Optional: abuse controls are skipped without it. */
  opsDatabaseUrl: () => process.env.DATABASE_URL_OPS || null,
  model: () => process.env.CINEQUERY_MODEL || DEFAULT_MODEL,
  effort: () =>
    (process.env.CINEQUERY_EFFORT || "medium") as "low" | "medium" | "high" | "xhigh" | "max",
  rateLimitPerHour: () => optionalNumber("RATE_LIMIT_PER_HOUR", 10),
  dailySpendCapUsd: () => optionalNumber("DAILY_SPEND_CAP_USD", 5),
  ipHashSalt: () => process.env.IP_HASH_SALT || "cinequery",
};
