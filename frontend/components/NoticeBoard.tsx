"use client";

import Link from "next/link";
import { imageUrl, type CivicNotice } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { useLocale, ViewText } from "@/lib/i18n";

const KIND_LABEL: Record<string, string> = {
  warning: "Warning",
  closure: "Closure",
  advisory: "Advisory",
  circular: "Circular",
};

export function NoticeCards({ notices }: { notices: CivicNotice[] }) {
  const { t } = useLocale();
  return (
    <div className="notice-grid">
      {notices.map((notice) => (
        <article key={notice.id} className={`notice-sheet kind-${notice.kind}`}>
          <header>
            <span className="notice-kind"><ViewText text={KIND_LABEL[notice.kind] || notice.kind} /></span>
            <span className="notice-ref">{notice.reference_code}</span>
          </header>
          <h3><ViewText text={notice.title} /></h3>
          <p className="notice-meta">
            {notice.department_name}
            {notice.area ? ` · ${notice.area}` : ""}
            {" · "}
            {notice.issued_by}
          </p>
          {notice.body && <p className="notice-body"><ViewText text={notice.body} /></p>}
          {notice.file_path && notice.file_media_type?.startsWith("image/") && (
            <img className="notice-file" src={imageUrl(notice.file_path) || ""} alt="" />
          )}
          {notice.file_path && (
            <a className="notice-download" href={imageUrl(notice.file_path) || "#"} target="_blank" rel="noreferrer">
              {notice.file_media_type === "application/pdf" ? t("notices.pdf") : t("notices.doc")}
              {notice.file_name ? ` · ${notice.file_name}` : ""}
            </a>
          )}
          <p className="notice-dates">
            Issued {formatWhen(notice.created_at)}
            {notice.effective_until ? ` · In force until ${formatWhen(notice.effective_until)}` : " · In force until withdrawn"}
          </p>
        </article>
      ))}
    </div>
  );
}

export function NoticeStrip({ notices }: { notices: CivicNotice[] }) {
  const { t } = useLocale();
  if (notices.length === 0) return null;
  return (
    <section className="notice-strip">
      <div className="notice-strip-head">
        <p className="eyebrow">{t("notices.stripEyebrow")}</p>
        <h2>{t("notices.stripTitle")}</h2>
        <Link href="/notices">{t("notices.open")}</Link>
      </div>
      <NoticeCards notices={notices.slice(0, 3)} />
    </section>
  );
}
