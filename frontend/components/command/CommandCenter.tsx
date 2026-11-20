"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  askAuthority,
  bulkIncidents,
  createAdminUser,
  downloadAuthorityReport,
  fetchActivity,
  fetchAdminUsers,
  fetchAlerts,
  fetchAnalytics,
  fetchAuthorityIncident,
  fetchAuthorityIncidents,
  fetchEvaluation,
  fetchHotspots,
  fetchOverview,
  imageUrl,
  patchIncident,
  summarizeIncident,
  simulateHotspot,
  uploadEvidence,
  type AnalyticsPayload,
  type AuthorityIssue,
  type EvaluationPayload,
  type Hotspot,
  type InterventionResult,
  type IncidentDetail,
  type Overview,
  type SessionUser,
} from "@/lib/api";
import { PriorityMeter } from "@/components/PriorityMeter";
import { DEPARTMENTS, departmentAccent, departmentLabel, directionsLink, formatWhen, labelize, statusLabel } from "@/lib/format";
import { useSession } from "@/lib/session";

const AuthorityMap = dynamic(() => import("@/components/AuthorityMap").then((mod) => mod.AuthorityMap), { ssr: false });

type View = "overview" | "incidents" | "map" | "analytics" | "hotspots" | "copilot" | "evaluation" | "activity" | "reports" | "accounts";

const NAV: { id: View; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "incidents", label: "Incidents" },
  { id: "map", label: "Map" },
  { id: "analytics", label: "Analytics" },
  { id: "hotspots", label: "Hotspots" },
  { id: "copilot", label: "Copilot" },
  { id: "evaluation", label: "Evaluation" },
  { id: "activity", label: "Audit" },
  { id: "reports", label: "Reports" },
  { id: "accounts", label: "Accounts" },
];

const tooltipStyle = { background: "rgba(7, 14, 24, 0.94)", border: "1px solid rgba(92,225,255,0.28)", borderRadius: 12, color: "#e7f4ff" };

function queryForApi(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter((token) => token && !/^(mumbai|bombay)$/i.test(token))
    .join(" ");
}

