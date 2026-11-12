import "dotenv/config";
import { describe, expect, it } from "vitest";
import { createAppPool } from "./app-pool";

describe.each(["reader", "ops"] as const)("%s pool lifecycle", (role) => {
  const url =
    process.env[
      role === "reader" ? "DATABASE_URL_READONLY" : "DATABASE_URL_OPS"
    ];

  it("does not connect just because the pool is created", async () => {
    const pool = createAppPool("postgres://unused@127.0.0.1:1/unused", role);
    try {
      expect(pool.totalCount).toBe(0);
      expect(pool.waitingCount).toBe(0);
    } finally {
      await pool.end();
    }
  });

  it.skipIf(!url)(
    "drops idle connections and reconnects for the next query",
    async () => {
      const pool = createAppPool(url!, role);
      try {
        const first = await pool.query(
          "SELECT current_setting('application_name') AS name",
        );
        expect(first.rows[0].name).toBe(`cinequery-${role}`);
        expect(pool.idleCount).toBe(1);

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Idle connection was not closed")),
            8_000,
          );
          pool.once("remove", () => {
            clearTimeout(timeout);
            resolve();
          });
        });
        expect(pool.totalCount).toBe(0);

        const second = await pool.query("SELECT 1 AS value");
        expect(second.rows[0].value).toBe(1);
      } finally {
        await pool.end();
      }
    },
  );
});
