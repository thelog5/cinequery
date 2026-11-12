import Link from "next/link";
import { AskClient } from "@/components/AskClient";

// Browsing never needs a live database; only POST /api/ask does.
export const dynamic = "force-static";

export default function AskPage() {
  return (
    <>
      <section className="intro" aria-labelledby="intro-title">
        <h1 id="intro-title" className="page-title">
          Query IMDb movie data<span className="title-period">.</span>
          <br />
          Ask in plain English<span className="title-period">.</span>
        </h1>
        <div className="intro-bottom">
          <div>
            <p className="lede">
              Compare ratings, explore runtimes and genres, or look up actors
              and directors across 49,466 IMDb films. AI turns your question
              into SQL and returns an answer, matching data, and a chart when
              useful.
            </p>
            <p className="intro-instructions">
              To use it, type a question below and click{" "}
              <strong>Ask question</strong>, or click an example card to ask its
              question automatically.
            </p>
          </div>
        </div>
      </section>
      <AskClient />
      <section id="how-it-works" className="how" aria-labelledby="how-title">
        <div className="section-heading">
          <h2 id="how-title" className="section-title">
            How it works
          </h2>
          <span className="eyebrow">From question to database result</span>
        </div>
        <ol className="steps">
          <li>
            <span className="step-number">01</span>
            <h3>Ask in plain English.</h3>
            <p>
              Compare ratings, look up cast and directors, or explore runtimes
              and genres. Type your question or click an example.
            </p>
          </li>
          <li>
            <span className="step-number">02</span>
            <h3>AI queries the database.</h3>
            <p>
              The agent finds the relevant films and people, writes a read-only
              SQL query, and runs it against the stored IMDb data.
            </p>
          </li>
          <li>
            <span className="step-number">03</span>
            <h3>Check the answer yourself.</h3>
            <p>
              Read the answer, inspect the returned rows, and open the SQL.
              Comparisons and trends also get a chart when useful.
            </p>
          </li>
        </ol>
        <div className="how-evals">
          <p>
            We measure each agent version against 100 questions with known
            database answers.
          </p>
          <Link href="/evals">
            View accuracy results <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </>
  );
}
