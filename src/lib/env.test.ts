import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("deployed abuse-control configuration", () => {
  it("rejects owner credentials for the deployed app", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DATABASE_URL_READONLY",
      "postgres://neondb_owner:placeholder@ep-example.neon.tech/db?sslmode=require",
    );
    expect(() => env.readonlyDatabaseUrl()).toThrow(/cinequery_reader/);
  });

  it("requires SSL for a deployed Neon connection", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DATABASE_URL_OPS",
      "postgres://cinequery_ops:placeholder@ep-example.neon.tech/db",
    );
    expect(() => env.opsDatabaseUrl()).toThrow(/SSL/);
  });

  it("does not allow missing request accounting in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL_OPS", "");
    expect(() => env.opsDatabaseUrl()).toThrow(/DATABASE_URL_OPS/);
  });

  it("does not accept an absent or short IP salt in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("IP_HASH_SALT", "short");
    expect(() => env.ipHashSalt()).toThrow(/IP_HASH_SALT/);
  });

  it.each(["0", "-1", "NaN", "Infinity"])(
    "rejects invalid spending cap %s",
    (value) => {
      vi.stubEnv("DAILY_SPEND_CAP_USD", value);
      expect(() => env.dailySpendCapUsd()).toThrow(/positive/);
    },
  );
});
