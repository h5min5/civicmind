export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export type Thresholds = {
  semantic_similarity: number;
  geo_radius_meters: number;
  time_window_hours: number;
};

export type Health = {
  database_ok: boolean;
  database_error: string | null;
  postgis: string | null;
  pgvector: string | null;
  groq_model: string;
  embedding_model: string;
  embedding_dimensions: number | null;
  embedding_verified: boolean;
  embedding_error: string | null;
  thresholds: Thresholds;
};

export type PriorityScore = {
  score: number;
  impact: number;
  risk: number;
  volume: number;
  location: number;
  duration: number;
  duration_hours?: number;
  urgent?: boolean;
  weights?: Record<string, number>;
  factors?: { key: string; label: string; weight: number; score: number; detail: string }[];
};

export type Features = {
  issue_category: string;
  issue_type: string;
  issue_subtype: string;
  severity: string;
  description: string;
  visual_evidence: string;
  confidence: number;
};

export type SubmitResult = {
  accepted: boolean;
  validation: {
    is_valid_civic_complaint: boolean;
    rejection_reason: string | null;
    text_describes_civic_issue: boolean;
    image_shows_civic_issue: boolean | null;
  };
  features: Features | null;
  complaint_id: string | null;
  incident_id: string | null;
  matched_existing: boolean | null;
  semantic_similarity: number | null;
  geographic_distance_m: number | null;
  time_difference_hours: number | null;
  passed_similarity: boolean | null;
  passed_distance: boolean | null;
  passed_time: boolean | null;
  explanation: string | null;
  embedding_dimensions: number | null;
  timestamp: string | null;
  thresholds: Thresholds;
  tracking_code?: string | null;
  incident_tracking_code?: string | null;
  department?: string | null;
  department_name?: string | null;
  routing_reason?: string | null;
  routing_confidence?: number | null;
  area?: string | null;
  summary?: string | null;
  priority?: PriorityScore | null;
  severity_score?: number | null;
  status?: string | null;
};

export type ComplaintRecord = {
  id: string;
  original_text: string;
  image_path: string | null;
  issue_category: string;
  issue_type: string;
  issue_subtype: string;
  severity: string;
  description: string;
  visual_evidence: string;
  confidence: number;
  latitude: number;
  longitude: number;
  area: string | null;
  timestamp: string;
  incident_id: string | null;
  created_at: string;
  distance_m: number | null;
  tracking_code?: string | null;
  language?: string | null;
  department?: string | null;
  department_name?: string | null;
  priority?: PriorityScore | null;
  severity_score?: number | null;
  status?: string | null;
};

export type IncidentRecord = {
  id: string;
  issue_category: string;
  issue_type: string;
  severity: string;
  latitude: number;
  longitude: number;
  area: string | null;
  first_reported_at: string;
  last_reported_at: string;
  report_count: number;
  distance_m: number | null;
  department?: string | null;
  department_name?: string | null;
  status?: string;
  tracking_code?: string | null;
  summary?: string | null;
  priority?: PriorityScore;
};

export type Filters = {
  q: string;
  category: string;
  severity: string;
  issueType: string;
  area: string;
  dateFrom: string;
  dateTo: string;
  near: boolean;
  radius: number;
};

export const EMPTY_FILTERS: Filters = {
  q: "",
  category: "",
  severity: "",
  issueType: "",
  area: "",
  dateFrom: "",
  dateTo: "",
  near: false,
  radius: 1000,
};

export function imageUrl(path: string | null) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${API_URL}${path}`;
}

export function filterQuery(filters: Filters, coords: { latitude: number; longitude: number } | null) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.category) params.set("category", filters.category);
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.issueType.trim()) params.set("issue_type", filters.issueType.trim());
  if (filters.area) params.set("area", filters.area);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.near) {
    if (!coords) throw new Error("Use your location before searching nearby complaints.");
    params.set("near_lat", String(coords.latitude));
    params.set("near_lng", String(coords.longitude));
    params.set("radius_m", String(filters.radius));
  }
  params.set("limit", "50");
  return params;
}

async function readError(response: Response) {
  try {
    const data = await response.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((item: { msg?: string }) => item.msg || "Invalid input").join(" ");
    }
  } catch {
    /* response was not JSON */
  }
  return `Request failed (${response.status}).`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const headers = new Headers(init?.headers);
  if (!headers.has("Authorization")) {
    const token = typeof window === "undefined" ? null : window.localStorage.getItem("civicmind.token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers, signal: AbortSignal.timeout(90000) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("The request timed out. Groq can take a little while on a photo — try again.");
    }
    throw new Error(`Can't reach the CivicMind API at ${API_URL}.`);
  }
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<T>;
}

export function fetchHealth() {
  return request<Health>("/api/health");
}

export function submitComplaint(body: FormData) {
  return request<SubmitResult>("/api/complaints", { method: "POST", body });
}

export function fetchComplaints(filters: Filters, coords: { latitude: number; longitude: number } | null) {
  const params = filterQuery(filters, coords);
  return request<{ complaints: ComplaintRecord[] }>(`/api/complaints?${params.toString()}`);
}

