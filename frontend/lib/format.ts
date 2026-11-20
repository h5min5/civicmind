export const CATEGORIES: { value: string; label: string }[] = [
  { value: "road", label: "Road" },
  { value: "drainage", label: "Drainage & flooding" },
  { value: "water_supply", label: "Water supply" },
  { value: "waste", label: "Waste" },
  { value: "sewage", label: "Sewage" },
  { value: "streetlight", label: "Street lighting" },
  { value: "public_safety", label: "Public safety" },
  { value: "trees_parks", label: "Trees & parks" },
  { value: "encroachment", label: "Encroachment" },
  { value: "pollution", label: "Pollution" },
  { value: "other", label: "Other" },
];

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;

export function categoryLabel(value: string) {
  return CATEGORIES.find((item) => item.value === value)?.label ?? labelize(value);
}

export function labelize(value: string) {
  return value.replaceAll("_", " ");
}

export const DEPARTMENTS: { value: string; label: string; accent: string; brief: string }[] = [
  { value: "roads_infra", label: "Roads & Infrastructure", accent: "#e0b15a", brief: "Potholes, damaged roads, footpaths" },
  { value: "water_supply", label: "Water Supply", accent: "#7eb6d6", brief: "Leakage, shortages, contamination, pressure" },
  { value: "sanitation", label: "Sanitation", accent: "#b7c48a", brief: "Garbage, bins, sewage" },
  { value: "street_lighting", label: "Street Lighting", accent: "#e6d39a", brief: "Dark stretches, broken poles" },
  { value: "drainage", label: "Drainage", accent: "#8fb8c9", brief: "Blocked drains, waterlogging" },
  { value: "public_health", label: "Public Health", accent: "#7dcec6", brief: "Mosquito breeding, pollution, hygiene" },
  { value: "traffic", label: "Traffic", accent: "#e0a36a", brief: "Signals, obstructions" },
  { value: "parks_gardens", label: "Parks & Gardens", accent: "#8fbf8a", brief: "Fallen trees, gardens" },
  { value: "building_encroachment", label: "Building & Encroachment", accent: "#d7b4a3", brief: "Encroachment, unsafe structures" },
  { value: "public_safety", label: "Public Safety", accent: "#e7a097", brief: "Exposed wires, urgent hazards" },
];

export const ISSUE_STATUSES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
] as const;

export function departmentLabel(value: string | null | undefined) {
  if (!value) return "Unassigned";
  return DEPARTMENTS.find((item) => item.value === value)?.label ?? labelize(value);
}

export function departmentAccent(value: string | null | undefined) {
  return DEPARTMENTS.find((item) => item.value === value)?.accent ?? "#7dcec6";
}

export function statusLabel(value: string | null | undefined) {
  return ISSUE_STATUSES.find((item) => item.value === value)?.label ?? (value ? labelize(value) : "Open");
}

export function directionsLink(latitude: number, longitude: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

export function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

export function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatGap(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours.toFixed(1)} h`;
}

export function mapLink(latitude: number, longitude: number) {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
}

export async function compressImage(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Use a JPG, PNG, or WebP photo.");
  }
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not read that photo.");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("Could not prepare that photo.");
    return new File([blob], "complaint.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
