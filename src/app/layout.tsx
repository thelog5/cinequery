import type { Metadata } from "next";
import { Big_Shoulders, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

const display = Big_Shoulders({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-big-shoulders",
});
const body = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument" });
const code = JetBrains_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Cinequery",
  description:
    "Ask movie questions in plain English. Get an answer, a chart, and the SQL behind it, from an agent with a measured eval suite.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${code.variable}`}>
      <body>
        <header className="wrap site-header">
          <a href="/" className="wordmark">
            Cinequery
          </a>
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
