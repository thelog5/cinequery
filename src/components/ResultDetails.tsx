"use client";

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(v);
}

/** Collapsible SQL block (R4). Closed by default; the answer comes first. */
export function SqlBlock({ sql }: { sql: string }) {
  return (
    <details className="disclosure">
      <summary>Show the SQL</summary>
      <pre className="sql">
        <code>{sql}</code>
      </pre>
    </details>
  );
}

export function RowsTable({ columns, rows }: { columns: string[]; rows: Record<string, unknown>[] }) {
  if (rows.length === 0) return null;
  const numeric = new Set(columns.filter((c) => rows.every((r) => r[c] === null || typeof r[c] === "number")));
  return (
    <details className="disclosure" open={rows.length <= 10}>
      <summary>
        {rows.length === 1 ? "1 row" : `${rows.length} rows`}
        {rows.length === 200 ? " (capped at 200)" : ""}
      </summary>
      <div className="table-scroll">
        <table className="rows">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col" className={numeric.has(c) ? "num" : undefined}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c} className={numeric.has(c) ? "num" : undefined}>
                    {formatCell(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
