import type { Metadata } from "next";
import Link from "next/link";
import { Big_Shoulders, JetBrains_Mono, Newsreader } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

const display = Big_Shoulders({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-big-shoulders",
  // next/font has no metrics for Big Shoulders, so it can't size a fallback; skip it rather than warn.
  adjustFontFallback: false,
});
const serif = Newsreader({ subsets: ["latin"], axes: ["opsz"], variable: "--font-newsreader" });
const code = JetBrains_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Cinequery",
  description:
    "Ask movie questions in plain English. Get an answer, a chart, and the SQL behind it, from an agent with a measured eval suite.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${serif.variable} ${code.variable}`}>
      <body>
        <div className="awning" aria-hidden="true" />
        <header className="wrap site-header">
          <Link href="/" className="wordmark">
            Cinequery
          </Link>
          <SiteNav />
        </header>
        <main className="wrap">{children}</main>
        <footer className="wrap site-footer">
          <p>
            Movie data courtesy of{" "}
            <a href="https://www.imdb.com" rel="noopener">
              IMDb
            </a>{" "}
            (
            <a href="https://developer.imdb.com/non-commercial-datasets/" rel="noopener">
              non-commercial datasets
            </a>
            ), used with permission for personal, non-commercial use. Covers feature films with 1,000+ votes.
          </p>
        </footer>
      </body>
    </html>
  );
}
