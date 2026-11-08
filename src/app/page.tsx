import { AskClient } from "@/components/AskClient";

export default function AskPage() {
  return (
    <>
      <h1 className="hero-title">Settle the movie argument.</h1>
      <p className="hero-sub">
        Ask about 49,000 films in plain English. An AI agent writes the SQL, runs it against IMDb data, and shows you
        the answer, a chart, and the query it used.
      </p>
      <AskClient />
    </>
  );
}
