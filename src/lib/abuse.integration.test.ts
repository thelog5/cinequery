/**
 * R8 against the real ops schema. Uses a random IP per test so runs don't
 * collide, and the admin connection to clean up (the ops role can't delete).
 * Skipped unless DATABASE_URL_OPS and DATABASE_URL_ADMIN are set.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { admitRequest, hashIp, recordOutcome } from "./abuse";

const ready = Boolean(process.env.DATABASE_URL_OPS && process.env.DATABASE_URL_ADMIN);

describe.skipIf(!ready)("abuse controls", () => {
  const admin = ready ? new pg.Pool({ connectionString: process.env.DATABASE_URL_ADMIN }) : null;
  const hashes: string[] = [];

  afterAll(async () => {
    await admin?.query("DELETE FROM ops.requests WHERE ip_hash = ANY($1)", [hashes]);
    await admin?.end();
  });

  it("admits 10 questions per IP per hour, then returns 429 with Retry-After", async () => {
    process.env.RATE_LIMIT_PER_HOUR = "10";
    const ip = hashIp(randomUUID());
    hashes.push(ip);
    for (let i = 0; i < 10; i++) {
      const r = await admitRequest(ip, `q${i}`);
      expect(r.ok).toBe(true);
    }
    const blocked = await admitRequest(ip, "one too many");
    expect(blocked).toMatchObject({ ok: false, status: 429 });
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0);

    // A different IP is unaffected.
    const other = hashIp(randomUUID());
    hashes.push(other);
    expect((await admitRequest(other, "hello")).ok).toBe(true);
  });

  it("refuses new questions once today's spend reaches the cap", async () => {
    const { rows } = await admin!.query<{ spent: number }>(
      `SELECT coalesce(sum(cost_usd), 0)::float AS spent FROM ops.requests
        WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
    );
    // Set the cap just above today's spend, then record one costly answer.
    process.env.DAILY_SPEND_CAP_USD = String(rows[0].spent + 1);
    const ip = hashIp(randomUUID());
    hashes.push(ip);
    const first = await admitRequest(ip, "expensive");
    expect(first.ok).toBe(true);
    if (first.ok) {
      await recordOutcome(first.requestId, { status: "ok", costUsd: 1.5, inputTokens: 1, outputTokens: 1, latencyMs: 1 });
    }
    const next = await admitRequest(hashIp(randomUUID()), "anyone");
    expect(next).toMatchObject({ ok: false, status: 503 });
    delete process.env.DAILY_SPEND_CAP_USD;
  });
});
