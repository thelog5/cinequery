/**
 * Read-only database access for the agent's tools.
 *
 * Every query runs inside `BEGIN READ ONLY` with `SET LOCAL statement_timeout`,
 * on a connection that logs in as the SELECT-only role. That is belt and braces
 * on top of the role defaults, and it still works behind a transaction-mode
 * pooler such as Neon's, where session-level SETs would leak between clients.
 */
import pg from "pg";
import { env } from "./env";
import { MAX_ROWS, UnsafeSqlError, assertReadOnlySql, wrapWithLimit } from "./sql-guard";

export const STATEMENT_TIMEOUT_MS = 5_000;

// COUNT(*) is bigint and AVG() is numeric; pg returns both as strings by
// default. Movie-scale numbers fit comfortably in a JS double.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

let pool: pg.Pool | null = null;

export function getReadonlyPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: env.readonlyDatabaseUrl(),
      max: 5,
      idleTimeoutMillis: 10_000,
      // Client-side backstop in case the server-side timeout is ever bypassed.
      query_timeout: STATEMENT_TIMEOUT_MS + 2_000,
    });
  }
  return pool;
}

/** For tests and scripts: point the module at a specific pool. */
export function setReadonlyPool(p: pg.Pool | null) {
  pool = p;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  elapsedMs: number;
}

export class QueryError extends Error {
  constructor(
    message: string,
    readonly code: "unsafe" | "timeout" | "read_only" | "permission" | "sql" | "connection",
  ) {
    super(message);
    this.name = "QueryError";
  }
}

function friendlyError(err: unknown): QueryError {
  if (err instanceof UnsafeSqlError) return new QueryError(err.message, "unsafe");
  const e = err as { code?: string; message?: string; position?: string; hint?: string };
  switch (e.code) {
    case "57014":
      return new QueryError(
        `Query took longer than ${STATEMENT_TIMEOUT_MS / 1000} seconds and was stopped. ` +
          "Narrow it with filters (for example a vote threshold) or simplify the joins.",
        "timeout",
      );
    case "25006":
      return new QueryError("Queries can't modify data.", "read_only");
    case "42501":
      return new QueryError(
        "Permission denied. Only the movies, ratings, people, and credits tables can be read.",
        "permission",
      );
  }
  if (e.message?.includes("Query read timeout")) {
    return new QueryError(`Query took longer than ${STATEMENT_TIMEOUT_MS / 1000} seconds and was stopped.`, "timeout");
  }
  if (e.code && /^[0-9A-Z]{5}$/.test(e.code)) {
    const extra = [e.hint && `Hint: ${e.hint}`, e.position && `(at character ${e.position})`]
      .filter(Boolean)
      .join(" ");
    return new QueryError(`${e.message}${extra ? ` ${extra}` : ""}`, "sql");
  }
  return new QueryError(`Database error: ${e.message ?? String(err)}`, "connection");
}

/** Make column names unique so rows can be turned into objects safely. */
function uniqueColumns(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const count = (seen.get(n) ?? 0) + 1;
    seen.set(n, count);
    return count === 1 ? n : `${n}_${count}`;
  });
}

/**
 * Run model-written SQL safely: validate, cap at MAX_ROWS, enforce the
 * timeout, and translate Postgres errors into messages the agent can act on.
 */
export async function runReadOnlyQuery(sql: string, maxRows = MAX_ROWS): Promise<QueryResult> {
  let statement: string;
  try {
    statement = assertReadOnlySql(sql);
  } catch (err) {
    throw friendlyError(err);
  }

  const started = Date.now();
  let client: pg.PoolClient;
  try {
    client = await getReadonlyPool().connect();
  } catch (err) {
    throw friendlyError(err);
  }
  try {
    await client.query(`BEGIN READ ONLY; SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const res = await client.query({ text: wrapWithLimit(statement, maxRows), rowMode: "array" });
    await client.query("COMMIT");
    const truncated = res.rows.length > maxRows;
    const rows = truncated ? res.rows.slice(0, maxRows) : res.rows;
    return {
      columns: uniqueColumns(res.fields.map((f) => f.name)),
      rows,
      rowCount: rows.length,
      truncated,
      elapsedMs: Date.now() - started,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw friendlyError(err);
  } finally {
    client.release();
  }
}

/** Trusted, parameterized queries issued by our own tool code (not the model). */
export async function internalQuery<T extends pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = await getReadonlyPool().connect();
  try {
    await client.query(`BEGIN READ ONLY; SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const res = await client.query<T>(text, params);
    await client.query("COMMIT");
    return res.rows;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw friendlyError(err);
  } finally {
    client.release();
  }
}

export function rowsToObjects(columns: string[], rows: unknown[][]): Record<string, unknown>[] {
  return rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
}
