/**
 * R9 fallback: write the eval results table into README.md between the
 * <!-- evals:start --> and <!-- evals:end --> markers.
 *
 *   pnpm eval:report
 */
import { readFileSync, writeFileSync } from "node:fs";
import { AGENT_VERSIONS } from "../src/agent/versions";
import { biggestJump, loadVersionRuns } from "../src/lib/eval-results";
import { CATEGORIES, CATEGORY_LABELS, loadQuestions } from "./questions";

const START = "<!-- evals:start -->";
const END = "<!-- evals:end -->";
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

function table(): string {
  const runs = loadVersionRuns();
  const total = loadQuestions().length;
  if (runs.length === 0) {
    const rows = Object.values(AGENT_VERSIONS).map((v) => `| ${v.id} | ${v.change} | not run yet |`);
    return [`_No eval runs recorded yet (${total} questions ready)._`, "", "| Version | Change | Score |", "|---|---|---|", ...rows].join("\n");
  }

  const header = `| Version | Change | Overall | ${CATEGORIES.map((c) => CATEGORY_LABELS[c]).join(" | ")} | Tool calls | Median latency | Median cost |`;
  const sep = `|---|---|---:|${CATEGORIES.map(() => "---:").join("|")}|---:|---:|---:|`;
  const rows = runs.map(
    (r) =>
      `| ${r.version} | ${r.change} | **${pct(r.accuracy)}** (${r.passed}/${r.total}) | ${CATEGORIES.map((c) =>
        r.by_category[c] ? pct(r.by_category[c].accuracy) : "–",
      ).join(" | ")} | ${r.avg_tool_calls.toFixed(1)} | ${(r.median_latency_ms / 1000).toFixed(1)} s | $${r.median_cost_usd.toFixed(3)} |`,
  );
  const jump = biggestJump(runs);
  const notes = [
    `Model: ${runs.at(-1)?.model}, effort ${runs.at(-1)?.effort}. ${total} questions, 20 per category.`,
    jump
      ? `Biggest single change: ${jump.from.version} → ${jump.to.version} (${jump.delta >= 0 ? "+" : ""}${(jump.delta * 100).toFixed(0)} points), from "${jump.to.change}".`
      : "",
  ].filter(Boolean);
  return [header, sep, ...rows, "", ...notes].join("\n");
}

function main() {
  const readme = readFileSync("README.md", "utf8");
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README.md needs ${START} and ${END} markers.`);
  }
  const next = `${readme.slice(0, start + START.length)}\n${table()}\n${readme.slice(end)}`;
  writeFileSync("README.md", next);
  console.log("Updated the eval results table in README.md");
}

main();
