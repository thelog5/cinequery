/**
 * The Cinequery agent loop (R3).
 *
 * The agent reaches the database only through the MCP server, which runs
 * in-process over an in-memory transport. It may make at most MAX_TOOL_CALLS
 * data-tool calls, then finishes by calling the local submit_answer tool.
 * The submitted SQL is re-run through the read-only runner, so the rows the
 * user sees (and the eval scores) come from the database, never from the model.
 */
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { QueryError, rowsToObjects, runReadOnlyQuery } from "../lib/db";
import { env } from "../lib/env";
import { createCinequeryServer } from "../mcp/server";
import { MAX_TOOL_CALLS, SUBMIT_ANSWER_TOOL, buildSystemPrompt } from "./prompt";
import { addUsage, costUsd, emptyUsage, supportsServerFallback } from "./pricing";
import type { AgentAnswer, AgentEvent, AgentRunResult, ChartSpec, ToolCallRecord } from "./types";
import { type AgentVersion, getVersion } from "./versions";


type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** Hard ceiling on model round trips, independent of the tool budget. */
const MAX_TURNS = MAX_TOOL_CALLS + 4;
const MAX_SUBMIT_ATTEMPTS = 3;

export interface RunAgentOptions {
  question: string;
  version?: AgentVersion;
  model?: string;
  effort?: Effort;
  onEvent?: (event: AgentEvent) => void;
  anthropic?: Anthropic;
}

interface SubmitInput {
  answer: string;
  sql: string;
  chart: ChartSpec;
}

// ------------------------------------------------------------------ MCP
async function connectMcp(version: AgentVersion) {
  const server = createCinequeryServer(version);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "cinequery-agent", version: "0.1.0" });
  await client.connect(clientTransport);
  return {
    client,
    async close() {
      await client.close().catch(() => {});
      await server.close().catch(() => {});
    },
  };
}

/** MCP tool definitions -> Anthropic tool definitions. */
function toAnthropicTools(tools: Awaited<ReturnType<Client["listTools"]>>["tools"]): Anthropic.Beta.BetaTool[] {
  return tools.map((t) => {
    const { $schema: _ignored, ...schema } = t.inputSchema as Record<string, unknown>;
    return {
      name: t.name,
      description: t.description ?? "",
      input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
    };
  });
}

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((c): c is { type: "text"; text: string } => c?.type === "text")
    .map((c) => c.text)
    .join("\n");
}

/** One-line description of a tool result for the UI trace. */
export function summarizeToolResult(name: string, text: string, ok: boolean): string {
  if (!ok) return text.length > 160 ? `${text.slice(0, 157)}...` : text;
  try {
    const data = JSON.parse(text);
    switch (name) {
      case "list_tables":
        return `${data.length} tables`;
      case "describe_table":
        return `${data.columns.length} columns${data.sample_rows ? `, ${data.sample_rows.length} sample rows` : ""}`;
      case "search_people":
      case "search_titles":
        return data.length === 0
          ? "no matches"
          : `${data.length} matches: ${data
              .slice(0, 3)
              .map((d: { name?: string; title?: string }) => d.name ?? d.title)
              .join(", ")}`;
      case "run_query":
        return `${data.row_count}${data.truncated ? "+" : ""} rows in ${data.execution_ms} ms`;
    }
  } catch {
    // fall through
  }
  return "ok";
}

// ---------------------------------------------------------------- chart
/** Keep the model's chart spec only if it points at real columns. */
export function normalizeChart(chart: ChartSpec | undefined, columns: string[], rowCount: number): ChartSpec {
  const none: ChartSpec = { type: "none", x: "", y: "", title: chart?.title ?? "" };
  if (!chart || chart.type === "none" || rowCount < 2) return none;
  const find = (name: string) => columns.find((c) => c === name) ?? columns.find((c) => c.toLowerCase() === name.toLowerCase());
  const x = find(chart.x);
  const y = find(chart.y);
  if (!x || !y) return none;
  return { type: chart.type, x, y, title: chart.title };
}

