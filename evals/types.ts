/** Shape of evals/results/vN.json (R5, R11). Read by the /evals page. */

export interface EvalQuestionResult {
  id: string;
  category: string;
  question: string;
  pass: boolean;
  reason: string;
  error?: string;
  tool_calls: number;
  turns: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
  latency_ms: number;
  gold_row_count: number;
  agent_row_count: number;
  agent_sql: string;
  agent_answer: string;
}

export interface CategoryScore {
  total: number;
  passed: number;
  accuracy: number;
}

export interface EvalRun {
  version: string;
  change: string;
  model: string;
  effort: string;
  started_at: string;
  finished_at: string;
  total: number;
  passed: number;
  accuracy: number;
  by_category: Record<string, CategoryScore>;
  avg_tool_calls: number;
  median_latency_ms: number;
  median_cost_usd: number;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  results: EvalQuestionResult[];
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function summarize(
  meta: Pick<EvalRun, "version" | "change" | "model" | "effort" | "started_at">,
  results: EvalQuestionResult[],
): EvalRun {
  const byCategory: Record<string, CategoryScore> = {};
  for (const r of results) {
    const c = (byCategory[r.category] ??= { total: 0, passed: 0, accuracy: 0 });
    c.total++;
    if (r.pass) c.passed++;
  }
  for (const c of Object.values(byCategory)) c.accuracy = c.total ? c.passed / c.total : 0;
  const passed = results.filter((r) => r.pass).length;
  const sum = (f: (r: EvalQuestionResult) => number) => results.reduce((acc, r) => acc + f(r), 0);
  return {
    ...meta,
    finished_at: new Date().toISOString(),
    total: results.length,
    passed,
    accuracy: results.length ? passed / results.length : 0,
    by_category: byCategory,
    avg_tool_calls: results.length ? sum((r) => r.tool_calls) / results.length : 0,
    median_latency_ms: median(results.map((r) => r.latency_ms)),
    median_cost_usd: median(results.map((r) => r.cost_usd)),
    total_cost_usd: sum((r) => r.cost_usd),
    total_input_tokens: sum((r) => r.input_tokens + r.cache_read_tokens),
    total_output_tokens: sum((r) => r.output_tokens),
    results: [...results].sort((a, b) => a.id.localeCompare(b.id)),
  };
}
