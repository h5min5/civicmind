"use client";

import { useEffect, useState } from "react";
import { ComplaintForm } from "@/components/ComplaintForm";
import { Records } from "@/components/Records";
import { ResultCard } from "@/components/ResultCard";
import {
  API_URL,
  EMPTY_FILTERS,
  type ComplaintRecord,
  type Filters,
  type Health,
  type IncidentRecord,
  type SubmitResult,
  fetchAreas,
  fetchComplaints,
  fetchHealth,
  fetchIncidents,
  submitComplaint,
} from "@/lib/api";
import { formatDistance, formatGap } from "@/lib/format";

type Coords = { latitude: number; longitude: number; accuracy: number | null; area: string | null };

export default function HomePage() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [misconfigured, setMisconfigured] = useState(false);

  async function load(nextFilters: Filters, nextCoords: Coords | null) {
    setRecordsLoading(true);
    setRecordsError(null);
    try {
      const [healthBody, complaintBody, incidentBody, areasBody] = await Promise.all([
        fetchHealth(),
        fetchComplaints(nextFilters, nextCoords),
        fetchIncidents(nextFilters, nextCoords),
        fetchAreas().catch(() => ({ areas: [] as string[] })),
      ]);
      setHealth(healthBody);
      setHealthError(null);
      setComplaints(complaintBody.complaints);
      setIncidents(incidentBody.incidents);
      setAreas(areasBody.areas);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load records.";
      setRecordsError(message);
      if (!health) setHealthError(message);
    } finally {
      setRecordsLoading(false);
    }
  }

  useEffect(() => {
    setMisconfigured(window.location.hostname !== "localhost" && API_URL.includes("localhost"));
    void load(EMPTY_FILTERS, null);
    // Initial records do not depend on later filter edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const response = await submitComplaint(body);
      setResult(response);
      await load(filters, coords);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not submit the complaint.");
    } finally {
      setSubmitting(false);
    }
  }

  const rule = health?.thresholds;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="mark" aria-hidden="true" />
          <div>
            <p className="place">Mumbai</p>
            <h1 className="wordmark">CivicMind</h1>
          </div>
        </div>
        <p>Complaint intelligence for streets, drains, waste, and public works.</p>
      </header>
      <main className="page">
        <section className="intro">
          <h2>Report what the street actually looks like.</h2>
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
        <div className="layout">
          <div className="stack">
            <ComplaintForm submitting={submitting} coords={coords} onCoords={setCoords} onSubmit={onSubmit} />
            <ResultCard submitting={submitting} result={result} error={submitError} />
          </div>
          <Records
            filters={filters}
            onFilters={setFilters}
            onApply={() => void load(filters, coords)}
            complaints={complaints}
            incidents={incidents}
            areas={areas}
            loading={recordsLoading}
            error={recordsError}
            coords={coords}
          />
        </div>
        <footer className="footer">
          {rule
            ? `A report joins an existing incident only when semantic similarity is at least ${rule.semantic_similarity.toFixed(2)}, distance is within ${formatDistance(rule.geo_radius_meters)}, and the time gap is within ${formatGap(rule.time_window_hours)}.`
            : "A report joins an existing incident only when meaning, place, and time all agree."}
          {health?.embedding_verified && health.embedding_dimensions
            ? ` Embeddings are verified at ${health.embedding_dimensions} dimensions (${health.embedding_model}).`
            : ""}
        </footer>
      </main>
    </>
  );
}
