"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { AgentEvent, AgentRunResult } from "@/agent/types";
import { EXAMPLE_QUESTIONS } from "@/lib/examples";
import { ResultChart } from "./ResultChart";
import { RowsTable, SqlBlock } from "./ResultDetails";

type Status = "running" | "ok" | "error";

interface TraceItem {
  id: string;
  name: string;
  /** What the agent asked for: a table, a name, a SQL snippet. */
  detail: string;
  /** What came back, e.g. "8 rows" or the error message. */
  summary?: string;
  status: Status;
  ms?: number;
}

/** Plain-language step names: [while running, when done]. */
const STEP_LABELS: Record<string, [string, string]> = {
  list_tables: ["Listing tables", "Listed tables"],
  describe_table: ["Reading a table", "Read a table"],
  search_people: ["Searching people", "Searched people"],
  search_titles: ["Searching titles", "Searched titles"],
  run_query: ["Running a query", "Ran a query"],
  submit_answer: ["Checking the final query", "Checked the final query"],
};

function stepLabel(t: TraceItem) {
  const labels = STEP_LABELS[t.name];
  if (!labels) return t.name;
  return t.status === "running" ? `${labels[0]}…` : labels[1];
}

function describeInput(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, string>;
  if (name === "describe_table") return i.table ?? "";
  if (name === "search_people") return `“${i.name ?? ""}”`;
  if (name === "search_titles") return `“${i.title ?? ""}”`;
  if (name === "run_query" || name === "submit_answer") return (i.sql ?? "").replace(/\s+/g, " ").slice(0, 120);
  return "";
}

/** The ms column already shows timing, and the step label already says "final query". */
function tidySummary(summary: string) {
  return summary.replace(/ in \d+ ms$/, "").replace(/^final query: /, "");
}

/** A kernel per agent step: unpopped while it runs, popped when it succeeds, scorched when it fails. */
function Kernel({ status }: { status: Status }) {
  if (status === "ok") {
    return (
      <svg key="ok" className="kernel kernel-popped" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="7.5" cy="13" r="4.6" />
        <circle cx="12.5" cy="8.6" r="5.2" />
        <circle cx="17" cy="13.4" r="4.4" />
        <circle cx="11.8" cy="15.6" r="4.8" />
        <path className="kernel-hull" d="M10 19.4c1.2 1.1 3 1.1 4.2 0l-.5 2.1h-3.2z" />
      </svg>
    );
  }
  return (
    <svg key={status} className={`kernel kernel-${status === "error" ? "burnt" : "raw"}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5c3.6 3.1 5.6 6.6 5.6 10.1a5.6 5.6 0 0 1-11.2 0c0-3.5 2-7 5.6-10.1Z" />
      <path className="kernel-shine" d="M10 10.5c.5-1.6 1.3-3 2.4-4.2" />
    </svg>
  );
}

const STATUS_TEXT: Record<Status, string> = { running: "In progress", ok: "Done", error: "Failed" };

export function AskClient() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<TraceItem[]>([]);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Grow the marquee to fit the question instead of scrolling inside it.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [question]);

  function handleEvent(e: AgentEvent) {
    if (e.type === "tool_call") {
      setTrace((t) => [...t, { id: e.id, name: e.name, detail: describeInput(e.name, e.input), status: "running" }]);
    } else if (e.type === "tool_result") {
      setTrace((t) =>
        t.map((item) =>
          item.id === e.id ? { ...item, status: e.ok ? "ok" : "error", ms: e.ms, summary: tidySummary(e.summary) } : item,
        ),
      );
    } else if (e.type === "result") {
      if (e.result.status === "ok") setResult(e.result);
      else setError(e.result.error ?? "The agent couldn't answer that one. Try rewording the question.");
    }
  }

  async function ask(q: string) {
    const text = q.trim();
    if (busy) return;
    if (!text) {
      inputRef.current?.focus();
      return;
    }
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

  const asked = busy || trace.length > 0 || result !== null || error !== null;

  const examples = (
    <section className="examples" aria-labelledby="examples-title">
      <h2 id="examples-title" className="minor-title">
        {asked ? "Ask another" : "Or try one of these"}
      </h2>
      <ul>
        {EXAMPLE_QUESTIONS.map((q) => (
          <li key={q}>
            <button type="button" disabled={busy} onClick={() => ask(q)}>
              {q}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <>
      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <div className="marquee" data-busy={busy}>
          <div className="marquee-sign">
            <label htmlFor="question" className="sr-only">
              Your movie question
            </label>
            <textarea
              id="question"
              ref={inputRef}
              className="marquee-input"
              data-long={question.length > 70}
              rows={1}
              value={question}
              onChange={(e) => setQuestion(e.target.value.replace(/\n/g, " "))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Which Nolan film is rated highest?"
              maxLength={300}
              autoComplete="off"
              spellCheck={false}
              readOnly={busy}
            />
          </div>
        </div>
        <div className="ask-actions">
          <button className="btn-ask" type="submit" disabled={busy}>
            {busy ? "Asking…" : "Ask"}
          </button>
        </div>
      </form>

      {!asked && examples}

      {trace.length > 0 && (
        <section className="trace" aria-labelledby="trace-title">
          <h2 id="trace-title" className="minor-title">
            Behind the scenes
          </h2>
          <ol aria-live="polite">
            {trace.map((t) => (
              <li key={t.id} data-status={t.status}>
                <Kernel status={t.status} />
                <span className="sr-only">{STATUS_TEXT[t.status]}:</span>
                <span className="trace-step">{stepLabel(t)}</span>
                <span className="trace-body">
                  {t.detail && <code>{t.detail}</code>}
                  {t.summary && <span className="trace-summary">{t.summary}</span>}
                </span>
                <span className="trace-ms">{t.ms !== undefined ? `${t.ms} ms` : ""}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      {result && (
        <section className="screen" aria-labelledby="answer-title">
          <h2 id="answer-title" className="sr-only">
            Answer
          </h2>
          <p className="answer">{result.answer}</p>
          <ResultChart spec={result.chart} rows={result.rows} />
          <SqlBlock sql={result.sql} />
          <RowsTable columns={result.columns} rows={result.rows} />
          <p className="screen-meta">
            Answered in {(result.latencyMs / 1000).toFixed(1)} seconds with {result.toolCalls.length} tool calls by
            agent {result.version}.
          </p>
        </section>
      )}

      {asked && !busy && examples}
    </>
  );
}
