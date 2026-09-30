"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { HistoryView } from "@/lib/history";

const HistoryCharts = dynamic(() => import("@/components/HistoryCharts").then((mod) => mod.HistoryCharts), {
  ssr: false,
  loading: () => <p className="empty">Drawing the charts…</p>,
});

type Draft = {
  year: string;
  zone: string;
  ward: string;
  category: string;
  department: string;
  severity: string;
  status: string;
};

const EMPTY_DRAFT: Draft = {
  year: "",
  zone: "",
  ward: "",
  category: "",
  department: "",
  severity: "",
  status: "",
};

export default function HistoryPage() {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [applied, setApplied] = useState<Draft>(EMPTY_DRAFT);
  const [data, setData] = useState<HistoryView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (applied.year) params.set("year", applied.year);
    if (applied.zone) params.set("zone", applied.zone);
    if (applied.ward) params.set("ward", applied.ward);
    if (applied.category) params.set("category", applied.category);
    if (applied.department) params.set("department", applied.department);
    if (applied.severity) params.set("severity", applied.severity);
    if (applied.status) params.set("status", applied.status);
    setLoading(true);
    setError(null);
    void fetch(`/api/history?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The historical complaints could not be loaded.");
        return response.json() as Promise<HistoryView>;
      })
      .then((body) => {
        setData(body);
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "The historical complaints could not be loaded.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [applied]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const options = data?.options;
  const wardOptions = (options?.places ?? []).filter((place) => !draft.zone || place.zone === draft.zone).map((place) => place.ward);

  return (
    <main className="page">
      <section className="intro">
        <h1>Historical complaints</h1>
        <p>BMC complaints from 2019 to 2025. Filter the archive and read how volume, area, severity, and status change over time.</p>
      </section>
      <form
        className="card filters"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(draft);
        }}
      >
        <div className="filter-grid history-filters">
          <Select label="Year" value={draft.year} onChange={(value) => update("year", value)} options={options?.years.map(String) ?? []} anyLabel="All years" />
          <Select
            label="Zone"
            value={draft.zone}
            onChange={(value) => {
              setDraft((current) => {
                const wardStillInZone = !value || (options?.places ?? []).some((place) => place.zone === value && place.ward === current.ward);
                return { ...current, zone: value, ward: wardStillInZone ? current.ward : "" };
              });
            }}
            options={options?.zones ?? []}
            anyLabel="All zones"
          />
          <Select label="Area" value={draft.ward} onChange={(value) => update("ward", value)} options={wardOptions} anyLabel="All areas" />
          <Select label="Category" value={draft.category} onChange={(value) => update("category", value)} options={options?.categories ?? []} anyLabel="All categories" />
          <Select label="Department" value={draft.department} onChange={(value) => update("department", value)} options={options?.departments ?? []} anyLabel="All departments" />
          <Select label="Severity" value={draft.severity} onChange={(value) => update("severity", value)} options={options?.severities ?? []} anyLabel="All severities" />
          <Select label="Status" value={draft.status} onChange={(value) => update("status", value)} options={options?.statuses ?? []} anyLabel="All statuses" />
        </div>
        <button className="button" type="submit" disabled={loading && !data}>
          {loading ? "Updating charts…" : "Apply filters"}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
      {data && (
        <>
          <div className="metrics four">
            <div className="metric">
              <small>Complaints</small>
              <strong>{data.total.toLocaleString("en-IN")}</strong>
              <small>in this view</small>
            </div>
            <div className="metric">
              <small>Resolved</small>
              <strong>{data.total ? `${Math.round((data.resolved / data.total) * 100)}%` : "—"}</strong>
              <small>{data.resolved.toLocaleString("en-IN")} closed as resolved</small>
            </div>
            <div className="metric">
              <small>Avg. resolution</small>
              <strong>{data.avgResolutionDays == null ? "—" : `${data.avgResolutionDays} days`}</strong>
              <small>mean time to close</small>
            </div>
            <div className="metric">
              <small>Monsoon season</small>
              <strong>{data.total ? `${Math.round((data.monsoon / data.total) * 100)}%` : "—"}</strong>
              <small>{data.critical.toLocaleString("en-IN")} critical</small>
            </div>
          </div>
          <HistoryCharts data={data} />
        </>
      )}
    </main>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  anyLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  anyLabel: string;
}) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {value && !options.includes(value) && <option value={value}>{value}</option>}
      </select>
    </label>
  );
}
