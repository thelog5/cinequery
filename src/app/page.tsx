import Link from "next/link";
import { AskClient } from "@/components/AskClient";

export default function AskPage() {
  return (
    <>
      <h1 className="page-title">Settle the movie argument.</h1>
      <p className="lede">
        Ask about 49,466 films in plain English. An AI agent writes the SQL, runs it against IMDb data, and shows you
        the answer, a chart, and the query it used.
      </p>

      <AskClient />

      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title" className="section-title">
          How it answers
        </h2>
        <ol className="steps">
          <li>
            <h3>Works out what you mean</h3>
            <p>
              It reads the schema and looks up names, so “Nolan” becomes Christopher Nolan and “Heat” becomes the 1995
              Michael Mann film.
            </p>
          </li>
          <li>
            <h3>Writes one read-only query</h3>
            <p>
              The database account can only read. Every query stops after five seconds and returns at most 200 rows.
            </p>
          </li>
          <li>
            <h3>Shows its working</h3>
            <p>
              The final query runs again, so the answer, the chart and the rows all come from PostgreSQL, not from the
              model’s memory.
            </p>
          </li>
        </ol>
        <p className="how-evals">
          Every agent version answers the same 100 hand-written questions. <Link href="/evals">See how each one scored</Link>.
        </p>
      </section>
    </>
  );
}
