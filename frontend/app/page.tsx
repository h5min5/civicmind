"use client";

import { useEffect, useState } from "react";
import { ComplaintForm } from "@/components/ComplaintForm";
import { Features } from "@/components/Features";
import { ResultCard } from "@/components/ResultCard";
import { API_URL, type Health, type SubmitResult, fetchHealth, submitComplaint } from "@/lib/api";
import { type Coords } from "@/lib/locate";
import { formatDistance, formatGap } from "@/lib/format";

export default function HomePage() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
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
  }, []);

  async function onSubmit(payload: { text: string; image: File | null }) {
    if (!coords) return;
    setSubmitting(true);
    setSubmitError(null);
    setResult(null);
    const body = new FormData();
    body.append("text", payload.text.trim());
    body.append("latitude", String(coords.latitude));
    body.append("longitude", String(coords.longitude));
    if (payload.image) body.append("image", payload.image, "complaint.jpg");
    try {
      setResult(await submitComplaint(body));
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not submit the complaint.");
    } finally {
      setSubmitting(false);
    }
  }

  const rule = health?.thresholds;
  const showResult = submitting || result != null || submitError != null;

  return (
    <main className="page">
      <section className="intro">
        <h1>Report what the street actually looks like.</h1>
        <p>
          Write the problem and add a photo if you have one. CivicMind checks that both describe a real civic issue,
          then decides whether this is a new incident or the same one someone nearby already reported.
        </p>
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
