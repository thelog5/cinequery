/**
 * R5: score an agent version against evals/questions.jsonl and save
 * evals/results/<version>.json.
 *
 *   pnpm eval --version v1
 *   pnpm eval --version v3 --category name_ambiguity --limit 5
 *   pnpm eval --version v4 --model claude-sonnet-5-5   # -> v4.claude-sonnet-5-5.json
 *
 * Options:
 *   --version v1..v4      required
 *   --model <id>          default CINEQUERY_MODEL or claude-opus-5-5
 *   --effort <level>      default CINEQUERY_EFFORT or medium
 *   --concurrency N       parallel questions (default 4)
 *   --ids a01,j07         only these questions
 *   --category <name>     only this category
 *   --limit N             first N questions after filtering
 *   --max-cost USD        stop starting new questions past this spend (default 25)
 *   --out <path>          override the output file
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { runAgent } from "../src/agent/run";
import { getVersion } from "../src/agent/versions";
import { getReadonlyPool, runReadOnlyQuery } from "../src/lib/db";
import { env } from "../src/lib/env";
import { type EvalQuestion, loadQuestions } from "./questions";
import { score } from "./score";
import { type EvalQuestionResult, summarize } from "./types";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function evaluate(
  q: EvalQuestion,
  opts: { version: ReturnType<typeof getVersion>; model: string; effort: Effort },
): Promise<EvalQuestionResult> {
  const gold = await runReadOnlyQuery(q.gold_sql);
  const agent = await runAgent({ question: q.question, version: opts.version, model: opts.model, effort: opts.effort });

  const base = {
    id: q.id,
    category: q.category,
    question: q.question,
    tool_calls: agent.toolCalls.length,
    turns: agent.turns,
    input_tokens: agent.usage.input_tokens + agent.usage.cache_creation_input_tokens,
    output_tokens: agent.usage.output_tokens,
    cache_read_tokens: agent.usage.cache_read_input_tokens,
    cost_usd: Number(agent.costUsd.toFixed(6)),
    latency_ms: agent.latencyMs,
    gold_row_count: gold.rowCount,
    agent_row_count: agent.rows.length,
    agent_sql: agent.sql,
    agent_answer: agent.answer,
  };

  if (agent.status !== "ok") {
    return { ...base, pass: false, reason: "agent error", error: agent.error };
  }
  const s = score({
    goldColumns: gold.columns,
    goldRows: gold.rows,
    agentColumns: agent.columns,
    agentRows: agent.rows.map((r) => agent.columns.map((c) => r[c])),
    ordered: q.ordered,
  });
  return { ...base, pass: s.pass, reason: s.reason };
}

async function main() {
  const versionId = arg("version");
  if (!versionId) {
    console.error("Usage: pnpm eval --version v1|v2|v3|v4 [--model id] [--concurrency N] [--ids ...]");
    process.exit(1);
  }
  const version = getVersion(versionId);
  const model = arg("model") ?? env.model();
  const effort = (arg("effort") ?? env.effort()) as Effort;
  const concurrency = Number(arg("concurrency") ?? 4);
  const maxCost = Number(arg("max-cost") ?? 25);
  const ids = arg("ids")?.split(",");
  const category = arg("category");
  const limit = arg("limit") ? Number(arg("limit")) : undefined;

  let questions = loadQuestions();
  if (ids) questions = questions.filter((q) => ids.includes(q.id));
  if (category) questions = questions.filter((q) => q.category === category);
  if (limit) questions = questions.slice(0, limit);

  const defaultModel = model === "claude-opus-5-5";
  const partial = Boolean(ids || category || limit);
  // Partial runs go to a gitignored scratch folder so they never clobber a full vN.json.
  const out =
    arg("out") ??
    `evals/results/${partial ? "scratch/" : ""}${version.id}${defaultModel ? "" : `.${model}`}.json`;

  console.log(`Evaluating ${version.id} (${version.change}) on ${questions.length} questions with ${model} @ ${effort}`);
  const started_at = new Date().toISOString();
  const results: EvalQuestionResult[] = [];
  let spent = 0;
  let next = 0;
  let stoppedForCost = false;

  const save = () => {
    const run = summarize({ version: version.id, change: version.change, model, effort, started_at }, results);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(run, null, 2)}\n`);
    return run;
  };

  async function worker() {
    while (next < questions.length) {
      if (spent >= maxCost) {
        stoppedForCost = true;
        return;
      }
      const q = questions[next++];
      let r: EvalQuestionResult;
      try {
        r = await evaluate(q, { version, model, effort });
      } catch (err) {
        r = {
          id: q.id, category: q.category, question: q.question, pass: false, reason: "harness error",
          error: (err as Error).message, tool_calls: 0, turns: 0, input_tokens: 0, output_tokens: 0,
          cache_read_tokens: 0, cost_usd: 0, latency_ms: 0, gold_row_count: 0, agent_row_count: 0,
          agent_sql: "", agent_answer: "",
        };
      }
      results.push(r);
      spent += r.cost_usd;
      const mark = r.pass ? "✓" : "✗";
      console.log(
        `${mark} ${r.id.padEnd(4)} ${String(r.tool_calls).padStart(2)} calls ${(r.latency_ms / 1000).toFixed(1).padStart(5)}s ` +
          `$${r.cost_usd.toFixed(4)}  ${r.pass ? "" : `${r.reason}${r.error ? `: ${r.error}` : ""}`}`,
      );
      save();
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  const run = save();
  await getReadonlyPool().end();

  console.log(`\n${version.id}: ${run.passed}/${run.total} = ${(run.accuracy * 100).toFixed(1)}%${partial ? " (partial run)" : ""}`);
  for (const [cat, c] of Object.entries(run.by_category)) {
    console.log(`  ${cat.padEnd(15)} ${c.passed}/${c.total}  ${(c.accuracy * 100).toFixed(0)}%`);
  }
  console.log(
    `  avg tool calls ${run.avg_tool_calls.toFixed(1)} · median latency ${(run.median_latency_ms / 1000).toFixed(1)} s · ` +
      `median cost $${run.median_cost_usd.toFixed(4)} · total $${run.total_cost_usd.toFixed(2)}`,
  );
  if (stoppedForCost) console.log(`Stopped early: spend reached the --max-cost limit of $${maxCost}.`);
  console.log(`Saved ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