export function fetchIncidents(filters: Filters, coords: { latitude: number; longitude: number } | null) {
  const params = filterQuery(filters, coords);
  return request<{ incidents: IncidentRecord[] }>(`/api/incidents?${params.toString()}`);
}

export function fetchAreas() {
  return request<{ areas: string[] }>("/api/areas");
}

export function lookupArea(latitude: number, longitude: number) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
  });
  return request<{ area: string | null }>(`/api/geocode?${params.toString()}`);
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "citizen" | "authority" | "admin";
  department: string | null;
};

export type AuthorityIssue = {
  id: string;
  tracking_code: string | null;
  issue_category: string;
  issue_type: string;
  severity: string;
  latitude: number;
  longitude: number;
  area: string | null;
  department: string | null;
  department_name: string;
  status: string;
  first_reported_at: string;
  last_reported_at: string;
  resolved_at: string | null;
  report_count: number;
  routing_reason: string | null;
  routing_confidence: number | null;
  summary: string | null;
  ai_summary: string | null;
  resolution_note: string | null;
  reopen_count: number;
  priority: PriorityScore;
};

export type Overview = {
  department: string | null;
  department_name: string;
  total_complaints: number;
  total_incidents: number;
  active_incidents: number;
  critical_issues: number;
  urgent_issues: number;
  resolved_issues: number;
  resolution_rate: number | null;
  average_resolution_hours: number | null;
  workload: { department: string; name: string; incidents: number; open: number; in_progress: number; resolved: number; complaints: number }[];
};

export type NamedCount = { name: string; count: number };

export type ArchiveSnapshot = {
  available: boolean;
  reason?: string;
  source?: string;
  rows?: number;
  resolved?: number;
  resolution_rate?: number;
  average_resolution_days?: number | null;
  monsoon_share?: number;
  categories?: NamedCount[];
  severities?: NamedCount[];
  wards?: NamedCount[];
  monthly?: { label: string; count: number }[];
  forecast?: ForecastResult;
};

export type ForecastResult = {
  available: boolean;
  reason?: string;
  method?: string;
  train_months?: number;
  holdout_months?: number;
  mae?: number;
  rmse?: number;
  mape?: number;
  holdout?: { label: string; actual: number; predicted: number }[];
  history?: { label: string; actual: number }[];
  forecast?: { label: string; predicted: number }[];
};

export type Hotspot = {
  latitude: number;
  longitude: number;
  recent_incidents: number;
  previous_incidents: number;
  open_incidents: number;
  report_count: number;
  dominant_category: string;
  area: string | null;
  emerging: boolean;
  recurring: boolean;
  rule: string;
};

export type IncidentDetail = AuthorityIssue & {
  reports: {
    id: string;
    tracking_code: string | null;
    original_text: string;
    description: string;
    visual_evidence: string;
    severity: string;
    issue_type: string;
    confidence: number;
    timestamp: string;
    image_path: string | null;
    language: string | null;
    area: string | null;
  }[];
  events: { id: string; kind: string; message: string; created_at: string; actor: string | null }[];
  resolution_images: { id: string; note: string | null; image_path: string; created_at: string }[];
  feedback: { id: string; rating: number | null; comment: string | null; confirmed: boolean; created_at: string }[];
  recommended_steps: string[];
  similar: {
    incident_id: string;
    tracking_code: string | null;
    issue_type: string;
    area: string | null;
    status: string;
    semantic_similarity: number;
    geographic_distance_m: number;
    time_difference_hours: number;
    passed_similarity: boolean;
    passed_distance: boolean;
    passed_time: boolean;
    explanation: string;
    latitude: number;
    longitude: number;
  }[];
};

export type AnalyticsPayload = {
  incidents: number;
  monthly: { label: string; count: number }[];
  categories: NamedCount[];
  severities: NamedCount[];
  statuses: NamedCount[];
  priority_bands: NamedCount[];
  monsoon_incidents: number;
  other_season_incidents: number;
  hotspots: Hotspot[];
  area_health: { method: string; areas: { area: string; incidents: number; open_incidents: number; resolution_rate: number; mean_priority: number | null; score: number }[] };
  archive: ArchiveSnapshot;
};

export type EvaluationPayload = {
  routing: {
    available: boolean;
    reason?: string;
    method?: string;
    compared?: number;
    matched?: number;
    agreement?: number | null;
    by_category?: { category: string; expected: string; predicted: string | null; compared: number; matched: number; agreement: number | null }[];
  };
  forecast: ForecastResult;
  duplicate_detection: { labeled_pairs: number; accuracy: number | null; note: string };
  priority: { formula: string; weights: Record<string, number>; note: string };
  archive_rows?: number;
  department: string;
};

export type PublicStats = {
  live_complaints: number;
  live_incidents: number;
  live_resolved: number;
  archive_complaints: number | null;
  archive_label: string | null;
};

function deptQuery(department: string) {
  return department ? `?department=${encodeURIComponent(department)}` : "";
}

