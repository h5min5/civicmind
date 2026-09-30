"use client";

import Link from "next/link";
import type { SubmitResult } from "@/lib/api";
import { categoryLabel, formatDistance, formatGap, formatWhen, labelize } from "@/lib/format";

type Props = {
  submitting: boolean;
  result: SubmitResult | null;
  error: string | null;
};

export function ResultCard({ submitting, result, error }: Props) {
  if (submitting) {
    return (
      <section className="card" aria-live="polite">
        <p className="eyebrow">Working</p>
        <h2>Reading the complaint</h2>
        <p className="lede">Checking that this is a real civic issue, then comparing it with reports already stored nearby.</p>
      </section>
    );
  }
  if (error) {
    return (
      <section className="card" aria-live="polite">
        <p className="eyebrow">Could not finish</p>
        <h2>The report was not saved</h2>
        <p className="form-error">{error}</p>
      </section>
    );
  }
  if (!result) return null;

  const validation = result.validation;
  return (
    <section className="card" aria-live="polite">
      <p className="eyebrow">Result</p>
      <h2>{result.accepted ? "Complaint understood" : "Not filed as a civic complaint"}</h2>
      <div className="checks">
        <div className="check">
          <small>Text</small>
          <strong>{validation.text_describes_civic_issue ? "Civic issue" : "Not a civic issue"}</strong>
        </div>
        <div className="check">
          <small>Photo</small>
          <strong>
            {validation.image_shows_civic_issue == null
              ? "No photo"
              : validation.image_shows_civic_issue
                ? "Shows the issue"
                : "Not a civic photo"}
          </strong>
        </div>
      </div>
      {!result.accepted && <p className="explanation">{result.explanation}</p>}
      {result.accepted && result.features && (
        <>
          <p className="status-chip" style={{ marginTop: 8 }}>
            {categoryLabel(result.features.issue_category)}
          </p>
          <h3 style={{ marginTop: 10 }}>{labelize(result.features.issue_type)}</h3>
          <p className="lede">{result.features.description}</p>
          <div className="meta" style={{ marginTop: 10 }}>
            <span className={`badge ${result.features.severity}`}>{result.features.severity}</span>
            <span>Confidence {Math.round(result.features.confidence * 100)}%</span>
            <span>{labelize(result.features.issue_subtype)}</span>
          </div>
          <p className="quiet">{result.features.visual_evidence}</p>
          <div className="id-row">
            <span className={result.matched_existing ? "status-chip" : "status-chip new"}>
              {result.matched_existing ? "Existing incident" : "New incident"}
            </span>
            {result.incident_id && (
              <>
                <code>{result.incident_id}</code>
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    if (!result.incident_id) return;
                    void navigator.clipboard.writeText(result.incident_id).catch(() => undefined);
                  }}
                >
                  Copy
                </button>
              </>
            )}
          </div>
          <div className="metrics">
            <Metric
              label="Semantic similarity"
              value={result.semantic_similarity == null ? "—" : result.semantic_similarity.toFixed(2)}
              hint={`threshold ${result.thresholds.semantic_similarity.toFixed(2)}`}
              state={stateOf(result.passed_similarity)}
            />
            <Metric
              label="Distance"
              value={result.geographic_distance_m == null ? "—" : formatDistance(result.geographic_distance_m)}
              hint={`limit ${formatDistance(result.thresholds.geo_radius_meters)}`}
              state={stateOf(result.passed_distance)}
            />
            <Metric
              label="Time gap"
              value={result.time_difference_hours == null ? "—" : formatGap(result.time_difference_hours)}
              hint={`limit ${formatGap(result.thresholds.time_window_hours)}`}
              state={stateOf(result.passed_time)}
            />
          </div>
          <p className="explanation">{result.explanation}</p>
          {result.accepted && (
            <p className="quiet">
              <Link href="/complaints">See it among recent complaints</Link>
            </p>
          )}
          {result.timestamp && <p className="quiet">Filed {formatWhen(result.timestamp)} IST</p>}
          {result.embedding_dimensions != null && (
            <p className="quiet">Embedding dimension verified at {result.embedding_dimensions}.</p>
          )}
        </>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
  state,
}: {
  label: string;
  value: string;
  hint: string;
  state: "pass" | "fail" | "none";
}) {
  return (
    <div className="metric" data-state={state}>
      <small>{label}</small>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function stateOf(passed: boolean | null): "pass" | "fail" | "none" {
  if (passed == null) return "none";
  return passed ? "pass" : "fail";
}
