/**
 * R8 abuse controls, backed by ops.requests in Postgres (no extra service):
 *   - per-IP limit: RATE_LIMIT_PER_HOUR questions in any rolling hour
 *   - daily spend cap: refuse new questions once today's model cost
 *     (UTC day) reaches DAILY_SPEND_CAP_USD
 *
 * The Anthropic console's workspace spend limit is the hard backstop; this
 * cap keeps one bad day from eating the whole month.
 */
import { createHash } from "node:crypto";
import pg from "pg";
import { createAppPool } from "./app-pool";
import { env } from "./env";

let pool: pg.Pool | null = null;

function opsPool(): pg.Pool | null {
  const url = env.opsDatabaseUrl();
  if (!url) return null;
  if (!pool) {
    pool = createAppPool(url, "ops");
  }
  return pool;
}

export function hashIp(ip: string): string {
  return createHash("sha256")
    .update(`${env.ipHashSalt()}:${ip}`)
    .digest("hex")
    .slice(0, 32);
}

/** Best-effort client IP behind Vercel's proxy. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export type AdmitResult =
  | { ok: true; requestId: number | null }
  | { ok: false; status: 429 | 503; reason: string; retryAfterSec?: number };

/**
 * Check both limits and, if allowed, record the request. Without an ops
 * database configured (local dev) everything is admitted.
 */
export async function admitRequest(
  ipHash: string,
  question: string,
): Promise<AdmitResult> {
  const db = opsPool();
  if (!db) return { ok: true, requestId: null };

  const limit = env.rateLimitPerHour();
  const cap = env.dailySpendCapUsd();
  const concurrency = env.maxConcurrentRequests();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '3s'");
    // All web instances use this short lock. Count and reserve atomically.
    await client.query("SELECT pg_advisory_xact_lock(724381, 1)");
    const { rows } = await client.query<{
      recent: number;
      oldest: Date | null;
      spent: number;
      active: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM ops.requests
           WHERE ip_hash = $1 AND created_at > now() - interval '1 hour' AND status <> 'rejected') AS recent,
         (SELECT min(created_at) FROM ops.requests
           WHERE ip_hash = $1 AND created_at > now() - interval '1 hour' AND status <> 'rejected') AS oldest,
         (SELECT coalesce(sum(cost_usd), 0)::float FROM ops.requests
           WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS spent,
         (SELECT count(*)::int FROM ops.requests
           WHERE status = 'started' AND created_at > now() - interval '3 minutes') AS active`,
      [ipHash],
    );
    const { recent, oldest, spent, active } = rows[0];
    let refusal: AdmitResult | undefined;
    if (spent >= cap) {
      refusal = {
        ok: false,
        status: 503,
        reason:
          "Cinequery has hit its daily budget for model calls. Please come back tomorrow (UTC).",
      };
    } else if (recent >= limit) {
      const retryAfterSec = oldest
        ? Math.max(
            60,
            Math.ceil((oldest.getTime() + 3_600_000 - Date.now()) / 1000),
          )
        : 3600;
      refusal = {
        ok: false,
        status: 429,
        reason: `You've asked ${limit} questions in the last hour. Try again in about ${Math.ceil(retryAfterSec / 60)} minutes.`,
        retryAfterSec,
      };
    } else if (active >= concurrency) {
      refusal = {
        ok: false,
        status: 429,
        reason: "Cinequery is answering other questions. Try again shortly.",
        retryAfterSec: 15,
      };
    }
    if (refusal) {
      await client.query("COMMIT");
      return refusal;
    }
    const inserted = await client.query<{ id: number }>(
      "INSERT INTO ops.requests (ip_hash, question) VALUES ($1, $2) RETURNING id",
      [ipHash, question.slice(0, 500)],
    );
    await client.query("COMMIT");
    return { ok: true, requestId: Number(inserted.rows[0].id) };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function recordOutcome(
  requestId: number | null,
  outcome: {
    status: "ok" | "error";
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
  },
): Promise<void> {
  const db = opsPool();
  if (!db || requestId === null) return;
  await db
    .query(
      `UPDATE ops.requests
          SET status = $2, cost_usd = $3, input_tokens = $4, output_tokens = $5, latency_ms = $6
        WHERE id = $1`,
      [
        requestId,
        outcome.status,
        outcome.costUsd,
        outcome.inputTokens,
        outcome.outputTokens,
        outcome.latencyMs,
      ],
    )
    .catch((err) => console.error("recordOutcome failed", err));
}
