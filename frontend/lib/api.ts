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

export type Features = {
  issue_category: string;
  issue_type: string;
  issue_subtype: string;
  severity: string;
  description: string;
  visual_evidence: string;
  confidence: number;
};

export type SeverityFactors = {
  impact: number;
  safety_risk: number;
  report_volume: number;
  location: number;
  duration: number;
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
  issue_type: string | null;
  department: string | null;
  routing_reason: string | null;
  severity_score: number | null;
  priority: string | null;
  status: string | null;
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
};

export type ComplaintRecord = {
  id: string;
  original_text: string;
  image_path: string | null;
  issue_category: string;
  issue_type: string;
  issue_subtype: string;
  severity: string;
  severity_score: number | null;
  priority: string | null;
  department: string | null;
  area?: string | null;
  routing_reason: string | null;
  status: string;
  matched_existing: boolean;
  description: string;
  visual_evidence: string;
  confidence: number;
  latitude: number;
  longitude: number;
  timestamp: string;
  incident_id: string | null;
  created_at: string;
  distance_m: number | null;
};

export type IncidentRecord = {
  id: string;
  issue_category: string;
  issue_type: string;
  severity: string;
  latitude: number;
  longitude: number;
  first_reported_at: string;
  last_reported_at: string;
  report_count: number;
  distance_m: number | null;
};

export type Filters = {
  q: string;
  category: string;
  severity: string;
  issueType: string;
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
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.near) {
    if (!coords) throw new Error("Use your location before searching nearby complaints.");
    params.set("near_lat", String(coords.latitude));
    params.set("near_lng", String(coords.longitude));
    params.set("radius_m", String(filters.radius));
  }
  params.set("limit", "20");
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
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, signal: AbortSignal.timeout(90000) });
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

export type AuthorityStats = {
  total_complaints: number;
  pending_complaints: number;
  resolved_complaints: number;
  high_priority_complaints: number;
  critical_complaints: number;
  duplicate_complaints: number;
  complaints_by_department: { department: string; total: number }[];
  complaints_by_priority: { priority: string; total: number }[];
};

export type AuthorityComplaint = {
  id: string;
  issue_type: string;
  issue_category: string;
  description: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  department: string | null;
  severity_score: number | null;
  priority: string | null;
  status: string;
  matched_existing: boolean;
  original_text: string;
};

export function fetchAuthorityStats() {
  return request<AuthorityStats>("/api/authority/stats");
}

export function fetchAuthorityComplaints(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).length > 0) {
      query.set(key, String(value));
    }
  }
  return request<{ complaints: AuthorityComplaint[] }>(`/api/authority/complaints?${query.toString()}`);
}

export function updateComplaintStatus(complaintId: string, status: string) {
  return request<{ complaint_id: string; status: string }>(`/api/authority/complaints/${complaintId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}
