"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Records } from "@/components/Records";
import {
  EMPTY_FILTERS,
  type ComplaintRecord,
  type Filters,
  type IncidentRecord,
  fetchComplaints,
  fetchIncidents,
} from "@/lib/api";

const ComplaintMap = dynamic(() => import("@/components/ComplaintMap").then((mod) => mod.ComplaintMap), {
  ssr: false,
  loading: () => <p className="empty">Loading map…</p>,
});

type Coords = { latitude: number; longitude: number; accuracy: number | null };

export default function ComplaintsPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(nextFilters: Filters, coords: Coords | null = null) {
    setLoading(true);
    setError(null);
    try {
      const [complaintBody, incidentBody] = await Promise.all([
        fetchComplaints(nextFilters, coords),
        fetchIncidents(nextFilters, coords),
      ]);
      setComplaints(complaintBody.complaints);
      setIncidents(incidentBody.incidents);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load complaints.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(EMPTY_FILTERS);
  }, []);

  return (
    <main className="page complaints-page">
      <section className="intro">
        <h1>Complaints and incidents</h1>
        <p>Search accepted reports, inspect recurring incidents, and see where civic issues are concentrated.</p>
      </section>
      <Records
        filters={filters}
        onFilters={setFilters}
        onApply={() => void load(filters)}
        complaints={complaints}
        incidents={incidents}
        loading={loading}
        error={error}
        coords={null}
      />
      <section className="card map-section">
        <p className="eyebrow">GIS view</p>
        <h2>Complaint locations</h2>
        <p className="hint">Severity is shown by marker color. Select a marker to inspect the report.</p>
        <ComplaintMap complaints={complaints} />
      </section>
    </main>
  );
}
