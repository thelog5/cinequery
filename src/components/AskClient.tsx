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
  if (name === "run_query" || name === "submit_answer")
    return (i.sql ?? "").replace(/\s+/g, " ").slice(0, 120);
  return "";
}

/** The ms column already shows timing, and the step label already says "final query". */
function tidySummary(summary: string) {
  return summary.replace(/ in \d+ ms$/, "").replace(/^final query: /, "");
}

function StepStatus({ status }: { status: Status }) {
  return (
    <span className={`step-status step-status-${status}`} aria-hidden="true">
      {status === "ok" ? "✓" : status === "error" ? "×" : "◌"}
    </span>
  );
}

const STATUS_TEXT: Record<Status, string> = {
  running: "In progress",
  ok: "Done",
  error: "Failed",
};

export function AskClient() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<TraceItem[]>([]);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollToQuery = useRef(false);

  // Grow the input to fit the question instead of scrolling inside it.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const resize = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [question]);

  // Scroll after React fills and resizes the input so the destination is stable.
  useLayoutEffect(() => {
    if (!busy || !scrollToQuery.current) return;
    scrollToQuery.current = false;
    inputRef.current?.focus({ preventScroll: true });
    formRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  }, [busy, question]);

  function askExample(q: string) {
    if (busy) return;
    scrollToQuery.current = true;
    void ask(q);
  }

  function handleEvent(e: AgentEvent) {
    if (e.type === "tool_call") {
      setTrace((t) => [
        ...t,
        {
          id: e.id,
          name: e.name,
          detail: describeInput(e.name, e.input),
          status: "running",
        },
      ]);
    } else if (e.type === "tool_result") {
      setTrace((t) =>
        t.map((item) =>
          item.id === e.id
            ? {
                ...item,
                status: e.ok ? "ok" : "error",
                ms: e.ms,
                summary: tidySummary(e.summary),
              }
            : item,
        ),
      );
    } else if (e.type === "result") {
      if (e.result.status === "ok") setResult(e.result);
      else
        setError(
          e.result.error ??
            "The agent couldn't answer that one. Try rewording the question.",
        );
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
      setError(
        "Lost the connection to the server. Check your network and ask again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const asked = busy || trace.length > 0 || result !== null || error !== null;

  const features = [
    {
      title: "Which Nolan film is rated highest?",
      category: "Directors & ratings",
      image: "/images/interstellar.jpg",
      description: "Compare Christopher Nolan’s films by IMDb rating.",
      index: 0,
    },
    {
      title: "Are movies getting longer?",
      category: "Runtime trends",
      image: "/images/cinema.jpg",
      description: "See how average runtime has changed by decade since 1950.",
      index: 1,
    },
    {
      title: "Which genres are rated highest?",
      category: "Genre comparisons",
      image: "/images/space.jpg",
      description:
        "Compare average ratings for films with at least 100,000 votes.",
      index: 4,
    },
  ];

  const examples = (
    <section className="examples" aria-labelledby="examples-title">
      <div className="section-heading">
        <h2 id="examples-title" className="section-title">
          {asked ? "Ask another question" : "Try an example question"}
        </h2>
        <span className="eyebrow">Click a card to ask ↙</span>
      </div>
      <p className="examples-instruction">
        Click a card to run its question, or type your own above.
      </p>
      <div className="story-grid">
        {features.map((f, i) => (
          <button
            className="story-card"
            aria-label={`Ask: ${EXAMPLE_QUESTIONS[f.index]}`}
            key={f.title}
            type="button"
            disabled={busy}
            onClick={() => askExample(EXAMPLE_QUESTIONS[f.index])}
          >
            <div className="story-image">
              <img src={f.image} alt="" loading="lazy" />
              <span className="story-arrow" aria-hidden="true">
                ↗
              </span>
            </div>
            <span className="story-category">
              0{i + 1} / {f.category}
            </span>
            <h3>{f.title}</h3>
            <p>{f.description}</p>
            <span className="story-cta">
              Ask this question <span aria-hidden="true">↗</span>
            </span>
          </button>
        ))}
      </div>
      <div className="more-questions">
        <span className="eyebrow">More examples</span>
        {[2, 3].map((i) => (
          <button
            type="button"
            key={i}
            disabled={busy}
            onClick={() => askExample(EXAMPLE_QUESTIONS[i])}
          >
            {i === 2
              ? "Ask: Which directors have six highly rated films?"
              : "Ask: Which horror films are rated 8.0 or higher?"}
            <span aria-hidden="true">↗</span>
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <>
      <form
        ref={formRef}
        className="ask"
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <div className="ask-label">
          <label htmlFor="question">Your movie question</label>
          <span>Type a question, then click Ask.</span>
        </div>
        <div className="query-box" data-busy={busy}>
          <svg
            className="search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 5 5" />
          </svg>
          <div className="query-input-wrap">
            <textarea
              id="question"
              ref={inputRef}
              className="query-input"
              data-long={question.length > 70}
              rows={1}
              value={question}
              onChange={(e) => setQuestion(e.target.value.replace(/\n/g, " "))}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Which Christopher Nolan film is rated highest?"
              maxLength={300}
              autoComplete="off"
              spellCheck={false}
              readOnly={busy}
            />
          </div>
          <button className="btn-ask" type="submit" disabled={busy}>
            {busy ? "Querying…" : "Ask question"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
        <p className="query-footnote">
          <span>IMDb feature films with 1,000+ votes</span>
          <span>Includes results and SQL.</span>
        </p>
      </form>

      {trace.length > 0 && (
        <section className="trace" aria-labelledby="trace-title">
          <h2 id="trace-title" className="minor-title">
            Query progress
          </h2>
          <ol aria-live="polite">
            {trace.map((t) => (
              <li key={t.id} data-status={t.status}>
                <StepStatus status={t.status} />
                <span className="sr-only">{STATUS_TEXT[t.status]}:</span>
                <span className="trace-step">{stepLabel(t)}</span>
                <span className="trace-body">
                  {t.detail && <code>{t.detail}</code>}
                  {t.summary && (
                    <span className="trace-summary">{t.summary}</span>
                  )}
                </span>
                <span className="trace-ms">
                  {t.ms !== undefined ? `${t.ms} ms` : ""}
                </span>
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
          <h2 id="answer-title" className="eyebrow result-label">
            Your answer <span aria-hidden="true">↘</span>
          </h2>
          <p className="answer">{result.answer}</p>
          <ResultChart spec={result.chart} rows={result.rows} />
          <SqlBlock sql={result.sql} />
          <RowsTable columns={result.columns} rows={result.rows} />
          <p className="screen-meta">
            Answered in {(result.latencyMs / 1000).toFixed(1)} seconds with{" "}
            {result.toolCalls.length} tool calls by agent {result.version}.
          </p>
        </section>
      )}

      <figure className="feature-film">
        <img
          src="/images/interstellar.jpg"
          alt="An explorer on an icy planet in Interstellar"
          fetchPriority="high"
        />
        <figcaption>
          <span>
            In the frame: <em>Interstellar</em> (2014) · Christopher Nolan
          </span>
        </figcaption>
      </figure>

      {examples}
    </>
  );
}
