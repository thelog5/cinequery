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
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number.`);
  }
  return parsed;
}

function appDatabaseUrl(name: string, role: string): string {
  const value = required(name);
  if (process.env.NODE_ENV === "production") {
    const url = new URL(value);
    if (decodeURIComponent(url.username) !== role) {
      throw new Error(
        `${name} must use the ${role} role, not an owner connection.`,
      );
    }
    if (
      url.hostname.endsWith(".neon.tech") &&
      !["require", "verify-ca", "verify-full"].includes(
        url.searchParams.get("sslmode") ?? "",
      )
    ) {
      throw new Error(`${name} must enable SSL for Neon.`);
    }
  }
  return value;
}

/** Model for the demo and default eval runs. Haiku keeps a public demo cheap; override with CINEQUERY_MODEL. */
export const DEFAULT_MODEL = "claude-haiku-5-5";

export const env = {
  /** Owner connection — scripts only (schema, loader, roles). */
  adminDatabaseUrl: () => required("DATABASE_URL_ADMIN"),
  /** SELECT-only role used by the agent's tools. */
  readonlyDatabaseUrl: () =>
    appDatabaseUrl("DATABASE_URL_READONLY", "cinequery_reader"),
  /** Optional locally; a deployed app must never bypass its spending controls. */
  opsDatabaseUrl: () =>
    process.env.DATABASE_URL_OPS || process.env.NODE_ENV === "production"
      ? appDatabaseUrl("DATABASE_URL_OPS", "cinequery_ops")
      : null,
  model: () => process.env.CINEQUERY_MODEL || DEFAULT_MODEL,
  effort: () =>
    (process.env.CINEQUERY_EFFORT || "medium") as
      "low" | "medium" | "high" | "xhigh" | "max",
  rateLimitPerHour: () => optionalNumber("RATE_LIMIT_PER_HOUR", 10),
  dailySpendCapUsd: () => optionalNumber("DAILY_SPEND_CAP_USD", 0.5),
  maxConcurrentRequests: () =>
    Math.floor(optionalNumber("MAX_CONCURRENT_REQUESTS", 2)),
  ipHashSalt: () => {
    const salt = process.env.IP_HASH_SALT;
    if (process.env.NODE_ENV === "production" && (!salt || salt.length < 32)) {
      throw new Error("Set a private IP_HASH_SALT of at least 32 characters.");
    }
    return salt || "cinequery-local-development";
  },
};
