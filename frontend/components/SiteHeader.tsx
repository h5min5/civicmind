"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale, ViewLanguageSelect } from "@/lib/i18n";
import { useSession } from "@/lib/session";

const LINKS = [
  { href: "/", key: "nav.report" },
  { href: "/complaints", key: "nav.map" },
  { href: "/history", key: "nav.archive" },
  { href: "/notices", key: "nav.notices" },
  { href: "/assistant", key: "nav.assistant" },
  { href: "/account", key: "nav.account" },
  { href: "/authority", key: "nav.command" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { user } = useSession();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (pathname.startsWith("/authority")) return null;

  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <div className="mark" aria-hidden="true" />
        <div>
          <p className="place">Mumbai</p>
          <p className="wordmark">CivicMind</p>
        </div>
      </Link>
      <button
        type="button"
        className={open ? "nav-toggle on" : "nav-toggle"}
        aria-expanded={open}
        aria-controls="site-nav"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <i />
        <i />
        <i />
      </button>
      <nav id="site-nav" className={open ? "nav open" : "nav"} aria-label="Sections">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}>
            {t(link.key)}
          </Link>
        ))}
        {user && <p className="nav-user nav-user-menu">{user.name}</p>}
      </nav>
      <ViewLanguageSelect />
      {user && <p className="nav-user nav-user-bar">{user.name}</p>}
    </header>
  );
}
