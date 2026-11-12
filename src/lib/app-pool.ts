import pg from "pg";

/** Lazy connections shared by the web app and the database tools. No warm-up query. */
export function createAppPool(
  connectionString: string,
  role: "reader" | "ops",
): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    application_name: `cinequery-${role}`,
    min: 0,
    max: role === "reader" ? 5 : 2,
    // Drop idle sockets promptly; do not send heartbeats to keep Neon awake.
    idleTimeoutMillis: 5_000,
    // Allow time for a suspended Neon compute to start on a real request.
    connectionTimeoutMillis: 15_000,
    query_timeout: role === "reader" ? 7_000 : 5_000,
    allowExitOnIdle: true,
  });
  // Neon can close idle connections when it suspends.
  pool.on("error", (err) =>
    console.error(`${role} pool: idle client error`, err.message),
  );
  return pool;
}
