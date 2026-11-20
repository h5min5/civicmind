"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { AuthorityUpdate, ComplaintRecord, Filters, IncidentRecord } from "@/lib/api";
import { imageUrl } from "@/lib/api";
import { CATEGORIES, SEVERITIES, categoryLabel, departmentLabel, formatDistance, formatWhen, labelize, mapLink, statusLabel } from "@/lib/format";
import { useLocale, useTranslations, ViewText } from "@/lib/i18n";
import type { Coords } from "@/lib/locate";

const ComplaintMap = dynamic(() => import("@/components/ComplaintMap").then((mod) => mod.ComplaintMap), {
  ssr: false,
  loading: () => <div className="map-frame" role="status">Loading the Mumbai map…</div>,
});

function AuthorityUpdates({ updates }: { updates?: AuthorityUpdate[] }) {
  const { t } = useLocale();
  if (!updates || updates.length === 0) return null;
  return (
    <div className="authority-updates">
      {updates.map((update) => (
        <article key={update.id} className={update.kind === "status" ? "authority-update status" : "authority-update"}>
          <strong>{update.kind === "status" ? t("records.status") : t("records.note")}</strong>
          <p><ViewText text={update.message} /></p>
          <span>{formatWhen(update.created_at)}</span>
        </article>
      ))}
    </div>
  );
}

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
  const { t, locale } = useLocale();
  const categoryNames = useTranslations(CATEGORIES.map((item) => item.label));
  const descriptions = useTranslations(complaints.map((item) => item.description));
  const localized = complaints.map((item, index) => ({ ...item, description: descriptions[index] || item.description }));
  const [tab, setTab] = useState<"complaints" | "incidents">("complaints");

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    onFilters({ ...filters, [key]: value });
  }

  return (
    <section className="card">
      <p className="eyebrow">{t("records.eyebrow")}</p>
      <h1>{t("records.title")}</h1>
      <ComplaintMap complaints={localized} />
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "complaints"} onClick={() => setTab("complaints")}>
          {t("records.complaints")}
        </button>
        <button type="button" role="tab" aria-selected={tab === "incidents"} onClick={() => setTab("incidents")}>
          {t("records.incidents")}
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
          {t("records.search")}
          <input
            type="search"
            value={filters.q}
            placeholder="pothole, sewage, Andheri…"
            onChange={(event) => update("q", event.target.value)}
          />
        </label>
        <div className="filter-grid">
          <label className="field">
            {t("records.area")}
            <select value={filters.area} onChange={(event) => update("area", event.target.value)}>
              <option value="">{t("records.anyArea")}</option>
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
              {filters.area && !areas.includes(filters.area) && <option value={filters.area}>{filters.area}</option>}
            </select>
          </label>
          <label className="field">
            {t("records.category")}
            <select value={filters.category} onChange={(event) => update("category", event.target.value)}>
              <option value="">{t("records.any")}</option>
              {CATEGORIES.map((item, index) => (
                <option key={item.value} value={item.value}>
                  {categoryNames[index] || item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t("records.severity")}
            <select value={filters.severity} onChange={(event) => update("severity", event.target.value)}>
              <option value="">{t("records.any")}</option>
              {SEVERITIES.map((item) => (
                <option key={item} value={item}>
                  {t(`sev.${item}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t("records.issueType")}
            <input
              type="text"
              value={filters.issueType}
              placeholder="pothole"
              onChange={(event) => update("issueType", event.target.value)}
            />
          </label>
          <label className="field">
            {t("records.from")}
            <input type="date" value={filters.dateFrom} onChange={(event) => update("dateFrom", event.target.value)} />
          </label>
          <label className="field">
            {t("records.to")}
            <input type="date" value={filters.dateTo} onChange={(event) => update("dateTo", event.target.value)} />
          </label>
        </div>
        <div className="near-row">
          <button className="button secondary" type="button" onClick={onLocate} disabled={locating || loading}>
            {locating ? t("form.finding") : t("form.myLocation")}
          </button>
          <label>
            <input
              type="checkbox"
              checked={filters.near}
              onChange={(event) => update("near", event.target.checked)}
            />
            {t("records.near")}
          </label>
          <label className="field" style={{ minWidth: 140 }}>
            {t("records.radius")}
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
          {coords ? (
            <ViewText text="Location search uses the coordinates from this phone. It is separate from the incident-matching radius." />
          ) : (
            t("records.locateHint")
          )}
        </p>
        <button className="button" type="submit" disabled={loading || (filters.near && !coords)}>
          {loading ? t("records.searching") : t("records.apply")}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
      {tab === "complaints" ? (
        <div className="records">
          {localized.length === 0 && !loading && !error && <p className="empty">{t("records.emptyComplaints")}</p>}
          {localized.map((item) => (
            <article className="record" key={item.id}>
              {item.image_path && <img className="thumb" src={imageUrl(item.image_path) || ""} alt="" loading="lazy" />}
              <header>
                <span className="badge">{categoryLabel(item.issue_category)}</span>
                <span className={`badge ${item.severity}`}>{t(`sev.${item.severity}`)}</span>
              </header>
              <h3>{labelize(item.issue_type)}</h3>
              {locale !== "en" && <p className="quiet">{t("report.english")}</p>}
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
                <summary>{t("records.words")}</summary>
                <p>{item.original_text}</p>
              </details>
              <AuthorityUpdates updates={item.updates} />
            </article>
          ))}
        </div>
      ) : (
        <div className="records">
          {incidents.length === 0 && !loading && !error && <p className="empty">{t("records.emptyIncidents")}</p>}
          {incidents.map((item) => (
            <article className="record" key={item.id}>
              <header>
                <span className="badge">{categoryLabel(item.issue_category)}</span>
                <span className={`badge ${item.severity}`}>{t(`sev.${item.severity}`)}</span>
                <span className="badge">{item.report_count} reports</span>
                {item.priority && <span className="badge">priority {item.priority.score.toFixed(1)}</span>}
                {item.status && <span className="badge">{statusLabel(item.status)}</span>}
                {item.department && <span className="badge">{departmentLabel(item.department)}</span>}
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
              <AuthorityUpdates updates={item.updates} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
