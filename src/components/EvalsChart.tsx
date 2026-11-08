"use client";

import { CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface VersionPoint {
  version: string;
  change: string;
  accuracy: number; // 0-100
  passed: number;
  total: number;
}

const AXIS = { stroke: "var(--muted)", fontSize: 12 };

function TooltipBody({ active, payload }: { active?: boolean; payload?: { payload: VersionPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--rule)",
        borderRadius: 4,
        padding: "8px 10px",
        fontSize: 13,
        color: "var(--ink)",
        maxWidth: 240,
      }}
    >
      <strong>
        {p.version}: {p.accuracy.toFixed(1)}%
      </strong>
      <div style={{ color: "var(--muted)" }}>
        {p.passed}/{p.total} correct
      </div>
      <div>{p.change}</div>
    </div>
  );
}

/** Overall accuracy per agent version: one series, direct-labelled (4 points). */
export function EvalsChart({ points }: { points: VersionPoint[] }) {
  return (
    <figure className="chart" aria-label="Overall accuracy by agent version">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={points} margin={{ top: 28, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--rule)" vertical={false} />
          <XAxis dataKey="version" tick={AXIS} stroke="var(--rule)" padding={{ left: 24, right: 24 }} />
          <YAxis
            tick={AXIS}
            stroke="var(--rule)"
            width={44}
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip content={<TooltipBody />} cursor={{ stroke: "var(--rule)" }} />
          <Line
            type="linear"
            dataKey="accuracy"
            stroke="var(--chart)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--chart)", stroke: "var(--panel)", strokeWidth: 2 }}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="accuracy"
              position="top"
              offset={12}
              formatter={(v) => `${Number(v).toFixed(0)}%`}
              style={{ fill: "var(--ink)", fontSize: 13, fontWeight: 600 }}
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}
