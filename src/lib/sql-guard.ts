/**
 * R7 safety layer 2: a lexical check that a statement is a single read-only
 * query before it ever reaches Postgres. Layer 1 is the SELECT-only role
 * (db roles), layer 3 is the role's 5 s statement_timeout, and the row cap is
 * enforced by wrapping every query (see wrapWithLimit).
 *
 * This check is intentionally conservative. A false rejection costs the agent
 * one retry; a false accept is still stopped by the read-only role.
 */

export const MAX_ROWS = 200;

export class UnsafeSqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeSqlError";
  }
}

const FORBIDDEN = [
  "insert",
  "update",
  "delete",
  "merge",
  "upsert",
  "drop",
  "alter",
  "create",
  "truncate",
  "grant",
  "revoke",
  "comment",
  "copy",
  "vacuum",
  "analyze",
  "cluster",
  "reindex",
  "refresh",
  "lock",
  "call",
  "do",
  "execute",
  "prepare",
  "deallocate",
  "listen",
  "notify",
  "set",
  "reset",
  "discard",
  "begin",
  "commit",
  "rollback",
  "savepoint",
  "into", // SELECT ... INTO new_table
];

// Functions that can read the server filesystem, sleep, or reach outside the database.
const FORBIDDEN_FUNCTIONS = [
  "pg_sleep",
  "pg_read_file",
  "pg_read_binary_file",
  "pg_ls_dir",
  "pg_stat_file",
  "lo_import",
  "lo_export",
  "dblink",
  "pg_terminate_backend",
  "pg_cancel_backend",
  "set_config",
  "pg_advisory_lock",
];

/**
 * Remove comments and the contents of string literals / quoted identifiers so
 * keyword scanning only sees real SQL tokens. Returns the scrubbed text.
 */
export function scrubSql(sql: string, preserveIdentifiers = false): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
      out += " ";
    } else if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += " ";
    } else if (ch === "'") {
      // standard string; '' is an escaped quote
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") break;
        else i++;
      }
      i++;
      out += "''";
    } else if (ch === '"') {
      let identifier = '"';
      i++;
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          identifier += '""';
          i += 2;
        } else if (sql[i] === '"') {
          identifier += '"';
          i++;
          break;
        } else identifier += sql[i++];
      }
      out += preserveIdentifiers ? identifier : '"q"';
    } else if (ch === "$") {
      // dollar-quoted string: $tag$ ... $tag$
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        i = end === -1 ? sql.length : end + tag.length;
        out += "''";
      } else {
        out += ch;
        i++;
      }
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/**
 * Validate that `sql` is one read-only SELECT/WITH statement.
 * Returns the trimmed statement without a trailing semicolon.
 */
export function assertReadOnlySql(sql: string): string {
  if (typeof sql !== "string" || sql.trim() === "") {
    throw new UnsafeSqlError("Query is empty.");
  }
  if (sql.length > 10_000) {
    throw new UnsafeSqlError("Query is too long (10,000 character limit).");
  }

  const scrubbed = scrubSql(sql).trim().replace(/;\s*$/, "");
  if (scrubbed.includes(";")) {
    throw new UnsafeSqlError(
      "Only one statement is allowed; remove the extra semicolon.",
    );
  }

  const firstWord = scrubbed.match(/^\(*\s*([A-Za-z]+)/)?.[1]?.toLowerCase();
  if (firstWord !== "select" && firstWord !== "with") {
    throw new UnsafeSqlError("Only SELECT or WITH queries are allowed.");
  }

  const words = new Set(
    scrubbed.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? [],
  );
  for (const kw of FORBIDDEN) {
    if (words.has(kw)) {
      throw new UnsafeSqlError(
        `"${kw.toUpperCase()}" is not allowed: queries must be read-only.`,
      );
    }
  }
  // Quoting a function name must not hide it from the safety check.
  // Keep ordinary quoted column aliases out of the keyword check above.
  const functionSql = scrubSql(sql, true);
  if (/\bu&\s*"/i.test(functionSql)) {
    throw new UnsafeSqlError("Unicode-escaped identifiers are not supported.");
  }
  const functionWords = new Set(
    functionSql.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? [],
  );
  for (const fn of FORBIDDEN_FUNCTIONS) {
    if (functionWords.has(fn)) {
      throw new UnsafeSqlError(`Function ${fn}() is not allowed.`);
    }
  }
  for (const fn of functionWords) {
    if (
      /^pg_(?:(?:try_)?advisory_|sleep(?:_|$)|logical_emit_message$)/.test(fn)
    ) {
      throw new UnsafeSqlError(`Function ${fn}() is not allowed.`);
    }
  }
  if (
    /\bfor\s+(update|share|no\s+key\s+update|key\s+share)\b/i.test(scrubbed)
  ) {
    throw new UnsafeSqlError(
      "Row locking clauses (FOR UPDATE/SHARE) are not allowed.",
    );
  }

  return sql.trim().replace(/;\s*$/, "");
}

/**
 * Wrap a validated query so Postgres never returns more than MAX_ROWS + 1
 * rows (the +1 lets us report truncation without counting the full result).
 */
export function wrapWithLimit(sql: string, maxRows = MAX_ROWS): string {
  return `SELECT * FROM (\n${sql}\n) AS cinequery_q LIMIT ${maxRows + 1}`;
}
