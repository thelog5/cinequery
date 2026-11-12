"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";
import type { ChartSpec } from "@/agent/types";

const AXIS = {
  fill: "var(--muted)",
  fontSize: 14,
  fontFamily: "var(--font-display)",
};
const tooltipStyle = {
  background: "var(--panel)",
  border: "1px solid var(--rule)",
  borderRadius: 4,
  color: "var(--ink)",
  fontSize: 13,
};

function truncate(label: unknown, max = 18) {
  const s = String(label ?? "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function ResultChart({
  spec,
  rows,
}: {
  spec: ChartSpec;
  rows: Record<string, unknown>[];
}) {
  const [width, setWidth] = useState(600);
  const compact = width < 500;
  if (spec.type === "none" || rows.length < 2) return null;

  // Recharts needs numbers on the value axis; drop rows where y isn't numeric.
  const data = rows
    .map((r) => ({
      ...r,
      [spec.y]: typeof r[spec.y] === "number" ? r[spec.y] : Number(r[spec.y]),
    }))
    .filter((r) => Number.isFinite(r[spec.y] as number));
  if (data.length < 2) return null;

  // Long category labels read better as a horizontal bar chart.
  const longLabels = data.some((r) => String(r[spec.x]).length > 10);
  const horizontal = spec.type === "bar" && longLabels;
  const height = horizontal ? Math.max(220, data.length * 30 + 40) : 300;

  return (
    <figure
      className="chart"
      aria-label={spec.title || `${spec.y} by ${spec.x}`}
    >
      {spec.title && (
        <figcaption className="chart-title">{spec.title}</figcaption>
      )}
      <ResponsiveContainer
        width="100%"
        height={height}
        onResize={(w) => setWidth(w)}
      >
        {spec.type === "line" ? (
          <LineChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          >
            <CartesianGrid stroke="var(--rule)" vertical={false} />
            <XAxis dataKey={spec.x} tick={AXIS} stroke="var(--rule)" />
            <YAxis
              tick={AXIS}
              stroke="var(--rule)"
              width={56}
              domain={["auto", "auto"]}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey={spec.y}
              stroke="var(--chart)"
              strokeWidth={2}
              dot={{
                r: 4,
                fill: "var(--chart)",
                stroke: "var(--panel)",
                strokeWidth: 2,
              }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        ) : horizontal ? (
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
          >
            <CartesianGrid stroke="var(--rule)" horizontal={false} />
            <XAxis type="number" tick={AXIS} stroke="var(--rule)" />
            <YAxis
              type="category"
              dataKey={spec.x}
              tick={AXIS}
              stroke="var(--rule)"
              width={compact ? 100 : 150}
              tickFormatter={(v) => truncate(v, compact ? 15 : 22)}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: "var(--rule)", opacity: 0.4 }}
            />
            <Bar dataKey={spec.y} fill="var(--chart)" radius={[0, 4, 4, 0]} />
          </BarChart>
        ) : (
          <BarChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          >
            <CartesianGrid stroke="var(--rule)" vertical={false} />
            <XAxis
              dataKey={spec.x}
              tick={AXIS}
              stroke="var(--rule)"
              tickFormatter={(v) => truncate(v)}
            />
            <YAxis tick={AXIS} stroke="var(--rule)" width={56} />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: "var(--rule)", opacity: 0.4 }}
            />
            <Bar dataKey={spec.y} fill="var(--chart)" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </figure>
  );
}