export function fetchPublicStats() {
  return request<PublicStats>("/api/public/stats");
}

export function fetchDepartments() {
  return request<{ departments: { id: string; name: string; categories: string[]; issues: string[]; brief: string }[] }>("/api/departments");
}

export function loginAccount(email: string, password: string) {
  return request<{ token: string; user: SessionUser }>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export function registerAccount(name: string, email: string, password: string) {
  return request<{ token: string; user: SessionUser }>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
}

export function logoutAccount() {
  return request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}

export function fetchMe() {
  return request<{ user: SessionUser }>("/api/auth/me");
}

export function fetchMyComplaints() {
  return request<{ complaints: Record<string, string | null>[] }>("/api/me/complaints");
}

export function fetchNotifications() {
  return request<{ notifications: { id: string; title: string; body: string; read_at: string | null; created_at: string; unread: boolean; incident_id: string | null }[]; unread: number }>(
    "/api/me/notifications",
  );
}

export function markNotificationRead(id: string) {
  return request<{ ok: boolean }>(`/api/me/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead() {
  return request<{ ok: boolean }>("/api/me/notifications/read-all", { method: "POST" });
}

export function fetchTracking(code: string) {
  return request<IncidentDetail>(`/api/track/${encodeURIComponent(code)}`);
}

export function sendFeedback(code: string, body: { rating: number | null; comment: string; confirmed: boolean }) {
  return request<IncidentDetail>(`/api/track/${encodeURIComponent(code)}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function askCitizen(question: string, trackingCode?: string) {
  return request<{ mode: string; answer: string; sources: { title: string; source: string; excerpt: string }[]; model: string | null; model_error?: string }>(
    "/api/assistant/citizen",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, tracking_code: trackingCode || null }),
    },
  );
}

export function askAuthority(question: string, department: string, incidentId?: string) {
  return request<{ mode: string; answer: string; sources: { title: string; source: string; excerpt: string }[]; model: string | null; model_error?: string }>(
    "/api/assistant/authority",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, department: department || null, incident_id: incidentId || null }),
    },
  );
}

export function fetchOverview(department: string) {
  return request<Overview>(`/api/authority/overview${deptQuery(department)}`);
}

export function fetchAuthorityIncidents(department: string, query: URLSearchParams) {
  const params = new URLSearchParams(query);
  if (department) params.set("department", department);
  return request<{ total: number; page: number; page_size: number; issues: AuthorityIssue[] }>(`/api/authority/incidents?${params.toString()}`);
}

export function fetchAuthorityIncident(id: string) {
  return request<IncidentDetail>(`/api/authority/incidents/${id}`);
}

export function patchIncident(id: string, body: Record<string, unknown>) {
  return request<IncidentDetail>(`/api/authority/incidents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function bulkIncidents(body: { ids: string[]; status: string; note?: string; resolution?: string }) {
  return request<{ updated: string[] }>("/api/authority/incidents/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function uploadEvidence(id: string, body: FormData) {
  return request<{ id: string; image_path: string }>(`/api/authority/incidents/${id}/evidence`, { method: "POST", body });
}

export function summarizeIncident(id: string) {
  return request<{ ai_summary: string }>(`/api/authority/incidents/${id}/summarize`, { method: "POST" });
}

export function fetchActivity(department: string) {
  return request<{ events: { id: string; kind: string; message: string; created_at: string; tracking_code: string | null; actor: string | null }[] }>(
    `/api/authority/activity${deptQuery(department)}`,
  );
}

export function fetchAnalytics(department: string) {
  return request<AnalyticsPayload>(`/api/authority/analytics${deptQuery(department)}`);
}

export function fetchHotspots(department: string) {
  return request<{ live: Hotspot[]; area_health: AnalyticsPayload["area_health"]; archive: ArchiveSnapshot }>(`/api/authority/hotspots${deptQuery(department)}`);
}

export function fetchAlerts(department: string) {
  return request<{ alerts: { kind: string; incident_id: string | null; tracking_code: string | null; title: string; detail: string }[] }>(
    `/api/authority/alerts${deptQuery(department)}`,
  );
}

export function fetchEvaluation(department: string) {
  return request<EvaluationPayload>(`/api/authority/evaluation${deptQuery(department)}`);
}

export function fetchAdminUsers() {
  return request<{ users: SessionUser[] }>("/api/admin/users");
}

export function createAdminUser(body: { name: string; email: string; password: string; role: string; department: string | null }) {
  return request<{ user: SessionUser }>("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function downloadAuthorityReport(kind: "csv" | "pdf", department: string, status: string) {
  const params = new URLSearchParams();
  if (department) params.set("department", department);
  if (status) params.set("status", status);
  const token = typeof window === "undefined" ? null : window.localStorage.getItem("civicmind.token");
  const response = await fetch(`${API_URL}/api/authority/export.${kind}?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(await readError(response));
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = kind === "csv" ? "civicmind-incidents.csv" : "civicmind-report.pdf";
  link.click();
  URL.revokeObjectURL(url);
}
