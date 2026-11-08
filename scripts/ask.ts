/**
 * Ask the agent a question from the terminal and watch its tool calls.
 *   pnpm ask "Which director has the most movies rated 8+?" [--version v3] [--model claude-sonnet-5-5]
 */
import "dotenv/config";
import { runAgent } from "../src/agent/run";
import { getVersion } from "../src/agent/versions";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const question = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
  if (!question) {
    console.error('Usage: pnpm ask "<question>" [--version v1|v2|v3|v4] [--model <id>]');
    process.exit(1);
  }
  const result = await runAgent({
    question,
    version: getVersion(arg("version")),
    model: arg("model"),
    onEvent: (e) => {
      if (e.type === "tool_call") console.log(`→ ${e.name} ${JSON.stringify(e.input).slice(0, 200)}`);
      if (e.type === "tool_result") console.log(`  ${e.ok ? "✓" : "✗"} ${e.summary} (${e.ms} ms)`);
    },
  });

  console.log();
  if (result.status === "error") {
    console.log(`ERROR: ${result.error}`);
  } else {
    console.log(result.answer);
    console.log(`\n${result.sql}\n`);
    console.table(result.rows.slice(0, 15));
    console.log(`chart: ${JSON.stringify(result.chart)}`);
  }
  console.log(
    `\n${result.version} · ${result.model} · ${result.toolCalls.length} tool calls · ${result.turns} turns · ` +
      `${result.usage.input_tokens + result.usage.cache_read_input_tokens + result.usage.cache_creation_input_tokens} in / ` +
      `${result.usage.output_tokens} out tokens · $${result.costUsd.toFixed(4)} · ${(result.latencyMs / 1000).toFixed(1)} s`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
