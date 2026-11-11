"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Ask" },
  { href: "/evals", label: "Evals" },
];

export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav className="site-nav" aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
      <a href="https://github.com/thelog5/cinequery" rel="noopener">
        GitHub
      </a>
    </nav>
  );
}
