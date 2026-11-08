/**
 * Agent-loop tests with a scripted fake model, against the real MCP server
 * and a loaded database. No API key needed. Skipped without DATABASE_URL_READONLY.
 */
import "dotenv/config";
import type Anthropic from "@anthropic-ai/sdk";
import { afterAll, describe, expect, it } from "vitest";
import { getReadonlyPool } from "../lib/db";
import { MAX_TOOL_CALLS } from "./prompt";
import { normalizeChart, runAgent } from "./run";
import type { AgentEvent } from "./types";
import { AGENT_VERSIONS } from "./versions";

const hasDb = Boolean(process.env.DATABASE_URL_READONLY);

type Block = { type: "tool_use"; name: string; input: unknown } | { type: "text"; text: string };

/** A fake client whose Nth call returns the Nth scripted turn. */
function scripted(turns: Block[][]) {
  const requests: unknown[] = [];
  let i = 0;
  const client = {
    beta: {
      messages: {
        create: async (params: unknown) => {
          requests.push(structuredClone(params));
          const blocks = turns[Math.min(i, turns.length - 1)];
          i++;
          const content = blocks.map((b, k) => (b.type === "tool_use" ? { ...b, id: `tu_${i}_${k}` } : b));
          return {
            content,
            stop_reason: blocks.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
            usage: { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          };
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, requests };
}

const submit = (sql: string, chart = { type: "none", x: "", y: "", title: "" }) =>
  ({ type: "tool_use", name: "submit_answer", input: { answer: "Here it is.", sql, chart } }) as const;

describe("normalizeChart", () => {
  it("keeps a valid spec and matches columns case-insensitively", () => {
    expect(normalizeChart({ type: "bar", x: "Decade", y: "n", title: "t" }, ["decade", "n"], 5)).toEqual({
      type: "bar",
      x: "decade",
      y: "n",
      title: "t",
    });
  });
  it("drops charts that point at missing columns or a single row", () => {
    expect(normalizeChart({ type: "bar", x: "nope", y: "n", title: "" }, ["decade", "n"], 5).type).toBe("none");
    expect(normalizeChart({ type: "line", x: "decade", y: "n", title: "" }, ["decade", "n"], 1).type).toBe("none");
  });
});

describe.skipIf(!hasDb)("runAgent with a scripted model", () => {
  afterAll(async () => {
    await getReadonlyPool().end();
  });

  it("runs tools through MCP and returns rows from re-running the final SQL", async () => {
    const sql = "SELECT (year / 10) * 10 AS decade, count(*) AS n FROM movies WHERE year BETWEEN 1990 AND 2009 GROUP BY 1 ORDER BY 1";
    const { client, requests } = scripted([
      [{ type: "tool_use", name: "list_tables", input: {} }],
      [{ type: "tool_use", name: "run_query", input: { sql } }],
      [submit(sql, { type: "line", x: "decade", y: "n", title: "Movies per decade" })],
    ]);
    const events: AgentEvent[] = [];
    const r = await runAgent({
      question: "How many movies per decade?",
      version: AGENT_VERSIONS.v4,
      model: "claude-opus-5-5",
      anthropic: client,
      onEvent: (e) => events.push(e),
    });

    expect(r.status).toBe("ok");
    expect(r.columns).toEqual(["decade", "n"]);
    expect(r.rows.map((x) => x.decade)).toEqual([1990, 2000]);
    expect(r.chart).toEqual({ type: "line", x: "decade", y: "n", title: "Movies per decade" });
    expect(r.toolCalls.map((t) => t.name)).toEqual(["list_tables", "run_query"]);
    expect(r.turns).toBe(3);
    expect(r.costUsd).toBeGreaterThan(0);
    expect(events[0].type).toBe("start");
    expect(events.at(-1)?.type).toBe("result");

    // v4 exposes 5 MCP tools + submit_answer, with fallbacks on for Opus.
    const first = requests[0] as { tools: { name: string }[]; fallbacks?: string; system: string };
    expect(first.tools.map((t) => t.name).sort()).toEqual(
      ["describe_table", "list_tables", "run_query", "search_people", "search_titles", "submit_answer"],
    );
    expect(first.fallbacks).toBe("default");
    expect(first.system).toMatch(/Worked examples/);
  });

  it("v1 offers only the three base tools and no worked examples", async () => {
    const { client, requests } = scripted([[submit("SELECT 1 AS one")]]);
    await runAgent({ question: "q", version: AGENT_VERSIONS.v1, model: "claude-opus-5-5", anthropic: client });
    const first = requests[0] as { tools: { name: string }[]; system: string };
    expect(first.tools.map((t) => t.name).sort()).toEqual(["describe_table", "list_tables", "run_query", "submit_answer"]);
    expect(first.system).not.toMatch(/Worked examples/);
  });

  it(`enforces the ${MAX_TOOL_CALLS}-call budget`, async () => {
    const q = { type: "tool_use", name: "run_query", input: { sql: "SELECT 1" } } as const;
    const { client, requests } = scripted([[q, q, q, q], [q, q, q, q], [q, q], [submit("SELECT 1 AS one")]]);
    const r = await runAgent({ question: "q", version: AGENT_VERSIONS.v4, model: "claude-opus-5-5", anthropic: client });
    expect(r.status).toBe("ok");
    expect(r.toolCalls).toHaveLength(MAX_TOOL_CALLS);
    // The third turn's two calls were refused with a budget message.
    const msgs = (requests[3] as { messages: { role: string; content: unknown }[] }).messages;
    const lastResults = msgs.at(-1)?.content as { is_error?: boolean; content: string }[];
    expect(lastResults.every((x) => x.is_error && /budget/i.test(x.content))).toBe(true);
  });

  it("lets the model fix a final query that fails", async () => {
    const { client } = scripted([[submit("SELECT nope FROM movies")], [submit("SELECT count(*) AS n FROM movies")]]);
    const r = await runAgent({ question: "q", version: AGENT_VERSIONS.v4, model: "claude-opus-5-5", anthropic: client });
    expect(r.status).toBe("ok");
    expect(r.turns).toBe(2);
    expect(r.rows).toHaveLength(1);
  });

  it("rejects a write smuggled into the final answer", async () => {
    const { client } = scripted([[submit("DELETE FROM movies")], [submit("DROP TABLE movies")], [submit("UPDATE movies SET year = 1")]]);
    const r = await runAgent({ question: "q", version: AGENT_VERSIONS.v4, model: "claude-opus-5-5", anthropic: client });
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/kept failing/);
  });

  it("nudges once, then gives up if the model never submits", async () => {
    const { client, requests } = scripted([[{ type: "text", text: "I think it's 42." }]]);
    const r = await runAgent({ question: "q", version: AGENT_VERSIONS.v4, model: "claude-opus-5-5", anthropic: client });
    expect(r.status).toBe("error");
    expect(requests).toHaveLength(2);
  });

  it("omits server fallbacks for Haiku", async () => {
    const { client, requests } = scripted([[submit("SELECT 1 AS one")]]);
    await runAgent({ question: "q", version: AGENT_VERSIONS.v4, model: "claude-haiku-5-5", anthropic: client });
    expect((requests[0] as { fallbacks?: string }).fallbacks).toBeUndefined();
  });
});
