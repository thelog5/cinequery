/**
 * Sanity-check every gold query before spending money on agent runs:
 *   - it runs on the read-only role and returns at least one row
 *   - it returns at most 200 rows (the agent can't return more)
 *   - for "top N" queries, row N and row N+1 don't tie on their numeric
 *     columns, which would make more than one answer correct
 *
 * Usage: pnpm eval:check-gold [--show] [--ids a01,a02]
 */
import "dotenv/config";
import { getReadonlyPool, runReadOnlyQuery } from "../src/lib/db";
import { loadQuestions } from "./questions";

const show = process.argv.includes("--show");
const idsArg = process.argv.indexOf("--ids");
const onlyIds = idsArg === -1 ? null : new Set(process.argv[idsArg + 1].split(","));

function preview(columns: string[], rows: unknown[][], n = 3): string {
  return rows
    .slice(0, n)
    .map((r) => columns.map((c, i) => `${c}=${JSON.stringify(r[i])}`).join(" "))
    .join(" | ");
}

async function main() {
  const questions = loadQuestions().filter((q) => !onlyIds || onlyIds.has(q.id));
  let problems = 0;

  for (const q of questions) {
    const issues: string[] = [];
    let summary = "";
    try {
      const r = await runReadOnlyQuery(q.gold_sql);
      summary = `${r.rowCount} rows in ${r.elapsedMs} ms`;
      if (r.rowCount === 0) issues.push("returns no rows");
      if (r.truncated) issues.push("returns more than 200 rows");

      const limit = /\blimit\s+(\d+)\s*;?\s*$/i.exec(q.gold_sql);
      // Questions that state their own tiebreak ("break ties by ...") are exempt.
      if (limit && r.rowCount === Number(limit[1]) && !/\btie/i.test(q.question)) {
        const n = Number(limit[1]);
        const wider = await runReadOnlyQuery(q.gold_sql.replace(/\blimit\s+\d+\s*;?\s*$/i, `LIMIT ${n + 1}`));
        if (wider.rowCount > n) {
          const last = wider.rows[n - 1];
          const next = wider.rows[n];
          const numericIdx = last.map((v, i) => (typeof v === "number" ? i : -1)).filter((i) => i >= 0);
          if (numericIdx.length > 0 && numericIdx.every((i) => last[i] === next[i])) {
            issues.push(`tie at the LIMIT ${n} cutoff: ${JSON.stringify(last)} vs ${JSON.stringify(next)}`);
          }
        }
      }
      if (show || issues.length) summary += `  ${preview(r.columns, r.rows)}`;
    } catch (err) {
      issues.push(`error: ${(err as Error).message}`);
    }

    const flag = issues.length ? "✗" : "✓";
    if (issues.length) problems++;
    if (issues.length || show) {
      console.log(`${flag} ${q.id} ${q.question}\n    ${summary}${issues.length ? `\n    ${issues.join("; ")}` : ""}`);
    }
  }

  console.log(`\n${questions.length - problems}/${questions.length} gold queries look healthy`);
  await getReadonlyPool().end();
  if (problems) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
