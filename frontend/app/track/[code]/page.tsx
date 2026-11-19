"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { imageUrl, sendFeedback, fetchTracking, type IncidentDetail } from "@/lib/api";
import { PriorityMeter } from "@/components/PriorityMeter";
import { departmentLabel, formatWhen, labelize, statusLabel } from "@/lib/format";

export default function TrackPage() {
  const params = useParams<{ code: string }>();
  const initial = decodeURIComponent(params.code || "");
  const [code, setCode] = useState(initial);
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(initial));
  const [comment, setComment] = useState("");
  const [rating, setRating] = useState("5");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!initial) return;
    void load(initial);
  }, [initial]);

  async function load(value: string) {
    setLoading(true);
    setError(null);
    try {
      setDetail(await fetchTracking(value));
    } catch (caught) {
      setDetail(null);
      setError(caught instanceof Error ? caught.message : "That code was not found.");
    } finally {
      setLoading(false);
    }
  }

  async function feedback(event: FormEvent, confirmed: boolean) {
    event.preventDefault();
    if (!detail?.tracking_code && !code) return;
    setBusy(true);
    setError(null);
    try {
      setDetail(await sendFeedback(code, { rating: Number(rating), comment, confirmed }));
      setComment("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Feedback was not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <section className="intro">
        <h1>Track a complaint</h1>
        <p>Use the CM- code from your report or the INC- code of the incident. The timeline is the audit of what actually happened.</p>
      </section>
      <form
        className="card filters"
        onSubmit={(event) => {
          event.preventDefault();
          void load(code);
        }}
      >
        <label className="field">
          Tracking code
          <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="CM- or INC-" />
        </label>
        <button className="button" type="submit" disabled={loading || code.trim().length < 4}>
          {loading ? "Looking up…" : "Look up"}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
      {detail && (
        <section className="card stack">
          <p className="eyebrow">{detail.tracking_code}</p>
          <h2>{labelize(detail.issue_type)}</h2>
          <div className="meta">
            <span className="badge">{statusLabel(detail.status)}</span>
            <span className="badge">{departmentLabel(detail.department)}</span>
            <span className={`badge ${detail.severity}`}>{detail.severity}</span>
            <span>{detail.area || "Area unknown"}</span>
          </div>
          <p>{detail.summary}</p>
          {detail.routing_reason && <p className="explanation">{detail.routing_reason}</p>}
          <PriorityMeter priority={detail.priority} />
          <h3>Timeline</h3>
          <ol className="timeline">
            {detail.events.map((event) => (
              <li key={event.id}>
                <strong>{event.kind.replaceAll("_", " ")}</strong>
                <span>{formatWhen(event.created_at)}{event.actor ? ` · ${event.actor}` : ""}</span>
                <p>{event.message}</p>
              </li>
            ))}
            {detail.events.length === 0 && <li>No audit events have been stored for this incident yet.</li>}
          </ol>
          <h3>Reports</h3>
          <div className="records">
            {detail.reports.map((report) => (
              <article className="record" key={report.id}>
                {report.image_path && <img className="thumb" src={imageUrl(report.image_path) || ""} alt="Citizen evidence" />}
                <h3>{report.tracking_code}</h3>
                <p>{report.original_text}</p>
                <p className="quiet">{formatWhen(report.timestamp)}</p>
              </article>
            ))}
          </div>
          {detail.resolution_images.length > 0 && (
            <>
              <h3>Resolution evidence</h3>
              <div className="evidence-grid">
                {detail.resolution_images.map((image) => (
                  <figure key={image.id}>
                    <img src={imageUrl(image.image_path) || ""} alt="Resolution evidence" />
                    <figcaption>{image.note || formatWhen(image.created_at)}</figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
          {detail.resolution_note && <p className="explanation">{detail.resolution_note}</p>}
          {detail.status === "resolved" && (
            <form className="form" onSubmit={(event) => void feedback(event, true)}>
              <h3>Was this fixed?</h3>
              <label className="field">
                Rating
                <select value={rating} onChange={(event) => setRating(event.target.value)}>
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Note
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="What you found when you went back." />
              </label>
              <div className="row-actions">
                <button className="button" type="submit" disabled={busy}>
                  Confirm resolution
                </button>
                <button className="button secondary" type="button" disabled={busy || comment.trim().length < 8} onClick={(event) => void feedback(event, false)}>
                  Ask to reopen
                </button>
              </div>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
