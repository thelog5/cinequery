import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { EvalRun } from "../../evals/types";

const RESULTS_DIR = join(process.cwd(), "evals", "results");

/** Full runs on the default model, one per version (v1.json, v2.json, ...). */
export function loadVersionRuns(): EvalRun[] {
  return loadRuns(/^v\d+\.json$/);
}

/** Runs on other models (v4.claude-sonnet-5-5.json), for the model comparison. */
export function loadOtherModelRuns(): EvalRun[] {
  return loadRuns(/^v\d+\..+\.json$/);
}

function loadRuns(pattern: RegExp): EvalRun[] {
  if (!existsSync(RESULTS_DIR)) return [];
  return readdirSync(RESULTS_DIR)
    .filter((f) => pattern.test(f))
    .map((f) => JSON.parse(readFileSync(join(RESULTS_DIR, f), "utf8")) as EvalRun)
    .sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }) || a.model.localeCompare(b.model));
}

/** The largest version-over-version accuracy change, for the headline. */
export function biggestJump(runs: EvalRun[]): { from: EvalRun; to: EvalRun; delta: number } | null {
  let best: { from: EvalRun; to: EvalRun; delta: number } | null = null;
  for (let i = 1; i < runs.length; i++) {
    const delta = runs[i].accuracy - runs[i - 1].accuracy;
    if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { from: runs[i - 1], to: runs[i], delta };
  }
  return best;
}
