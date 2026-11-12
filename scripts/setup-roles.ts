/**
 * Create the two least-privilege roles the app connects as (R7 safety layer 1):
 *
 *   cinequery_reader  SELECT on the movie tables only, read-only transactions,
 *                     5 s statement_timeout baked into the role.
 *   cinequery_ops     INSERT/SELECT/UPDATE on ops.requests only (rate limit + spend cap).
 *
 * Passwords come from READER_PASSWORD and OPS_PASSWORD. Safe to re-run.
 */
import "dotenv/config";
import pg from "pg";
import { env } from "../src/lib/env";

const MOVIE_TABLES = ["movies", "ratings", "people", "credits"];

async function ensureRole(client: pg.Client, role: string, password: string) {
  const exists = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = $1",
    [role],
  );
  const pw = client.escapeLiteral(password);
  if (exists.rowCount === 0) {
    await client.query(`CREATE ROLE ${role} LOGIN PASSWORD ${pw}`);
    console.log(`created role ${role}`);
  } else {
    await client.query(`ALTER ROLE ${role} LOGIN PASSWORD ${pw}`);
    console.log(`updated password for ${role}`);
  }
}

async function main() {
  const readerPassword = process.env.READER_PASSWORD;
  const opsPassword = process.env.OPS_PASSWORD;
  if (!readerPassword || !opsPassword) {
    throw new Error(
      "Set READER_PASSWORD and OPS_PASSWORD before running setup-roles.",
    );
  }

  const client = new pg.Client({ connectionString: env.adminDatabaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query<{ db: string }>(
      "SELECT current_database() AS db",
    );
    const db = client.escapeIdentifier(rows[0].db);

    // --- reader -------------------------------------------------------
    await ensureRole(client, "cinequery_reader", readerPassword);
    await client.query(`GRANT CONNECT ON DATABASE ${db} TO cinequery_reader`);
    await client.query("GRANT USAGE ON SCHEMA public TO cinequery_reader");
    await client.query(
      `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM cinequery_reader`,
    );
    for (const table of MOVIE_TABLES) {
      await client.query(`GRANT SELECT ON public.${table} TO cinequery_reader`);
    }
    // Role-level defaults: every session starts read-only with a 5 s ceiling.
    await client.query(
      "ALTER ROLE cinequery_reader SET default_transaction_read_only = on",
    );
    await client.query(
      "ALTER ROLE cinequery_reader SET statement_timeout = '5s'",
    );
    await client.query(
      "ALTER ROLE cinequery_reader SET idle_in_transaction_session_timeout = '10s'",
    );
    // Grant the search extension function, not all future public functions.
    await client.query(
      "REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM cinequery_reader",
    );
    await client.query(
      "GRANT EXECUTE ON FUNCTION public.similarity(text, text) TO cinequery_reader",
    );

    // --- ops ----------------------------------------------------------
    await ensureRole(client, "cinequery_ops", opsPassword);
    await client.query(`GRANT CONNECT ON DATABASE ${db} TO cinequery_ops`);
    await client.query("GRANT USAGE ON SCHEMA ops TO cinequery_ops");
    await client.query(
      "GRANT SELECT, INSERT, UPDATE ON ops.requests TO cinequery_ops",
    );
    await client.query(
      "GRANT USAGE ON SEQUENCE ops.requests_id_seq TO cinequery_ops",
    );
    await client.query("ALTER ROLE cinequery_ops SET statement_timeout = '3s'");

    // Neither app role may create objects anywhere.
    await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");

    console.log(
      "roles ready: cinequery_reader (SELECT-only, 5s), cinequery_ops (ops.requests only)",
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
