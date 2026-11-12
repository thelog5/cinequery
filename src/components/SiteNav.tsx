"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav className="site-nav" aria-label="Main">
      <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>
        Ask a question
      </Link>
      <Link
        href="/evals"
        aria-current={pathname === "/evals" ? "page" : undefined}
      >
        Accuracy
      </Link>
      <Link href="/#how-it-works">
        How it works <span aria-hidden="true">↗</span>
      </Link>
    </nav>
  );
}
