"use client";

import { useEffect, useState } from "react";
import { Records } from "@/components/Records";
import {
  EMPTY_FILTERS,
  type ComplaintRecord,
  type Filters,
  type IncidentRecord,
  fetchAreas,
  fetchComplaints,
  fetchIncidents,
} from "@/lib/api";
import { readBrowserLocation, type Coords } from "@/lib/locate";

export default function ComplaintsPage() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(nextFilters: Filters, nextCoords: Coords | null) {
    setLoading(true);
    setError(null);
    try {
      const [complaintBody, incidentBody, areasBody] = await Promise.all([
        fetchComplaints(nextFilters, nextCoords),
        fetchIncidents(nextFilters, nextCoords),
        fetchAreas().catch(() => ({ areas: [] as string[] })),
      ]);
      setComplaints(complaintBody.complaints);
      setIncidents(incidentBody.incidents);
      setAreas(areasBody.areas);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(EMPTY_FILTERS, null);
  }, []);

  async function locate() {
    setLocationError(null);
    setLocating(true);
    try {
      setCoords(await readBrowserLocation());
    } catch (caught) {
      setLocationError(caught instanceof Error ? caught.message : "Location permission was denied.");
    } finally {
      setLocating(false);
    }
  }

  return (
    <main className="page complaints-page">
      <Records
        filters={filters}
        onFilters={setFilters}
        onApply={() => void load(filters, coords)}
        complaints={complaints}
        incidents={incidents}
        areas={areas}
        loading={loading}
        error={error || locationError}
        coords={coords}
        locating={locating}
        onLocate={() => void locate()}
      />
    </main>
  );
}
