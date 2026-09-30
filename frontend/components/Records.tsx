"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { ComplaintRecord, Filters, IncidentRecord } from "@/lib/api";
import { imageUrl } from "@/lib/api";
import { CATEGORIES, SEVERITIES, categoryLabel, formatDistance, formatWhen, labelize, mapLink } from "@/lib/format";
import type { Coords } from "@/lib/locate";

const ComplaintMap = dynamic(() => import("@/components/ComplaintMap").then((mod) => mod.ComplaintMap), {
  ssr: false,
  loading: () => <div className="map-frame" role="status">Loading the Mumbai map…</div>,
});

type Props = {
  filters: Filters;
  onFilters: (filters: Filters) => void;
  onApply: () => void;
  complaints: ComplaintRecord[];
  incidents: IncidentRecord[];
  areas: string[];
  loading: boolean;
  error: string | null;
  coords: Coords | null;
  locating: boolean;
  onLocate: () => void;
};

export function Records({
  filters,
  onFilters,
  onApply,
  complaints,
  incidents,
  areas,
  loading,
  error,
  coords,
  locating,
  onLocate,
}: Props) {
  const [tab, setTab] = useState<"complaints" | "incidents">("complaints");

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    onFilters({ ...filters, [key]: value });
  }

  return (
    <section className="card">
      <p className="eyebrow">Already reported</p>
      <h1>Recent complaints and incidents</h1>
      <ComplaintMap complaints={complaints} />
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "complaints"} onClick={() => setTab("complaints")}>
          Complaints
        </button>
        <button type="button" role="tab" aria-selected={tab === "incidents"} onClick={() => setTab("incidents")}>
          Incidents
        </button>
      </div>
      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          onApply();
        }}
      >
        <label className="field">
          Search
          <input
            type="search"
            value={filters.q}
            placeholder="pothole, sewage, Andheri…"
            onChange={(event) => update("q", event.target.value)}
          />
        </label>
        <div className="filter-grid">
          <label className="field">
            Area
            <select value={filters.area} onChange={(event) => update("area", event.target.value)}>
              <option value="">Any area</option>
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
              {filters.area && !areas.includes(filters.area) && <option value={filters.area}>{filters.area}</option>}
            </select>
          </label>
          <label className="field">
            Category
            <select value={filters.category} onChange={(event) => update("category", event.target.value)}>
              <option value="">Any</option>
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Severity
            <select value={filters.severity} onChange={(event) => update("severity", event.target.value)}>
              <option value="">Any</option>
              {SEVERITIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Issue type
            <input
              type="text"
              value={filters.issueType}
              placeholder="pothole"
              onChange={(event) => update("issueType", event.target.value)}
            />
          </label>
          <label className="field">
            From
            <input type="date" value={filters.dateFrom} onChange={(event) => update("dateFrom", event.target.value)} />
          </label>
          <label className="field">
            To
            <input type="date" value={filters.dateTo} onChange={(event) => update("dateTo", event.target.value)} />
          </label>
        </div>
        <div className="near-row">
          <button className="button secondary" type="button" onClick={onLocate} disabled={locating || loading}>
            {locating ? "Finding you…" : "Use my location"}
          </button>
          <label>
            <input
              type="checkbox"
              checked={filters.near}
              onChange={(event) => update("near", event.target.checked)}
            />
            Near my location
          </label>
          <label className="field" style={{ minWidth: 140 }}>
            Radius
            <select value={filters.radius} onChange={(event) => update("radius", Number(event.target.value))}>
              {[250, 500, 1000, 2000, 5000].map((radius) => (
                <option key={radius} value={radius}>
                  {radius >= 1000 ? `${radius / 1000} km` : `${radius} m`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint">
          {coords
            ? "Location search uses PostGIS around the coordinates from this phone. It is separate from the incident-matching radius."
            : "Tap Use my location before searching nearby."}
        </p>
        <button className="button" type="submit" disabled={loading || (filters.near && !coords)}>
          {loading ? "Searching…" : "Apply filters"}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
      {tab === "complaints" ? (
        <div className="records">
          {complaints.length === 0 && !loading && !error && <p className="empty">No complaints match these filters yet.</p>}
          {complaints.map((item) => (
            <article className="record" key={item.id}>
              {item.image_path && <img className="thumb" src={imageUrl(item.image_path) || ""} alt="" loading="lazy" />}
              <header>
                <span className="badge">{categoryLabel(item.issue_category)}</span>
                <span className={`badge ${item.severity}`}>{item.severity}</span>
              </header>
              <h3>{labelize(item.issue_type)}</h3>
              <p>{item.description}</p>
              <div className="meta">
                <span>{formatWhen(item.timestamp)}</span>
                <span>{item.area || "Area unknown"}</span>
                <span>
                  {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                </span>
                {item.distance_m != null && <span>{formatDistance(item.distance_m)} away</span>}
                <a href={mapLink(item.latitude, item.longitude)} target="_blank" rel="noreferrer">
                  Map
                </a>
              </div>
              <p className="quiet">Incident {item.incident_id}</p>
              <details>
                <summary>Citizen&apos;s words</summary>
                <p>{item.original_text}</p>
              </details>
            </article>
          ))}
        </div>
      ) : (
        <div className="records">
          {incidents.length === 0 && !loading && !error && <p className="empty">No incidents match these filters yet.</p>}
          {incidents.map((item) => (
            <article className="record" key={item.id}>
              <header>
                <span className="badge">{categoryLabel(item.issue_category)}</span>
                <span className={`badge ${item.severity}`}>{item.severity}</span>
                <span className="badge">{item.report_count} reports</span>
              </header>
              <h3>{labelize(item.issue_type)}</h3>
              <div className="meta">
                <span>{item.area || "Area unknown"}</span>
                <span>
                  {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                </span>
                <span>First {formatWhen(item.first_reported_at)}</span>
                <span>Latest {formatWhen(item.last_reported_at)}</span>
                {item.distance_m != null && <span>{formatDistance(item.distance_m)} away</span>}
                <a href={mapLink(item.latitude, item.longitude)} target="_blank" rel="noreferrer">
                  Map
                </a>
              </div>
              <p className="quiet">{item.id}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