export function CommandCenter() {
  const { user, ready, signIn } = useSession();
  const allowed = user?.role === "admin" || user?.role === "authority";
  const [department, setDepartment] = useState("");
  const [view, setView] = useState<View>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [issues, setIssues] = useState<AuthorityIssue[]>([]);
  const [mapIssues, setMapIssues] = useState<AuthorityIssue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [sort, setSort] = useState("priority");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [alerts, setAlerts] = useState<{ kind: string; title: string; detail: string; incident_id: string | null }[]>([]);
  const [events, setEvents] = useState<{ id: string; kind: string; message: string; created_at: string; tracking_code: string | null; actor: string | null }[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [hotspots, setHotspots] = useState<Hotspot[] | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationPayload | null>(null);
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scope = user?.role === "authority" ? user.department || "" : department;
  const accent = departmentAccent(scope || null);

  useEffect(() => {
    if (!allowed) return;
    const params = new URLSearchParams({ sort, page: String(page), page_size: "25" });
    const q = queryForApi(query);
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (severity) params.set("severity", severity);
    if (urgentOnly) params.set("priority_min", "8");
    if (unassignedOnly) params.set("unassigned_only", "true");
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void Promise.all([fetchOverview(scope), fetchAuthorityIncidents(scope, params), fetchAlerts(scope), fetchActivity(scope)])
      .then(([board, list, alertBody, activityBody]) => {
        if (controller.signal.aborted) return;
        setOverview(board);
        setIssues(list.issues);
        setTotal(list.total);
        setAlerts(alertBody.alerts);
        setEvents(activityBody.events);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "The workspace could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [allowed, scope, page, query, status, severity, sort, urgentOnly, unassignedOnly, reloadKey]);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    void (async () => {
      const collected: AuthorityIssue[] = [];
      let pageNumber = 1;
      let expected = 0;
      do {
        const params = new URLSearchParams({ sort: "priority", page: String(pageNumber), page_size: "100" });
        const list = await fetchAuthorityIncidents(scope, params);
        if (controller.signal.aborted) return;
        expected = list.total;
        collected.push(...list.issues);
        pageNumber += 1;
      } while (collected.length < expected && pageNumber < 20);
      if (!controller.signal.aborted) setMapIssues(collected);
    })().catch(() => {
      if (!controller.signal.aborted) setMapIssues([]);
    });
    return () => controller.abort();
  }, [allowed, scope, reloadKey]);

  function clearFilters() {
    setQuery("");
    setStatus("");
    setSeverity("");
    setUrgentOnly(false);
    setUnassignedOnly(false);
    setPage(1);
  }

  useEffect(() => {
    if (!allowed) return;
    if (view === "analytics" || view === "hotspots") {
      void fetchAnalytics(scope).then(setAnalytics).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Analytics failed."));
    }
    if (view === "hotspots") {
      void fetchHotspots(scope).then((body) => setHotspots(body.live)).catch(() => setHotspots([]));
    }
    if (view === "evaluation") {
      void fetchEvaluation(scope).then(setEvaluation).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Evaluation failed."));
    }
    if (view === "accounts" && user?.role === "admin") {
      void fetchAdminUsers().then((body) => setUsers(body.users)).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Accounts failed."));
    }
  }, [allowed, scope, view, user?.role]);

  async function openIncident(id: string) {
    setError(null);
    try {
      setDetail(await fetchAuthorityIncident(id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open that incident.");
    }
  }

  const pages = Math.max(1, Math.ceil(total / 25));
  const nav = NAV.filter((item) => item.id !== "accounts" || user?.role === "admin");

  if (!ready) return <p className="command-wait">Checking credentials…</p>;
  if (!allowed) return <CommandLogin onSubmit={signIn} />;

  return (
    <div className="command-shell" style={{ ["--desk" as string]: accent }}>
      <aside className="command-nav">
        <div className="command-brand">
          <span className="live-dot" aria-hidden="true" />
          <p className="command-kicker">CivicMind</p>
          <strong>Command</strong>
        </div>
        <nav>
          {nav.map((item) => (
            <button key={item.id} type="button" aria-current={view === item.id ? "page" : undefined} onClick={() => setView(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <p className="command-user">{user?.name}</p>
      </aside>
      <div className="command-main">
        <header className="dept-rail">
          <div>
            <p className="command-kicker">Operational workspace</p>
            <h1>{scope ? departmentLabel(scope) : "All departments"}</h1>
            <div className="status-pills">
              <span><i className="live-dot" /> Live</span>
              <span>{overview ? `${overview.active_incidents} active` : "Syncing"}</span>
              <span>{mapIssues.length} on the map</span>
            </div>
          </div>
          {user?.role === "admin" ? (
            <div className="dept-switch" role="tablist" aria-label="Department">
              <button type="button" className={scope === "" ? "on" : ""} onClick={() => { setDepartment(""); setPage(1); }}>
                All
              </button>
              {DEPARTMENTS.map((item) => (
                <button key={item.value} type="button" className={scope === item.value ? "on" : ""} onClick={() => { setDepartment(item.value); setPage(1); }}>
                  {item.label}
                </button>
              ))}
              <button type="button" className={scope === "unassigned" ? "on" : ""} onClick={() => { setDepartment("unassigned"); setPage(1); }}>
                Unassigned
              </button>
            </div>
          ) : (
            <p className="command-lock">This account is locked to {departmentLabel(scope)}.</p>
          )}
        </header>
        {error && <p className="command-error">{error}</p>}
        {loading && !overview && <div className="skeleton-grid" aria-hidden="true"><span /><span /><span /><span /></div>}
        {view === "overview" && overview && (
          <section className="command-view">
            <div className="kpi-grid">
              <Kpi label="Complaints" value={overview.total_complaints} hint="stored reports in this view" />
              <Kpi label="Active incidents" value={overview.active_incidents} hint="open or in progress" />
              <Kpi label="Critical" value={overview.critical_issues} hint="critical and not resolved" />
              <Kpi label="Urgent" value={overview.urgent_issues} hint="priority 8 or above, still open" />
              <Kpi label="Resolved" value={overview.resolved_issues} hint="closed incidents" />
              <Kpi label="Resolution rate" value={overview.resolution_rate == null ? "—" : `${Math.round(overview.resolution_rate * 100)}%`} hint="resolved / incidents" />
              <Kpi label="Avg resolution" value={overview.average_resolution_hours == null ? "—" : `${overview.average_resolution_hours.toFixed(1)} h`} hint="among resolved incidents" />
            </div>
            <div className="overview-stage">
              <AuthorityMap issues={mapIssues} selectedId={detail?.id ?? null} onSelect={(id) => void openIncident(id)} />
              <article className="panel">
                <h2>Alerts</h2>
                {alerts.length === 0 && <p className="empty">No urgent, long-running, or fast-growing clusters in this view.</p>}
                <ul className="alert-list">
                  {alerts.slice(0, 8).map((alert, index) => (
                    <li key={`${alert.kind}-${alert.incident_id}-${index}`}>
                      <button type="button" onClick={() => alert.incident_id && void openIncident(alert.incident_id)}>
                        <strong>{alert.title}</strong>
                        <span>{alert.detail}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
            <article className="panel">
                <h2>Workload</h2>
                {overview.workload.length === 0 && <p className="empty">No incidents in this workspace yet.</p>}
                <ul className="workload">
                  {overview.workload.map((item) => (
                    <li key={item.department}>
                      <span>{item.name}</span>
                      <strong>{item.incidents}</strong>
                      <small>{item.open} open · {item.in_progress} active · {item.resolved} resolved · {item.complaints} reports</small>
                    </li>
                  ))}
                </ul>
            </article>
          </section>
        )}
        {(view === "incidents" || view === "map") && (
          <section className="command-view">
            <form className="command-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); }}>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, type, or neighborhood" />
              <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                <option value="">Any status</option>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
              </select>
              <select value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(1); }}>
                <option value="">Any severity</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="priority">Priority</option>
                <option value="latest">Latest</option>
                <option value="oldest">Oldest</option>
                <option value="reports">Report volume</option>
                <option value="severity">Severity</option>
              </select>
              <label className="check-line">
                <input type="checkbox" checked={urgentOnly} onChange={(event) => { setUrgentOnly(event.target.checked); setPage(1); }} />
                Urgent only
              </label>
              <label className="check-line">
                <input type="checkbox" checked={unassignedOnly} onChange={(event) => { setUnassignedOnly(event.target.checked); setPage(1); }} />
                Unassigned queue
              </label>
              <button type="button" className="ghost" onClick={clearFilters}>Clear</button>
            </form>
            {view === "map" && (
              <>
                <p className="hint map-note">Every incident in this workspace is plotted, including ones outside the current list page. Search and status filters apply to the list.</p>
                <AuthorityMap issues={mapIssues} selectedId={detail?.id ?? null} onSelect={(id) => void openIncident(id)} />
              </>
            )}
            <IncidentTable
              issues={issues}
              selected={selected}
              activeId={detail?.id ?? null}
              onToggle={(id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
              onOpen={(id) => void openIncident(id)}
            />
            <div className="pager">
              <button type="button" className="ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
              <span>{page} / {pages} · {total} incidents</span>
              <button type="button" className="ghost" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</button>
              {selected.length > 0 && <BulkBar ids={selected} onDone={() => { setSelected([]); setReloadKey((value) => value + 1); }} />}
            </div>
          </section>
        )}
        {view === "analytics" && <AnalyticsBoard data={analytics} />}
        {view === "hotspots" && <HotspotBoard live={hotspots} archive={analytics?.archive ?? null} health={analytics?.area_health ?? null} department={scope} />}
        {view === "copilot" && <Copilot department={scope} incidentId={detail?.id} />}
        {view === "evaluation" && <EvaluationBoard data={evaluation} />}
        {view === "activity" && (
          <ol className="timeline dark">
            {events.map((event) => (
              <li key={event.id}>
                <strong>{event.kind.replaceAll("_", " ")}{event.tracking_code ? ` · ${event.tracking_code}` : ""}</strong>
                <span>{formatWhen(event.created_at)}{event.actor ? ` · ${event.actor}` : ""}</span>
                <p>{event.message}</p>
              </li>
            ))}
            {events.length === 0 && <li>No audit events in this workspace yet.</li>}
          </ol>
        )}
        {view === "reports" && (
          <section className="panel">
            <h2>Operational report</h2>
            <p>The file contains the incidents currently in this department view{status ? ` with status ${statusLabel(status)}` : ""}. Counts come from the database at download time.</p>
            <div className="row-actions">
              <button className="button" type="button" onClick={() => void downloadAuthorityReport("csv", scope, status)}>Download CSV</button>
              <button className="button secondary" type="button" onClick={() => void downloadAuthorityReport("pdf", scope, status)}>Download PDF</button>
            </div>
          </section>
        )}
        {view === "accounts" && user?.role === "admin" && <Accounts users={users} onCreated={(created) => setUsers((current) => [...current, created])} />}
      </div>
      {detail && <IncidentDrawer detail={detail} admin={user?.role === "admin"} onClose={() => setDetail(null)} onChange={setDetail} />}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  const shown = useMemo(() => value, [value]);
  return (
    <article className="kpi">
      <span>{label}</span>
      <strong>{typeof shown === "number" ? shown.toLocaleString("en-IN") : shown}</strong>
      <small>{hint}</small>
    </article>
  );
}

function IncidentTable({
  issues,
  selected,
  activeId,
  onToggle,
  onOpen,
}: {
  issues: AuthorityIssue[];
  selected: string[];
  activeId: string | null;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  if (issues.length === 0) return <p className="empty">No incidents match this workspace.</p>;
  return (
    <div className="incident-table">
      {issues.map((item) => (
        <article key={item.id} className={activeId === item.id ? "incident-row on" : "incident-row"} data-urgent={item.priority.urgent ? "true" : "false"}>
          <input type="checkbox" checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} aria-label={`Select ${item.tracking_code}`} />
          <button type="button" onClick={() => onOpen(item.id)}>
            <strong>{item.tracking_code || "Incident"}</strong>
            <span>{labelize(item.issue_type)}</span>
          </button>
          <span>{item.area || "Area unknown"}</span>
          <span className={`sev ${item.severity}`}>{item.severity}</span>
          <span className="prio">{item.priority.score.toFixed(1)}</span>
          <span>{item.report_count}</span>
          <span>{statusLabel(item.status)}</span>
          <span>
            {departmentLabel(item.department)}
            {item.routing_confidence != null && <small>{Math.round(item.routing_confidence * 100)}% route</small>}
          </span>
        </article>
      ))}
    </div>
  );
}

function BulkBar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const [status, setStatus] = useState("in_progress");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="bulk-bar"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        void bulkIncidents({ ids, status, note, resolution: status === "resolved" ? note : undefined })
          .then(() => onDone())
          .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Bulk update failed."))
          .finally(() => setBusy(false));
      }}
    >
      <select value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="in_progress">In progress</option>
        <option value="resolved">Resolved</option>
        <option value="open">Open</option>
      </select>
      <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={status === "resolved" ? "Resolution, required" : "Note"} />
      <button className="button" type="submit" disabled={busy || (status === "resolved" && note.trim().length < 8)}>
        Update {ids.length}
      </button>
      {error && <span>{error}</span>}
    </form>
  );
}

function IncidentDrawer({
  detail,
  admin,
  onClose,
  onChange,
}: {
  detail: IncidentDetail;
  admin: boolean;
  onClose: () => void;
  onChange: (detail: IncidentDetail) => void;
}) {
  const [status, setStatus] = useState(detail.status);
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState(detail.resolution_note || "");
  const [department, setDepartment] = useState(detail.department || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  useEffect(() => {
    setStatus(detail.status);
    setResolution(detail.resolution_note || "");
    setDepartment(detail.department || "");
    setNote("");
    setAnswer(null);
  }, [detail.id, detail.status, detail.resolution_note, detail.department]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (status !== detail.status) body.status = status;
      if (note.trim()) body.note = note.trim();
      if (status === "resolved") body.resolution = resolution.trim();
      if (admin && department !== (detail.department || "")) {
        body.department = department || null;
        body.reassign = true;
      }
      onChange(await patchIncident(detail.id, body));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the incident.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="drawer" role="dialog" aria-label="Incident workspace">
      <header>
        <div>
          <p className="command-kicker">{detail.tracking_code}</p>
          <h2>{labelize(detail.issue_type)}</h2>
        </div>
        <button type="button" className="ghost" onClick={onClose}>Close</button>
      </header>
      <p>{detail.summary}</p>
      {detail.ai_summary && <p className="explanation">{detail.ai_summary}</p>}
      <PriorityMeter priority={detail.priority} />
      <p className="hint">
        {detail.routing_reason}
        {detail.routing_confidence != null && ` Routing confidence: ${Math.round(detail.routing_confidence * 100)}%.`}
      </p>
      <div className="row-actions">
        <a className="button secondary" href={directionsLink(detail.latitude, detail.longitude)} target="_blank" rel="noreferrer">Navigate</a>
        <button className="ghost" type="button" onClick={() => void summarizeIncident(detail.id).then((body) => onChange({ ...detail, ai_summary: body.ai_summary }))}>
          Write AI summary
        </button>
      </div>
      <h3>Recommended next steps</h3>
      <ul>{detail.recommended_steps.map((step) => <li key={step}>{step}</li>)}</ul>
      <h3>Citizen reports</h3>
      <div className="evidence-grid">
        {detail.reports.map((report) => (
          <figure key={report.id}>
            {report.image_path && <img src={imageUrl(report.image_path) || ""} alt="Citizen evidence" />}
            <figcaption>
              <strong>{report.tracking_code}</strong>
              <span>{report.original_text}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      {detail.resolution_images.length > 0 && (
        <>
          <h3>Resolution evidence</h3>
          <div className="evidence-grid">
            {detail.resolution_images.map((image) => (
              <figure key={image.id}>
                <img src={imageUrl(image.image_path) || ""} alt="Resolution evidence" />
                <figcaption>{image.note || "After"}</figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
      <form className="stack" onSubmit={save}>
        <label className="field">Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        {status === "resolved" && (
          <label className="field">Resolution
            <textarea value={resolution} onChange={(event) => setResolution(event.target.value)} required minLength={8} />
          </label>
        )}
        <label className="field">Note
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What changed" />
        </label>
        {admin && (
          <label className="field">Reassign
            <select value={department} onChange={(event) => setDepartment(event.target.value)}>
              <option value="">Unassigned</option>
              {DEPARTMENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        )}
        {error && <p className="command-error">{error}</p>}
        <button className="button" type="submit" disabled={busy}>Save</button>
      </form>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          const file = (event.currentTarget.elements.namedItem("photo") as HTMLInputElement).files?.[0];
          if (!file) return;
          const body = new FormData();
          body.append("image", file);
          body.append("note", note);
          setBusy(true);
          void uploadEvidence(detail.id, body)
            .then(() => fetchAuthorityIncident(detail.id))
            .then(onChange)
            .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Upload failed."))
            .finally(() => setBusy(false));
        }}
      >
        <label className="field">Resolution photo
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
        </label>
        <button className="button secondary" type="submit">Upload evidence</button>
      </form>
      <h3>Similar incidents</h3>
      {detail.similar.length === 0 && <p className="empty">No comparable stored incident was found.</p>}
      {detail.similar.map((item) => (
        <article key={item.incident_id} className="similar">
          <strong>{item.tracking_code || labelize(item.issue_type)}</strong>
          <p>Similarity {item.semantic_similarity.toFixed(2)} · {Math.round(item.geographic_distance_m)} m · {item.time_difference_hours.toFixed(1)} h</p>
          <p>{item.explanation}</p>
        </article>
      ))}
      <h3>Audit</h3>
      <ol className="timeline dark">
        {detail.events.map((event) => (
          <li key={event.id}>
            <strong>{event.kind.replaceAll("_", " ")}</strong>
            <span>{formatWhen(event.created_at)}{event.actor ? ` · ${event.actor}` : ""}</span>
            <p>{event.message}</p>
          </li>
        ))}
      </ol>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void askAuthority(question, detail.department || "", detail.id).then((reply) => setAnswer(reply.answer));
        }}
      >
        <label className="field">Ask about this incident
          <input value={question} onChange={(event) => setQuestion(event.target.value)} />
        </label>
        <button className="button secondary" type="submit" disabled={question.trim().length < 3}>Ask copilot</button>
        {answer && <p>{answer}</p>}
      </form>
    </aside>
  );
}

function AnalyticsBoard({ data }: { data: AnalyticsPayload | null }) {
  if (!data) return <p className="empty">Loading analytics from stored incidents and the historical file…</p>;
  const forecast = data.archive.forecast;
  const forecastSeries = [
    ...(forecast?.history ?? []).map((item) => ({ label: item.label, actual: item.actual, predicted: null as number | null })),
    ...(forecast?.forecast ?? []).map((item) => ({ label: item.label, actual: null as number | null, predicted: item.predicted })),
  ];
  return (
    <section className="command-view chart-grid">
      <article className="panel">
        <h2>Live incidents</h2>
        <p className="hint">{data.incidents} incidents in this workspace. Monsoon months hold {data.monsoon_incidents}; other months hold {data.other_season_incidents}.</p>
        {data.monthly.length === 0 ? <p className="empty">No live incidents to chart.</p> : (
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthly}>
                <CartesianGrid stroke="rgba(92,225,255,0.12)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#8ea6bd", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#8ea6bd", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#5ce1ff" radius={6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </article>
      <article className="panel">
        <h2>Historical archive</h2>
        <p className="hint">{data.archive.available ? `${data.archive.source}. ${data.archive.rows?.toLocaleString("en-IN")} rows.` : data.archive.reason}</p>
        {data.archive.monthly && (
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.archive.monthly}>
                <CartesianGrid stroke="rgba(92,225,255,0.12)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#8ea6bd", fontSize: 11 }} interval={11} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#8ea6bd", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area dataKey="count" stroke="#5ce1ff" fill="rgba(92,225,255,0.16)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </article>
      <article className="panel">
        <h2>Forecast</h2>
        {forecast?.available ? (
          <>
            <p className="hint">Holdout MAE {forecast.mae}, RMSE {forecast.rmse}, MAPE {forecast.mape == null ? "n/a" : `${(forecast.mape * 100).toFixed(1)}%`}. {forecast.method}</p>
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecastSeries}>
                  <CartesianGrid stroke="rgba(92,225,255,0.12)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#8ea6bd", fontSize: 11 }} interval={11} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#8ea6bd", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area dataKey="actual" stroke="#5ce1ff" fill="rgba(92,225,255,0.12)" />
                  <Area dataKey="predicted" stroke="#7aa2ff" fill="rgba(122,162,255,0.16)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : <p className="empty">{forecast?.reason || "Not enough history to score a forecast."}</p>}
      </article>
      <article className="panel">
        <h2>Live mix</h2>
        <MiniBars rows={data.categories} />
        <MiniBars rows={data.priority_bands} />
      </article>
    </section>
  );
}

function MiniBars({ rows }: { rows: { name: string; count: number }[] }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <ul className="mini-bars">
      {rows.map((row) => (
        <li key={row.name}>
          <span>{labelize(row.name)}</span>
          <i style={{ width: `${(row.count / max) * 100}%` }} />
          <strong>{row.count}</strong>
        </li>
      ))}
    </ul>
  );
}

function HotspotBoard({
  live,
  archive,
  health,
  department,
}: {
  live: Hotspot[] | null;
  archive: AnalyticsPayload["archive"] | null;
  health: AnalyticsPayload["area_health"] | null;
  department: string;
}) {
  const [selected, setSelected] = useState(0);
  const [intervention, setIntervention] = useState("cleanup");
  const [capacity, setCapacity] = useState(50);
  const [duration, setDuration] = useState(30);
  const [simulation, setSimulation] = useState<InterventionResult | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  async function runSimulation() {
    if (!live?.length) return;
    const spot = live[Math.min(selected, live.length - 1)];
    setSimulating(true);
    setSimulationError(null);
    try {
      setSimulation(await simulateHotspot(department, {
        latitude: spot.latitude,
        longitude: spot.longitude,
        intervention,
        capacity_pct: capacity,
        duration_days: duration,
      }));
    } catch (caught) {
      setSimulationError(caught instanceof Error ? caught.message : "Could not run the intervention scenario.");
    } finally {
      setSimulating(false);
    }
  }

  return (
    <section className="command-view">
      <article className="panel">
        <h2>Live hotspots</h2>
        <p className="hint">Emerging means at least 3 incidents in 14 days and at least twice the previous 14 days. Recurring means 4 or more stored reports and an incident that is still open.</p>
        {live == null && <p className="empty">Checking coordinates…</p>}
        {live?.length === 0 && <p className="empty">No live cell meets the hotspot rule in this workspace.</p>}
        <ul className="workload">
          {live?.map((spot) => (
            <li key={`${spot.latitude}-${spot.longitude}`}>
              <span>{spot.area || "Unnamed cell"} · {labelize(spot.dominant_category)}</span>
              <strong>{spot.emerging ? "Emerging" : "Recurring"}</strong>
              <small>{spot.recent_incidents} recent · {spot.previous_incidents} previous · {spot.report_count} reports</small>
            </li>
          ))}
        </ul>
      </article>
      <article className="panel">
        <h2>Intervention simulation</h2>
        <p className="hint">Scenario planning only. Results are estimates and do not claim measured causal impact.</p>
        {live?.length ? (
          <div className="filters">
            <select value={selected} onChange={(event) => { setSelected(Number(event.target.value)); setSimulation(null); }}>
              {live.map((spot, index) => (
                <option key={`${spot.latitude}-${spot.longitude}`} value={index}>{spot.area || "Unnamed cell"} · {labelize(spot.dominant_category)}</option>
              ))}
            </select>
            <select value={intervention} onChange={(event) => { setIntervention(event.target.value); setSimulation(null); }}>
              <option value="cleanup">More frequent cleanup</option>
              <option value="repair">Targeted repair campaign</option>
              <option value="drain_cleaning">Drain cleaning</option>
              <option value="street_lighting">Street-light repair</option>
              <option value="inspection">Extra inspections</option>
            </select>
            <label>Capacity
              <input type="range" min="0" max="100" step="10" value={capacity} onChange={(event) => { setCapacity(Number(event.target.value)); setSimulation(null); }} />
              <small>{capacity}%</small>
            </label>
            <label>Duration
              <input type="number" min="1" max="90" value={duration} onChange={(event) => { setDuration(Number(event.target.value)); setSimulation(null); }} />
              <small>days</small>
            </label>
            <button type="button" className="button" disabled={simulating} onClick={() => void runSimulation()}>
              {simulating ? "Simulating…" : "Run scenario"}
            </button>
          </div>
        ) : (
          <p className="empty">A live hotspot is required to run a scenario.</p>
        )}
        {simulationError && <p className="error-text">{simulationError}</p>}
        {simulation && (
          <div className="status-pills">
            <span>{simulation.intervention_label}</span>
            <span>{simulation.estimated_open_incidents_resolved} open incidents resolved</span>
            <span>{simulation.estimated_residual_open_incidents} residual open</span>
            <span>{simulation.estimated_fewer_reports} fewer reports</span>
            <span>{simulation.estimated_risk_reduction_pct}% risk reduction</span>
          </div>
        )}
        {simulation && <p className="hint">Baseline: {simulation.baseline_open_incidents} open incidents. {simulation.method}</p>}
      </article>
      {health && (
        <article className="panel">
          <h2>Area civic health</h2>
          <p className="hint">{health.method}</p>
          {health.areas.length === 0 && <p className="empty">No named areas in the live incidents yet.</p>}
          <ul className="workload">
            {health.areas.map((area) => (
              <li key={area.area}>
                <span>{area.area}</span>
                <strong>{area.score}</strong>
                <small>{area.incidents} incidents · {Math.round(area.resolution_rate * 100)}% resolved · priority {area.mean_priority ?? "—"}</small>
              </li>
            ))}
          </ul>
        </article>
      )}
      {archive?.wards && (
        <article className="panel">
          <h2>Archive wards</h2>
          <p className="hint">Top wards in the historical file for this department view. These are not live hotspots.</p>
          <MiniBars rows={archive.wards} />
        </article>
      )}
    </section>
  );
}

function EvaluationBoard({ data }: { data: EvaluationPayload | null }) {
  if (!data) return <p className="empty">Measuring the archive and the forecast holdout…</p>;
  return (
    <section className="command-view">
      <article className="panel">
        <h2>Routing agreement</h2>
        <p className="hint">{data.routing.method}</p>
        {data.routing.available ? (
          <p className="eval-figure">{data.routing.agreement == null ? "—" : `${(data.routing.agreement * 100).toFixed(1)}%`} <small>on {data.routing.compared?.toLocaleString("en-IN")} archive rows, {data.routing.matched?.toLocaleString("en-IN")} matched</small></p>
        ) : <p>{data.routing.reason}</p>}
        <div className="incident-table">
          {data.routing.by_category?.map((row) => (
            <article className="incident-row" key={row.category}>
              <span>{row.category}</span>
              <span>{row.predicted || "unassigned"}</span>
              <span>{row.expected}</span>
              <strong>{row.agreement == null ? "—" : `${Math.round(row.agreement * 100)}%`}</strong>
              <span>{row.compared}</span>
            </article>
          ))}
        </div>
      </article>
      <article className="panel">
        <h2>Forecast holdout</h2>
        {data.forecast.available ? (
          <>
            <p>MAE {data.forecast.mae} · RMSE {data.forecast.rmse} · MAPE {data.forecast.mape == null ? "n/a" : `${(data.forecast.mape * 100).toFixed(1)}%`}</p>
            <p className="hint">{data.forecast.method}</p>
            <ul className="workload">
              {data.forecast.holdout?.map((row) => (
                <li key={row.label}><span>{row.label}</span><strong>{row.actual}</strong><small>predicted {row.predicted}</small></li>
              ))}
            </ul>
          </>
        ) : <p>{data.forecast.reason}</p>}
      </article>
      <article className="panel">
        <h2>Duplicate detection</h2>
        <p>{data.duplicate_detection.note}</p>
        <p className="hint">Labeled pairs: {data.duplicate_detection.labeled_pairs}. Accuracy: {data.duplicate_detection.accuracy == null ? "not reported" : data.duplicate_detection.accuracy}.</p>
        <h3>Priority formula</h3>
        <p>{data.priority.formula}</p>
        <p className="hint">{data.priority.note}</p>
      </article>
    </section>
  );
}

function Copilot({ department, incidentId }: { department: string; incidentId?: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ text: string; mode: string; sources: { title: string; source: string; excerpt: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="panel stack">
      <h2>Authority copilot</h2>
      <p className="hint">Answers use the knowledge notes and the live counts for this workspace. Open an incident first if the question is about one case.</p>
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          void askAuthority(question, department, incidentId)
            .then((reply) => setAnswer({ text: reply.answer, mode: reply.mode, sources: reply.sources }))
            .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "The copilot could not answer."))
            .finally(() => setBusy(false));
        }}
      >
        <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Which desk owns waterlogging, or what is urgent right now?" />
        <button className="button" type="submit" disabled={busy || question.trim().length < 3}>{busy ? "Reading…" : "Ask"}</button>
      </form>
      {error && <p className="command-error">{error}</p>}
      {answer && (
        <article className="bubble">
          <p>{answer.text}</p>
          <p className="quiet">{answer.mode === "model" ? "Language model, grounded in the notes and figures supplied to it." : "Briefing assembled without the language model."}</p>
          <ul className="sources">
            {answer.sources.map((source, index) => (
              <li key={`${source.source}-${source.title}-${index}`}><strong>{source.title}</strong> · {source.source}<span>{source.excerpt}</span></li>
            ))}
          </ul>
        </article>
      )}
    </section>
  );
}

function Accounts({ users, onCreated }: { users: SessionUser[]; onCreated: (user: SessionUser) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [department, setDepartment] = useState(DEPARTMENTS[0].value);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="command-split">
      <article className="panel">
        <h2>Accounts</h2>
        <ul className="workload">
          {users.map((item) => (
            <li key={item.id}><span>{item.name}</span><strong>{item.role}</strong><small>{item.email} · {departmentLabel(item.department)}</small></li>
          ))}
        </ul>
      </article>
      <form
        className="panel stack"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          void createAdminUser({ name, email, password, role: "authority", department })
            .then((body) => {
              onCreated(body.user);
              setName("");
              setEmail("");
              setPassword("");
            })
            .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not create the account."));
        }}
      >
        <h2>New department desk</h2>
        <label className="field">Name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label className="field">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label className="field">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /></label>
        <label className="field">Department
          <select value={department} onChange={(event) => setDepartment(event.target.value)}>
            {DEPARTMENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        {error && <p className="command-error">{error}</p>}
        <button className="button" type="submit">Create authority account</button>
      </form>
    </section>
  );
}

function CommandLogin({ onSubmit }: { onSubmit: (email: string, password: string) => Promise<SessionUser> }) {
  const [email, setEmail] = useState("admin@civicmind.in");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="command-login"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        void onSubmit(email, password)
          .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Sign-in failed."))
          .finally(() => setBusy(false));
      }}
    >
      <p className="command-kicker">CivicMind</p>
      <h1>Command center</h1>
      <p>Department desks and the administrator sign in here. Citizens use the public site.</p>
      <label className="field">Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required /></label>
      <label className="field">Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required /></label>
      {error && <p className="command-error">{error}</p>}
      <button className="button" type="submit" disabled={busy}>{busy ? "Checking…" : "Enter"}</button>
      <p className="hint">Demo administrator: admin@civicmind.in / Admin@12345. Each desk uses its id at civicmind.in, for example roads_infra@civicmind.in / Authority@12345.</p>
    </form>
  );
}
