import type { TokenUsage } from "./pricing";

export type ChartType = "bar" | "line" | "none";

export interface ChartSpec {
  type: ChartType;
  x: string;
  y: string;
  title: string;
}

/** The PRD's agent output contract, plus the column names the UI needs. */
export interface AgentAnswer {
  answer: string;
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  chart: ChartSpec;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  ok: boolean;
  /** Short human summary for the UI trace, e.g. "12 rows in 41 ms". */
  summary: string;
  ms: number;
}

export interface AgentRunResult extends AgentAnswer {
  status: "ok" | "error";
  error?: string;
  version: string;
  model: string;
  toolCalls: ToolCallRecord[];
  turns: number;
  usage: TokenUsage;
  costUsd: number;
  latencyMs: number;
}

/** Events streamed to the UI while the agent works (R10). */
export type AgentEvent =
  | { type: "start"; version: string; model: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; ok: boolean; summary: string; ms: number }
  | { type: "result"; result: AgentRunResult };