// ----------------------------------------------------------------- loop
export async function runAgent(opts: RunAgentOptions): Promise<AgentRunResult> {
  const started = Date.now();
  const version = opts.version ?? getVersion(undefined);
  const model = opts.model ?? env.model();
  const effort = opts.effort ?? env.effort();
  const emit = opts.onEvent ?? (() => {});
  const anthropic = opts.anthropic ?? new Anthropic({ timeout: 90_000, maxRetries: 2 });

  const usage = emptyUsage();
  const toolCalls: ToolCallRecord[] = [];
  let turns = 0;

  const finish = (fields: Partial<AgentRunResult> & Pick<AgentRunResult, "status">): AgentRunResult => {
    const result: AgentRunResult = {
      answer: "",
      sql: "",
      columns: [],
      rows: [],
      chart: { type: "none", x: "", y: "", title: "" },
      version: version.id,
      model,
      toolCalls,
      turns,
      usage,
      costUsd: costUsd(model, usage),
      latencyMs: Date.now() - started,
      ...fields,
    };
    emit({ type: "result", result });
    return result;
  };

  emit({ type: "start", version: version.id, model });
  const mcp = await connectMcp(version);

  try {
    const { tools: mcpTools } = await mcp.client.listTools();
    const tools: Anthropic.Beta.BetaTool[] = [...toAnthropicTools(mcpTools), SUBMIT_ANSWER_TOOL as Anthropic.Beta.BetaTool];
    const system = buildSystemPrompt(version);
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.question }];

    let dataCalls = 0;
    let submitAttempts = 0;
    let nudged = false;

    while (turns < MAX_TURNS) {
      turns++;
      const response = await anthropic.beta.messages.create({
        model,
        max_tokens: 16000,
        system,
        tools,
        messages,
        output_config: { effort },
        // Auto-cache the stable prefix (tools + system + earlier turns).
        cache_control: { type: "ephemeral" },
        ...(supportsServerFallback(model)
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
      });
      addUsage(usage, response.usage);

      if (response.stop_reason === "refusal") {
        return finish({ status: "error", error: "The model declined to answer this question." });
      }
      // Append the whole content unchanged (thinking blocks must round-trip).
      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0) {
        if (response.stop_reason === "max_tokens") {
          return finish({ status: "error", error: "The model ran out of output tokens." });
        }
        if (!nudged) {
          nudged = true;
          messages.push({ role: "user", content: "Please finish by calling submit_answer." });
          continue;
        }
        return finish({ status: "error", error: "The agent stopped without submitting an answer." });
      }
      if (response.stop_reason === "max_tokens") {
        return finish({ status: "error", error: "A tool call was cut off (max_tokens)." });
      }

      // Decide each call up front so the budget is applied in order, then run
      // the allowed data calls concurrently.
      let final: AgentAnswer | null = null;
      const results = await Promise.all(
        toolUses.map(async (tu): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          if (tu.name === SUBMIT_ANSWER_TOOL.name) {
            submitAttempts++;
            const submitted = tu.input as SubmitInput;
            const t0 = Date.now();
            emit({ type: "tool_call", id: tu.id, name: tu.name, input: { sql: submitted.sql } });
            try {
              const q = await runReadOnlyQuery(submitted.sql);
              const summary = `final query: ${q.rowCount}${q.truncated ? "+" : ""} rows`;
              emit({ type: "tool_result", id: tu.id, name: tu.name, ok: true, summary, ms: Date.now() - t0 });
              final = {
                answer: submitted.answer.trim(),
                sql: submitted.sql.trim(),
                columns: q.columns,
                rows: rowsToObjects(q.columns, q.rows),
                chart: normalizeChart(submitted.chart, q.columns, q.rowCount),
              };
              return { type: "tool_result", tool_use_id: tu.id, content: "Accepted." };
            } catch (err) {
              const message = err instanceof QueryError ? err.message : String(err);
              emit({ type: "tool_result", id: tu.id, name: tu.name, ok: false, summary: message, ms: Date.now() - t0 });
              return {
                type: "tool_result",
                tool_use_id: tu.id,
                is_error: true,
                content: `Your final sql failed when re-run: ${message} Fix it and call submit_answer again.`,
              };
            }
          }

          if (dataCalls >= MAX_TOOL_CALLS) {
            return {
              type: "tool_result",
              tool_use_id: tu.id,
              is_error: true,
              content: `Tool budget used up (${MAX_TOOL_CALLS} of ${MAX_TOOL_CALLS}). Call submit_answer now with your best answer.`,
            };
          }
          dataCalls++;
          const t0 = Date.now();
          emit({ type: "tool_call", id: tu.id, name: tu.name, input: tu.input });
          let text: string;
          let ok: boolean;
          try {
            const res = await mcp.client.callTool({ name: tu.name, arguments: tu.input as Record<string, unknown> });
            text = textOf(res.content);
            ok = !res.isError;
          } catch (err) {
            text = err instanceof Error ? err.message : String(err);
            ok = false;
          }
          const ms = Date.now() - t0;
          const summary = summarizeToolResult(tu.name, text, ok);
          toolCalls.push({ name: tu.name, input: tu.input, ok, summary, ms });
          emit({ type: "tool_result", id: tu.id, name: tu.name, ok, summary, ms });
          return { type: "tool_result", tool_use_id: tu.id, content: text, ...(ok ? {} : { is_error: true }) };
        }),
      );

      if (final) return finish({ status: "ok", ...(final as AgentAnswer) });
      if (submitAttempts >= MAX_SUBMIT_ATTEMPTS) {
        return finish({ status: "error", error: "The agent's final query kept failing." });
      }
      messages.push({ role: "user", content: results });
    }

    return finish({ status: "error", error: `The agent did not finish within ${MAX_TURNS} steps.` });
  } catch (err) {
    const message =
      err instanceof Anthropic.RateLimitError
        ? "The model is rate limited right now. Try again in a minute."
        : err instanceof Anthropic.AuthenticationError
          ? "The server's Anthropic API key is missing or invalid."
          : err instanceof Anthropic.APIError
            ? `Model API error (${err.status}): ${err.message}`
            : err instanceof Error
              ? err.message
              : String(err);
    return finish({ status: "error", error: message });
  } finally {
    await mcp.close();
  }
}
