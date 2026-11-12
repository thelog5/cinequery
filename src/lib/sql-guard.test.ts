import { describe, expect, it } from "vitest";
import {
  UnsafeSqlError,
  assertReadOnlySql,
  scrubSql,
  wrapWithLimit,
} from "./sql-guard";

describe("assertReadOnlySql", () => {
  it.each([
    "SELECT 1",
    "select title from movies where year = 2019;",
    "WITH t AS (SELECT * FROM movies) SELECT count(*) FROM t",
    "(SELECT 1) UNION (SELECT 2)",
    "SELECT title FROM movies WHERE title = 'Drop Dead Fred'",
    "SELECT 'update; delete' AS harmless",
    `SELECT "update" FROM (SELECT 1 AS "update") x`,
    "SELECT count(*) AS update_count FROM movies",
    "-- leading comment\nSELECT 1",
  ])("accepts %s", (sql) => {
    expect(() => assertReadOnlySql(sql)).not.toThrow();
  });

  it.each([
    ["UPDATE movies SET title = 'x'", /SELECT or WITH/],
    ["DROP TABLE movies", /SELECT or WITH/],
    ["SELECT 1; DROP TABLE movies", /one statement/],
    ["SELECT 1; -- sneaky\n DELETE FROM movies", /one statement/],
    ["WITH d AS (DELETE FROM movies RETURNING *) SELECT * FROM d", /DELETE/],
    ["SELECT * INTO copy_of_movies FROM movies", /INTO/],
    ["SELECT pg_sleep(10)", /pg_sleep/],
    ['SELECT "pg_sleep"(10)', /pg_sleep/],
    ['SELECT "pg_catalog"."pg_sleep" /* hidden */ (10)', /pg_sleep/],
    ['SELECT U&"pg_\\0073leep"(10)', /Unicode/],
    ["SELECT pg_advisory_xact_lock(1)", /advisory/],
    ["SELECT pg_try_advisory_lock(1)", /advisory/],
    ["SELECT pg_sleep_until(now())", /pg_sleep/],
    ["SELECT pg_read_file('/etc/passwd')", /pg_read_file/],
    ["SELECT * FROM movies FOR UPDATE", /UPDATE/],
    ["SELECT set_config('statement_timeout', '0', false)", /set_config|SET/],
    ["", /empty/],
    ["   ", /empty/],
  ])("rejects %s", (sql, message) => {
    expect(() => assertReadOnlySql(sql)).toThrowError(UnsafeSqlError);
    expect(() => assertReadOnlySql(sql)).toThrowError(message);
  });

  it("strips a trailing semicolon", () => {
    expect(assertReadOnlySql("SELECT 1;  ")).toBe("SELECT 1");
  });
});

describe("scrubSql", () => {
  it("removes comments and string contents", () => {
    expect(scrubSql("SELECT 'a;b' -- c;\n/* d; */ FROM x")).toBe(
      "SELECT ''  \n  FROM x",
    );
  });

  it("handles dollar-quoted strings", () => {
    expect(scrubSql("SELECT $$drop;$$, $t$x$t$")).toBe("SELECT '', ''");
  });
});

describe("wrapWithLimit", () => {
  it("caps rows at max + 1 so truncation is detectable", () => {
    expect(wrapWithLimit("SELECT 1", 200)).toMatch(/LIMIT 201$/);
  });
});
