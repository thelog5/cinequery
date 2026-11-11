import type { Metadata } from "next";
import { AGENT_VERSIONS } from "@/agent/versions";
import { EvalsChart } from "@/components/EvalsChart";
import { biggestJump, loadOtherModelRuns, loadVersionRuns } from "@/lib/eval-results";
import { DEFAULT_MODEL } from "@/lib/env";
import { CATEGORIES, CATEGORY_LABELS, loadQuestions } from "../../../evals/questions";
import type { EvalRun } from "../../../evals/types";

export const metadata: Metadata = {
  title: "Evals · Cinequery",
  description: "Accuracy of each Cinequery agent version on 100 hand-written movie questions.",
};

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const usd = (x: number) => `$${x.toFixed(3)}`;

function ScoreCell({ value }: { value: number | undefined }) {
  if (value === undefined) return <td className="num">–</td>;
  return (
    <td className="num">
      <div>{pct(value)}</div>
      <div className="score-bar" aria-hidden>
        <span style={{ width: `${value * 100}%` }} />
      </div>
    </td>
  );
}

function VersionTable({ runs }: { runs: EvalRun[] }) {
  return (
    <div className="table-scroll breakout">
      <table className="evals-table">
        <thead>
          <tr>
            <th scope="col">Version</th>
            <th scope="col">What changed</th>
            <th scope="col" className="num">
              Overall
            </th>
            {CATEGORIES.map((c) => (
              <th key={c} scope="col" className="num">
                {CATEGORY_LABELS[c]}
              </th>
            ))}
            <th scope="col" className="num">
              Tool calls
            </th>
            <th scope="col" className="num">
              Median latency
            </th>
            <th scope="col" className="num">
              Median cost
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={`${r.version}-${r.model}`}>
              <th scope="row">
                {r.version}
                {r.model !== DEFAULT_MODEL && <div className="meta">{r.model}</div>}
              </th>
              <td className="change">{r.change}</td>
              <ScoreCell value={r.accuracy} />
              {CATEGORIES.map((c) => (
                <ScoreCell key={c} value={r.by_category[c]?.accuracy} />
              ))}
              <td className="num">{r.avg_tool_calls.toFixed(1)}</td>
              <td className="num">{secs(r.median_latency_ms)}</td>
              <td className="num">{usd(r.median_cost_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PerQuestion({ runs }: { runs: EvalRun[] }) {
  const questions = loadQuestions();
  const byVersion = runs.map((r) => new Map(r.results.map((x) => [x.id, x])));
  return (
    <details className="disclosure">
      <summary>Every question, every version</summary>
      <div className="table-scroll">
        <table className="rows">
          <thead>
            <tr>
              <th scope="col">Id</th>
              <th scope="col">Question</th>
              {runs.map((r) => (
                <th key={r.version} scope="col">
                  {r.version}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => (
              <tr key={q.id}>
                <td>{q.id}</td>
                <td style={{ whiteSpace: "normal", minWidth: 280 }}>{q.question}</td>
                {byVersion.map((m, i) => {
                  const res = m.get(q.id);
                  return (
                    <td key={runs[i].version} title={res && !res.pass ? res.error ?? res.reason : undefined}>
                      {!res ? "–" : res.pass ? <span className="badge-pass">pass</span> : <span className="badge-fail">fail</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function EvalsPage() {
  const runs = loadVersionRuns();
  const others = loadOtherModelRuns();
  const total = loadQuestions().length;
  const jump = biggestJump(runs);
  const first = runs[0];
  const last = runs.at(-1);

  return (
    <>
      <h1 className="page-title">Did the agent get better?</h1>
      <p className="lede">
        Each version changes one thing about the agent. All of them answer the same {total} hand-written questions, and
        every answer is checked against the result of a gold SQL query.
      </p>

      {runs.length === 0 ? (
        <section className="evals-section" aria-labelledby="pending-title">
          <h2 id="pending-title" className="section-title">
            No scores yet
          </h2>
          <p className="prose">
            Scores appear here once each version has answered all {total} questions. This is what each version changes:
          </p>
          <div className="table-scroll">
            <table className="evals-table">
              <tbody>
                {Object.values(AGENT_VERSIONS).map((v) => (
                  <tr key={v.id}>
                    <th scope="row">{v.id}</th>
                    <td>{v.change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="meta">
            To record a run, use <code>pnpm eval --version v1</code> and commit the files in <code>evals/results/</code>.
          </p>
        </section>
      ) : (
        <>
          {first && last && first !== last && (
            <p className="headline">
              Accuracy went from {pct(first.accuracy)} with {first.version} to {pct(last.accuracy)} with {last.version}.
              {jump &&
                ` The biggest ${jump.delta >= 0 ? "jump" : "drop"} (${jump.delta >= 0 ? "+" : ""}${(jump.delta * 100).toFixed(0)} points) came from ${jump.to.version}: ${jump.to.change.charAt(0).toLowerCase()}${jump.to.change.slice(1)}.`}
            </p>
          )}

          <div className="screen evals-chart">
            <EvalsChart
              points={runs.map((r) => ({
                version: r.version,
                change: r.change,
                accuracy: r.accuracy * 100,
                passed: r.passed,
                total: r.total,
              }))}
            />
          </div>

          <section className="evals-section" aria-labelledby="category-title">
            <h2 id="category-title" className="section-title">
              By category
            </h2>
            <VersionTable runs={runs} />
          </section>

          {others.length > 0 && (
            <section className="evals-section" aria-labelledby="models-title">
              <h2 id="models-title" className="section-title">
                Other models
              </h2>
              <VersionTable runs={others} />
            </section>
          )}

          <section className="evals-section" aria-label="Results for every question">
            <PerQuestion runs={runs} />
          </section>
        </>
      )}

      <section className="evals-section" aria-labelledby="scoring-title">
        <h2 id="scoring-title" className="section-title">
          How scoring works
        </h2>
        <div className="prose">
          <p>
            The gold SQL for each question runs against the same database the agent uses. The agent passes when the
            rows from its final query hold the same values, ignoring column names. Extra columns are fine, numbers match
            within 0.01, and row order counts only when the question asks for an order.
          </p>
          <p>
            Every question names its vote threshold and, where needed, its tiebreak, so each one has exactly one correct
            answer. A version that scores worse than the one before it stays in the table.
          </p>
        </div>
      </section>
    </>
  );
}
