"use client";

import { useRef, useState } from "react";
import type { AgentEvent, AgentRunResult } from "@/agent/types";
import { EXAMPLE_QUESTIONS } from "@/lib/examples";
import { ResultChart } from "./ResultChart";
import { RowsTable, SqlBlock } from "./ResultDetails";

interface TraceItem {
  id: string;
  name: string;
  detail: string;
  status: "running" | "ok" | "error";
  ms?: number;
}

const TOOL_LABELS: Record<string, string> = {
  list_tables: "list_tables",
  describe_table: "describe_table",
  search_people: "search_people",
  search_titles: "search_titles",
  run_query: "run_query",
  submit_answer: "final query",
};

function describeInput(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, string>;
  if (name === "describe_table") return i.table ?? "";
  if (name === "search_people") return `"${i.name ?? ""}"`;
  if (name === "search_titles") return `"${i.title ?? ""}"`;
  if (name === "run_query" || name === "submit_answer") return (i.sql ?? "").replace(/\s+/g, " ").slice(0, 90);
  return "";
}

export function AskClient() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<TraceItem[]>([]);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleEvent(e: AgentEvent) {
    if (e.type === "tool_call") {
      setTrace((t) => [
        ...t,
        { id: e.id, name: e.name, detail: describeInput(e.name, e.input), status: "running" },
      ]);
    } else if (e.type === "tool_result") {
      setTrace((t) =>
        t.map((item) =>
          item.id === e.id
            ? { ...item, status: e.ok ? "ok" : "error", ms: e.ms, detail: e.ok ? item.detail || e.summary : e.summary }
            : item,
        ),
      );
    } else if (e.type === "result") {
      if (e.result.status === "ok") setResult(e.result);
      else setError(e.result.error ?? "The agent couldn't answer that one.");
    }
  }

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setQuestion(text);
    setBusy(true);
    setTrace([]);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, stream: true }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Request failed (${res.status}).`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "error") setError(event.error);
          else handleEvent(event as AgentEvent);
        }
      }
    } catch {
      setError("Lost the connection to the server. Check your network and ask again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="marquee" data-busy={busy}>
        <form
          className="ask-form"
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <label htmlFor="question" className="sr-only">
            Your movie question
          </label>
          <input
            id="question"
            ref={inputRef}
            className="ask-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Which directors never made a movie rated under 7?"
            maxLength={300}
            autoComplete="off"
            disabled={busy}
          />
          <button className="btn" type="submit" disabled={busy || question.trim().length < 3}>
            {busy ? "Asking…" : "Ask"}
          </button>
        </form>
      </div>

      <ul className="examples" aria-label="Example questions">
        {EXAMPLE_QUESTIONS.map((q) => (
          <li key={q}>
            <button type="button" className="example" disabled={busy} onClick={() => ask(q)}>
              {q}
            </button>
          </li>
        ))}
      </ul>

      {trace.length > 0 && (
        <ol className="trace" aria-label="What the agent did" aria-live="polite">
          {trace.map((t) => (
            <li key={t.id}>
              <span
                className={t.status === "ok" ? "status-ok" : t.status === "error" ? "status-bad" : undefined}
                aria-label={t.status}
              >
                {t.status === "running" ? "…" : t.status === "ok" ? "✓" : "✗"}
              </span>
              <span className="tool">{TOOL_LABELS[t.name] ?? t.name}</span>
              <span className="detail">{t.detail}</span>
              <span className="ms">{t.ms !== undefined ? `${t.ms} ms` : ""}</span>
            </li>
          ))}
        </ol>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <section className="result" aria-label="Answer">
          <p className="answer">{result.answer}</p>
          <ResultChart spec={result.chart} rows={result.rows} />
          <SqlBlock sql={result.sql} />
          <RowsTable columns={result.columns} rows={result.rows} />
          <p className="meta">
            Answered in {(result.latencyMs / 1000).toFixed(1)} s with {result.toolCalls.length} tool calls by agent{" "}
            {result.version}.
          </p>
        </section>
      )}
    </>
  );
}
