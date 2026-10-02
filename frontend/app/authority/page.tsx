"use client";

import { useEffect, useState } from "react";
import {
  fetchAuthorityComplaints,
  fetchAuthorityStats,
  updateComplaintStatus,
  type AuthorityComplaint,
  type AuthorityStats,
} from "@/lib/api";

const PRIORITY_OPTIONS = ["low", "medium", "high", "critical"];
const STATUS_OPTIONS = ["submitted", "assigned", "in_progress", "resolved", "closed"];
const DEPARTMENT_OPTIONS = [
  "Roads Department",
  "Water Supply Department",
  "Storm Water / Drainage Department",
  "Solid Waste Management",
  "Electrical / Street Lighting Department",
  "Sewerage Department",
  "Traffic Department",
  "Municipal Safety / Public Works Department",
  "Public Works Department",
];

export default function AuthorityDashboardPage() {
  const [stats, setStats] = useState<AuthorityStats | null>(null);
  const [complaints, setComplaints] = useState<AuthorityComplaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    q: "",
    department: "",
    priority: "",
    status: "",
    issueType: "",
  });
  const [error, setError] = useState<string | null>(null);

  async function loadData(nextFilters = filters) {
    setLoading(true);
    setError(null);
    try {
      const [summary, complaintResponse] = await Promise.all([
        fetchAuthorityStats(),
        fetchAuthorityComplaints({
          q: nextFilters.q,
          department: nextFilters.department,
          priority: nextFilters.priority,
          status: nextFilters.status,
          issue_type: nextFilters.issueType,
          limit: 50,
          sort_by: "severity_score",
        }),
      ]);
      setStats(summary);
      setComplaints(complaintResponse.complaints);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load authority dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyFilters() {
    await loadData(filters);
  }

  async function handleStatusChange(complaintId: string, status: string) {
    try {
      await updateComplaintStatus(complaintId, status);
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update status.");
    }
  }

  const departmentNames = Array.from(
    new Set([
      ...DEPARTMENT_OPTIONS,
      ...complaints.map((item) => item.department).filter(Boolean),
    ]),
  ) as string[];

  return (
    <main className="page">
      <header className="topbar" style={{ marginBottom: 16 }}>
        <div className="brand">
          <div className="mark" aria-hidden="true" />
          <div>
            <p className="place">Mumbai</p>
            <h1 className="wordmark">Authority Dashboard</h1>
          </div>
        </div>
        <a href="/" className="topbar-link">Back to complaints</a>
      </header>

      <div className="dashboard-shell">
        <section className="card">
          <p className="eyebrow">Overview</p>
          <h2>Operational summary</h2>
          {error && <p className="form-error">{error}</p>}
          {stats ? (
            <div className="dashboard-summary" style={{ marginTop: 16 }}>
              <div className="summary-card"><small>Total complaints</small><strong>{stats.total_complaints}</strong></div>
              <div className="summary-card"><small>Pending</small><strong>{stats.pending_complaints}</strong></div>
              <div className="summary-card"><small>Resolved</small><strong>{stats.resolved_complaints}</strong></div>
              <div className="summary-card"><small>High priority</small><strong>{stats.high_priority_complaints}</strong></div>
              <div className="summary-card"><small>Critical</small><strong>{stats.critical_complaints}</strong></div>
              <div className="summary-card"><small>Duplicate complaints</small><strong>{stats.duplicate_complaints}</strong></div>
            </div>
          ) : (
            <p className="quiet">Loading summary...</p>
          )}
        </section>

        <section className="card">
          <p className="eyebrow">Filters</p>
          <div className="dashboard-controls">
            <label className="field">
              Search
              <input
                type="text"
                value={filters.q}
                onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                placeholder="Search complaint or issue"
              />
            </label>
            <label className="field">
              Department
              <select
                value={filters.department}
                onChange={(event) => setFilters((current) => ({ ...current, department: event.target.value }))}
              >
                <option value="">All</option>
                {departmentNames.map((department) => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Priority
              <select
                value={filters.priority}
                onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}
              >
                <option value="">All</option>
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Status
              <select
                value={filters.status}
                onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="">All</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status.replace("_", " ")}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Issue type
              <input
                type="text"
                value={filters.issueType}
                onChange={(event) => setFilters((current) => ({ ...current, issueType: event.target.value }))}
                placeholder="pothole"
              />
            </label>
            <div className="field" style={{ justifyContent: "end" }}>
              <button className="button" type="button" onClick={() => void applyFilters()} disabled={loading}>
                {loading ? "Loading…" : "Apply filters"}
              </button>
            </div>
          </div>
        </section>

        <section className="card">
          <p className="eyebrow">Department view</p>
          <h2>Complaints by department</h2>
          {stats && (
            <div className="dashboard-summary" style={{ marginTop: 16 }}>
              {stats.complaints_by_department.length === 0 ? (
                <p className="empty">No department counts yet.</p>
              ) : (
                stats.complaints_by_department.map((entry) => (
                  <div key={entry.department} className="summary-card">
                    <small>{entry.department}</small>
                    <strong>{entry.total}</strong>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        <section className="card">
          <p className="eyebrow">Priority view</p>
          <h2>High and critical complaints</h2>
          {stats && (
            <div className="dashboard-summary" style={{ marginTop: 16 }}>
              {stats.complaints_by_priority.map((entry) => (
                <div key={entry.priority} className="summary-card">
                  <small>{entry.priority}</small>
                  <strong>{entry.total}</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <p className="eyebrow">Queue</p>
          <h2>Recent and high-priority complaints</h2>
          <div className="dashboard-table-wrap" style={{ marginTop: 16 }}>
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Issue</th>
                  <th>Description</th>
                  <th>Location</th>
                  <th>Date</th>
                  <th>Department</th>
                  <th>Severity</th>
                  <th>Priority</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {complaints.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={9}><p className="empty">No complaints match these filters.</p></td>
                  </tr>
                ) : (
                  complaints.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id.slice(0, 8)}</td>
                      <td>{item.issue_type}</td>
                      <td>{item.description.slice(0, 90)}{item.description.length > 90 ? "…" : ""}</td>
                      <td>{item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}</td>
                      <td>{new Date(item.timestamp).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Kolkata" })}</td>
                      <td>{item.department ?? "Unassigned"}</td>
                      <td>{item.severity_score != null ? `${item.severity_score.toFixed(1)}/10` : "—"}</td>
                      <td>
                        {item.priority ? (
                          <span className={`priority-pill ${item.priority}`}>{item.priority}</span>
                        ) : "—"}
                      </td>
                      <td>
                        <select
                          className="status-select"
                          value={item.status}
                          onChange={(event) => void handleStatusChange(item.id, event.target.value)}
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>{status.replace("_", " ")}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
