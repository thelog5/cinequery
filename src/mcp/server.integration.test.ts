/**
 * Integration tests against a real loaded database through the real MCP
 * server. Skipped unless DATABASE_URL_READONLY is set (pnpm db:load first).
 * These double as evidence for the PRD's safety acceptance criteria.
 */
import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENT_VERSIONS } from "../agent/versions";
import { getReadonlyPool } from "../lib/db";
import { createCinequeryServer } from "./server";

const hasDb = Boolean(process.env.DATABASE_URL_READONLY);

async function connect(versionId: keyof typeof AGENT_VERSIONS) {
  const server = createCinequeryServer(AGENT_VERSIONS[versionId]);
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(c);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { type: string; text: string }[]).map((c) => c.text).join("");
  return { isError: Boolean(res.isError), text, json: () => JSON.parse(text) };
}

describe.skipIf(!hasDb)("MCP server against the loaded database", () => {
  let v1: Client;
  let v4: Client;

  beforeAll(async () => {
    v1 = await connect("v1");
    v4 = await connect("v4");
  });

  afterAll(async () => {
    await v1.close();
    await v4.close();
    await getReadonlyPool().end();
  });

  it("registers 3 tools in v1 and 5 in v3+", async () => {
    expect((await v1.listTools()).tools.map((t) => t.name).sort()).toEqual(
      ["describe_table", "list_tables", "run_query"],
    );
    expect((await v4.listTools()).tools.map((t) => t.name).sort()).toEqual(
      ["describe_table", "list_tables", "run_query", "search_people", "search_titles"],
    );
  });

  it("list_tables returns all four tables with descriptions", async () => {
    const tables = (await call(v4, "list_tables")).json();
    expect(tables.map((t: { table: string }) => t.table)).toEqual(["movies", "ratings", "people", "credits"]);
    for (const t of tables) expect(t.description.length).toBeGreaterThan(10);
  });

  it("describe_table is bare in v1 and rich (comments + 3 samples) in v2+", async () => {
    const bare = (await call(v1, "describe_table", { table: "movies" })).json();
    expect(bare.columns[0]).not.toHaveProperty("comment");
    expect(bare).not.toHaveProperty("sample_rows");

    const rich = (await call(v4, "describe_table", { table: "movies" })).json();
    expect(rich.columns.every((c: { comment: string }) => c.comment.length > 0)).toBe(true);
    expect(rich.sample_rows).toHaveLength(3);
  });

  it("search_people resolves a bare surname to the famous match", async () => {
    const people = (await call(v4, "search_people", { name: "Nolan" })).json();
    expect(people[0].name).toBe("Christopher Nolan");
    expect(people[0].known_for.length).toBeGreaterThan(0);
  });

  it("search_titles tolerates partial titles", async () => {
    const titles = (await call(v4, "search_titles", { title: "shawshank" })).json();
    expect(titles[0].title).toBe("The Shawshank Redemption");
  });

  it("run_query returns rows, count, and timing", async () => {
    const r = (await call(v4, "run_query", { sql: "SELECT title, year FROM movies ORDER BY tconst LIMIT 3" })).json();
    expect(r.columns).toEqual(["title", "year"]);
    expect(r.row_count).toBe(3);
    expect(typeof r.execution_ms).toBe("number");
  });

  it("caps results at 200 rows and flags truncation", async () => {
    const r = (await call(v4, "run_query", { sql: "SELECT tconst FROM movies" })).json();
    expect(r.row_count).toBe(200);
    expect(r.truncated).toBe(true);
  });

  // Acceptance: "An UPDATE or DROP slipped into a question is rejected and changes nothing."
  it.each([
    "UPDATE ratings SET avg_rating = 10",
    "DROP TABLE movies",
    "SELECT 1; DROP TABLE movies",
    "WITH x AS (DELETE FROM credits RETURNING *) SELECT count(*) FROM x",
  ])("rejects write attempt: %s", async (sql) => {
    const before = (await call(v4, "run_query", { sql: "SELECT count(*) AS n FROM movies" })).json().rows[0][0];
    const r = await call(v4, "run_query", { sql });
    expect(r.isError).toBe(true);
    const after = (await call(v4, "run_query", { sql: "SELECT count(*) AS n FROM movies" })).json().rows[0][0];
    expect(after).toBe(before);
  });

  // Acceptance: "A deliberately slow query is killed at 5 seconds with a friendly error."
  it(
    "kills a slow query at 5 seconds with a friendly error",
    async () => {
      const started = Date.now();
      const r = await call(v4, "run_query", {
        sql: "SELECT count(*) FROM credits a CROSS JOIN credits b WHERE a.nconst <> b.nconst",
      });
      const elapsed = Date.now() - started;
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/longer than 5 seconds/);
      expect(elapsed).toBeGreaterThanOrEqual(4_500);
      expect(elapsed).toBeLessThan(8_000);
    },
    15_000,
  );
});
