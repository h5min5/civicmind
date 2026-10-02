"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/complaints", label: "Complaints" },
  { href: "/history", label: "History" },
  { href: "/authority", label: "Authority" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <div className="mark" aria-hidden="true" />
        <div>
          <p className="place">Civic platform</p>
          <p className="wordmark">CivicMind</p>
        </div>
      </Link>
      <nav className="nav" aria-label="Sections">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}>
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
