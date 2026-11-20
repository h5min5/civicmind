import type { ReactNode } from "react";

export default function AuthorityLayout({ children }: { children: ReactNode }) {
  return <div className="command-root">{children}</div>;
}
