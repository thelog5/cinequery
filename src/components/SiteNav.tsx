"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Ask" },
  { href: "/evals", label: "Evals" },
  { href: "https://github.com/thelog5/cinequery", label: "Code" },
];

export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav className="site-nav" aria-label="Main">
      {LINKS.map((l) =>
        l.href.startsWith("http") ? (
          <a key={l.href} href={l.href} rel="noopener">
            {l.label}
          </a>
        ) : (
          <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined}>
            {l.label}
          </Link>
        ),
      )}
    </nav>
  );
}
