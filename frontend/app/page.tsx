"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ComplaintForm } from "@/components/ComplaintForm";
import { Features } from "@/components/Features";
import { NoticeStrip } from "@/components/NoticeBoard";
import { ResultCard } from "@/components/ResultCard";
import { API_URL, type CivicNotice, type Health, type PublicStats, type SubmitResult, fetchHealth, fetchNotices, fetchPublicStats, submitComplaint } from "@/lib/api";
import { DEPARTMENTS, formatDistance, formatGap } from "@/lib/format";
import { useLocale, useTranslations } from "@/lib/i18n";
import { type Coords } from "@/lib/locate";

export default function HomePage() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [notices, setNotices] = useState<CivicNotice[]>([]);
  const [misconfigured, setMisconfigured] = useState(false);

  useEffect(() => {
    setMisconfigured(window.location.hostname !== "localhost" && API_URL.includes("localhost"));
    void fetchHealth()
      .then((body) => {
        setHealth(body);
        setHealthError(null);
      })
      .catch((error: unknown) => {
        setHealthError(error instanceof Error ? error.message : "Could not reach CivicMind.");
      });
    void fetchPublicStats().then(setStats).catch(() => setStats(null));
    void fetchNotices().then((body) => setNotices(body.notices)).catch(() => setNotices([]));
  }, []);

  async function onSubmit(payload: { text: string; image: File | null; language: string }) {
    if (!coords) return;
    setSubmitting(true);
    setSubmitError(null);
    setResult(null);
    const body = new FormData();
    body.append("text", payload.text.trim());
    body.append("latitude", String(coords.latitude));
    body.append("longitude", String(coords.longitude));
    body.append("language", payload.language);
    if (payload.image) body.append("image", payload.image, "complaint.jpg");
    try {
      setResult(await submitComplaint(body));
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not submit the complaint.");
    } finally {
      setSubmitting(false);
    }
  }

  const { t } = useLocale();
  const deskCopy = useTranslations(DEPARTMENTS.flatMap((item) => [item.label, item.brief]));
  const rule = health?.thresholds;
  const showResult = submitting || result != null || submitError != null;

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">{t("hero.eyebrow")}</p>
        <h1>{t("hero.title")}</h1>
        <p>{t("hero.body")}</p>
        <div className="hero-actions">
          <a className="button" href="#report">
            {t("hero.file")}
          </a>
          <Link className="button secondary" href="/complaints">
            {t("hero.map")}
          </Link>
        </div>
        {stats && (
          <dl className="hero-stats">
            <div>
              <dt>{t("stat.complaints")}</dt>
              <dd><StatValue value={stats.live_complaints} /></dd>
            </div>
            <div>
              <dt>{t("stat.incidents")}</dt>
              <dd><StatValue value={stats.live_incidents} /></dd>
            </div>
            <div>
              <dt>{t("stat.resolved")}</dt>
              <dd><StatValue value={stats.live_resolved} /></dd>
            </div>
            {stats.archive_complaints != null && (
              <div>
                <dt>{t("stat.archive")}</dt>
                <dd><StatValue value={stats.archive_complaints} /></dd>
              </div>
            )}
          </dl>
        )}
      </section>
      {misconfigured && (
        <p className="banner">This deployment is still calling localhost. Set NEXT_PUBLIC_API_URL to the CivicMind API and redeploy.</p>
      )}
      {healthError && !health && <p className="banner">{healthError}</p>}
      {health && !health.database_ok && (
        <p className="banner">
          Database is not ready. Enable the vector and postgis extensions in Supabase, then check DATABASE_URL.
          {health.database_error ? ` ${health.database_error}` : ""}
        </p>
      )}
      {health?.embedding_error && <p className="banner">Embeddings: {health.embedding_error}</p>}
      <div className={showResult ? "home-report with-result" : "home-report"}>
        <ComplaintForm submitting={submitting} coords={coords} onCoords={setCoords} onSubmit={onSubmit} />
        <ResultCard submitting={submitting} result={result} error={submitError} />
      </div>
      <NoticeStrip notices={notices} />
      <section className="desk-strip">
        <p className="eyebrow">{t("desk.eyebrow")}</p>
        <h2>{t("desk.title")}</h2>
        <div className="desk-grid">
          {DEPARTMENTS.map((item, index) => (
            <article key={item.value} className="desk" style={{ borderTopColor: item.accent }}>
              <h3>{deskCopy[index * 2] || item.label}</h3>
              <p>{deskCopy[index * 2 + 1] || item.brief}</p>
            </article>
          ))}
        </div>
      </section>
      <p className="footer">
        {rule
          ? `A report joins an existing incident only when semantic similarity is at least ${rule.semantic_similarity.toFixed(2)}, distance is within ${formatDistance(rule.geo_radius_meters)}, and the time gap is within ${formatGap(rule.time_window_hours)}.`
          : "A report joins an existing incident only when meaning, place, and time all agree."}
        {health?.embedding_verified && health.embedding_dimensions
          ? ` Embeddings are verified at ${health.embedding_dimensions} dimensions (${health.embedding_model}).`
          : ""}
      </p>
      <Features />
    </main>
  );
}

function StatValue({ value }: { value: number }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 700);
      setShown(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{shown.toLocaleString("en-IN")}</>;
}
