/**
 * Scoring rules from the PRD:
 *   - Run the gold SQL to get the gold answer; compare VALUES from the agent's
 *     rows, ignoring column names.
 *   - Order only matters when `ordered` is true.
 *   - Numbers match within 0.01.
 *
 * Extra agent columns are fine (an agent may return title AND year when only
 * the title was asked for). Every gold column must be matched by a distinct
 * agent column, and the row count must be equal.
 */

export const NUMERIC_TOLERANCE = 0.01;

type Cell = number | string | null;

export interface ScoreInput {
  goldColumns: string[];
  goldRows: unknown[][];
  agentColumns: string[];
  agentRows: unknown[][];
  ordered: boolean;
}

export interface ScoreResult {
  pass: boolean;
  reason: string;
  /** gold column index -> agent column index, when a match was found */
  mapping?: number[];
}

/** Normalize one value so equivalent answers compare equal. */
export function normalize(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.map((x) => String(normalize(x))).sort().join("|");
  const s = String(v).trim();
  // Numeric strings ("7.50", "1,234") and decade labels ("1990s") become numbers.
  const numeric = s.replace(/,/g, "");
  if (/^-?\d+(\.\d+)?$/.test(numeric)) return Number(numeric);
  if (/^\d{4}s$/.test(s)) return Number(s.slice(0, 4));
  return s.toLowerCase();
}

export function cellsEqual(a: Cell, b: Cell): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) <= NUMERIC_TOLERANCE + 1e-9;
  }
  return a === b;
}

function column(rows: Cell[][], j: number): Cell[] {
  return rows.map((r) => r[j]);
}

/** Do two columns hold the same values (same order if ordered, else as multisets)? */
function columnsMatch(gold: Cell[], agent: Cell[], ordered: boolean): boolean {
  if (gold.length !== agent.length) return false;
  if (ordered) return gold.every((g, i) => cellsEqual(g, agent[i]));
  const remaining = [...agent];
  for (const g of gold) {
    const k = remaining.findIndex((a) => cellsEqual(g, a));
    if (k === -1) return false;
    remaining.splice(k, 1);
  }
  return true;
}

/** Given a column mapping, check whole rows (keeps values paired up correctly). */
function rowsMatch(gold: Cell[][], agent: Cell[][], mapping: number[], ordered: boolean): boolean {
  const project = (r: Cell[]) => mapping.map((k) => r[k]);
  const rowEq = (g: Cell[], a: Cell[]) => g.every((x, j) => cellsEqual(x, a[j]));
  const projected = agent.map(project);
  if (ordered) return gold.every((g, i) => rowEq(g, projected[i]));
  const remaining = [...projected];
  for (const g of gold) {
    const k = remaining.findIndex((a) => rowEq(g, a));
    if (k === -1) return false;
    remaining.splice(k, 1);
  }
  return true;
}

export function score(input: ScoreInput): ScoreResult {
  const gold = input.goldRows.map((r) => r.map(normalize));
  const agent = input.agentRows.map((r) => r.map(normalize));

  if (gold.length !== agent.length) {
    return { pass: false, reason: `row count ${agent.length}, expected ${gold.length}` };
  }
  if (gold.length === 0) return { pass: true, reason: "both empty", mapping: [] };

  const goldCols = input.goldColumns.length;
  const agentCols = input.agentColumns.length;
  if (agentCols < goldCols) {
    return { pass: false, reason: `${agentCols} columns, expected at least ${goldCols}` };
  }

  // Candidate agent columns for each gold column.
  const candidates: number[][] = [];
  for (let j = 0; j < goldCols; j++) {
    const g = column(gold, j);
    const c: number[] = [];
    for (let k = 0; k < agentCols; k++) {
      if (columnsMatch(g, column(agent, k), input.ordered)) c.push(k);
    }
    if (c.length === 0) {
      return {
        pass: false,
        reason: `no agent column matches gold column "${input.goldColumns[j]}"${input.ordered ? " in order" : ""}`,
      };
    }
    candidates.push(c);
  }

  // Backtrack over injective assignments until whole rows line up.
  const mapping: number[] = [];
  const used = new Set<number>();
  const search = (j: number): boolean => {
    if (j === goldCols) return rowsMatch(gold, agent, mapping, input.ordered);
    for (const k of candidates[j]) {
      if (used.has(k)) continue;
      used.add(k);
      mapping.push(k);
      if (search(j + 1)) return true;
      mapping.pop();
      used.delete(k);
    }
    return false;
  };

  if (search(0)) return { pass: true, reason: "match", mapping: [...mapping] };
  return { pass: false, reason: "columns match individually but rows pair up differently" };
}
