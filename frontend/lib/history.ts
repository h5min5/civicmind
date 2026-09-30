export type HistoryRow = {
  year: number;
  month: number;
  monsoon: boolean;
  ward: string;
  zone: string;
  category: string;
  department: string;
  severity: string;
  status: string;
  resolutionDays: number;
};

export type HistoryFilters = {
  year: number | null;
  zone: string | null;
  ward: string | null;
  category: string | null;
  department: string | null;
  severity: string | null;
  status: string | null;
};

export type NamedCount = { name: string; count: number };

export type HistoryView = {
  total: number;
  resolved: number;
  avgResolutionDays: number | null;
  monsoon: number;
  critical: number;
  options: {
    years: number[];
    zones: string[];
    wards: string[];
    places: { ward: string; zone: string }[];
    categories: string[];
    departments: string[];
    severities: string[];
    statuses: string[];
  };
  timeline: { label: string; count: number }[];
  categories: NamedCount[];
  wards: NamedCount[];
  severities: NamedCount[];
  statuses: NamedCount[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SEVERITY_ORDER = ["Low", "Medium", "High", "Critical"];
const STATUS_ORDER = ["In Progress", "Escalated", "Reopened", "Resolved", "Closed Without Resolution"];

export function parseHistoryCsv(text: string): HistoryRow[] {
  const table = parseCsv(text);
  if (table.length < 2) return [];
  const header = table[0].map((cell) => cell.trim().replace(/^\uFEFF/, ""));
  const column = (name: string) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`Historical file is missing the ${name} column.`);
    return index;
  };
  const year = column("year");
  const month = column("month");
  const monsoon = column("is_monsoon_season");
  const ward = column("ward_area");
  const zone = column("zone");
  const category = column("complaint_category");
  const department = column("department_assigned");
  const severity = column("severity");
  const status = column("complaint_status");
  const days = column("resolution_days");
  const rows: HistoryRow[] = [];
  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i];
    if (cells.every((cell) => cell.trim() === "")) continue;
    const parsedYear = Number(cells[year]);
    const parsedMonth = Number(cells[month]);
    if (!Number.isInteger(parsedYear) || !Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) continue;
    rows.push({
      year: parsedYear,
      month: parsedMonth,
      monsoon: cells[monsoon]?.trim() === "1",
      ward: cells[ward]?.trim() || "Unknown",
      zone: cells[zone]?.trim() || "Unknown",
      category: cells[category]?.trim() || "Unknown",
      department: cells[department]?.trim() || "Unknown",
      severity: cells[severity]?.trim() || "Unknown",
      status: cells[status]?.trim() || "Unknown",
      resolutionDays: Number(cells[days]) || 0,
    });
  }
  return rows;
}

export function historyOptions(rows: HistoryRow[]): HistoryView["options"] {
  const severities = new Set(rows.map((row) => row.severity));
  const statuses = new Set(rows.map((row) => row.status));
  const places = uniquePlaces(rows);
  return {
    years: uniqueNumbers(rows.map((row) => row.year)),
    zones: uniqueStrings(rows.map((row) => row.zone)),
    wards: places.map((place) => place.ward),
    places,
    categories: uniqueStrings(rows.map((row) => row.category)),
    departments: uniqueStrings(rows.map((row) => row.department)),
    severities: [...SEVERITY_ORDER.filter((item) => severities.has(item)), ...[...severities].filter((item) => !SEVERITY_ORDER.includes(item)).sort()],
    statuses: [...STATUS_ORDER.filter((item) => statuses.has(item)), ...[...statuses].filter((item) => !STATUS_ORDER.includes(item)).sort()],
  };
}

export function aggregateHistory(rows: HistoryRow[], filters: HistoryFilters, options: HistoryView["options"]): HistoryView {
  const matched = rows.filter(
    (row) =>
      (filters.year == null || row.year === filters.year) &&
      (filters.zone == null || row.zone === filters.zone) &&
      (filters.ward == null || row.ward === filters.ward) &&
      (filters.category == null || row.category === filters.category) &&
      (filters.department == null || row.department === filters.department) &&
      (filters.severity == null || row.severity === filters.severity) &&
      (filters.status == null || row.status === filters.status),
  );
  let resolved = 0;
  let monsoon = 0;
  let critical = 0;
  let daySum = 0;
  const byMonth = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const byWard = new Map<string, number>();
  const bySeverity = new Map<string, number>();
  const byStatus = new Map<string, number>();
  for (const row of matched) {
    if (row.status === "Resolved") resolved += 1;
    if (row.monsoon) monsoon += 1;
    if (row.severity === "Critical") critical += 1;
    daySum += row.resolutionDays;
    const key = `${row.year}-${row.month}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    bump(byCategory, row.category);
    bump(byWard, row.ward);
    bump(bySeverity, row.severity);
    bump(byStatus, row.status);
  }
  const years = filters.year != null ? [filters.year] : options.years;
  const timeline = years.flatMap((year) =>
    MONTHS.map((monthName, index) => ({
      label: filters.year != null ? monthName : `${monthName} ${year}`,
      count: byMonth.get(`${year}-${index + 1}`) ?? 0,
    })),
  );
  return {
    total: matched.length,
    resolved,
    avgResolutionDays: matched.length ? Math.round((daySum / matched.length) * 10) / 10 : null,
    monsoon,
    critical,
    options,
    timeline,
    categories: countsDescending(byCategory),
    wards: countsDescending(byWard),
    severities: orderedCounts(options.severities, bySeverity),
    statuses: orderedCounts(options.statuses, byStatus),
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function uniquePlaces(rows: HistoryRow[]) {
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (!seen.has(row.ward)) seen.set(row.ward, row.zone);
  }
  return [...seen.entries()]
    .map(([ward, zone]) => ({ ward, zone }))
    .sort((a, b) => a.ward.localeCompare(b.ward));
}

function uniqueNumbers(values: number[]) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function countsDescending(map: Map<string, number>): NamedCount[] {
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function orderedCounts(order: string[], map: Map<string, number>): NamedCount[] {
  return order.filter((name) => map.has(name)).map((name) => ({ name, count: map.get(name) ?? 0 }));
}
