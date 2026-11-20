"use client";

import { useEffect, useState } from "react";
import { NoticeCards } from "@/components/NoticeBoard";
import { fetchNotices, type CivicNotice } from "@/lib/api";
import { useLocale } from "@/lib/i18n";

const FILTERS = [
  { id: "", key: "notices.all" },
  { id: "warning", key: "notices.warnings" },
  { id: "closure", key: "notices.closures" },
  { id: "advisory", key: "notices.advisories" },
  { id: "circular", key: "notices.circulars" },
];

export default function NoticesPage() {
  const { t } = useLocale();
  const [notices, setNotices] = useState<CivicNotice[]>([]);
  const [kind, setKind] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchNotices()
      .then((body) => setNotices(body.notices))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "The notice board could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  const shown = kind ? notices.filter((notice) => notice.kind === kind) : notices;

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">{t("notices.eyebrow")}</p>
        <h1>{t("notices.title")}</h1>
        <p>{t("notices.body")}</p>
      </section>
      <div className="language-row" role="tablist" aria-label={t("notices.title")}>
        {FILTERS.map((item) => (
          <button key={item.id || "all"} type="button" className={kind === item.id ? "chip on" : "chip"} onClick={() => setKind(item.id)}>
            {t(item.key)}
          </button>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading && <p className="empty">{t("notices.loading")}</p>}
      {!loading && !error && shown.length === 0 && <p className="empty">{t("notices.empty")}</p>}
      <NoticeCards notices={shown} />
    </main>
  );
}
