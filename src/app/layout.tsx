import type { Metadata } from "next";
import Link from "next/link";
import { JetBrains_Mono, Newsreader } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

const serif = Newsreader({
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
});
const code = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Cinequery — Query IMDb movie data in plain English",
  description:
    "Ask movie questions in plain English. AI queries a database of 49,466 IMDb films and returns answers, data, and SQL.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${serif.variable} ${code.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="wrap site-header">
          <div className="header-main">
            <Link href="/" className="wordmark">
              Cinequery<span className="wordmark-dot">.</span>
            </Link>
            <SiteNav />
          </div>
          <div className="edition-line">
            <span>Movie questions. Database answers.</span>
            <span>49,466 films · IMDb data</span>
          </div>
        </header>
        <main id="main" className="wrap">
          {children}
        </main>
        <footer className="wrap site-footer">
          <div className="footer-top">
            <Link href="/" className="wordmark">
              Cinequery.
            </Link>
            <span>Answers from IMDb data.</span>
            <a href="https://github.com/thelog5/cinequery" rel="noopener">
              View source on GitHub ↗
            </a>
          </div>
          <p>
            Movie data courtesy of{" "}
            <a href="https://www.imdb.com" rel="noopener">
              IMDb
            </a>{" "}
            (
            <a
              href="https://developer.imdb.com/non-commercial-datasets/"
              rel="noopener"
            >
              non-commercial datasets
            </a>
            ), used with permission for personal, non-commercial use. Feature
            films with 1,000+ votes. Photography via Unsplash; film still via TMDB.
          </p>
        </footer>
      </body>
    </html>
  );
}
