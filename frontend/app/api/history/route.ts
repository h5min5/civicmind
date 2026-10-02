import { readFileSync } from "node:fs";
import path from "node:path";
import { aggregateHistory, historyOptions, parseHistoryCsv, type HistoryFilters, type HistoryRow } from "@/lib/history";

let cachedRows: HistoryRow[] | null = null;

function loadRows() {
  if (cachedRows) return cachedRows;
  const file = path.join(process.cwd(), "data", "bmc_historical_complaints.csv");
  cachedRows = parseHistoryCsv(readFileSync(file, "utf8"));
  return cachedRows;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const yearRaw = params.get("year");
  const filters: HistoryFilters = {
    year: yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null,
    zone: blank(params.get("zone")),
    ward: blank(params.get("ward")),
    category: blank(params.get("category")),
    department: blank(params.get("department")),
    severity: blank(params.get("severity")),
    status: blank(params.get("status")),
  };
  const rows = loadRows();
  return Response.json(aggregateHistory(rows, filters, historyOptions(rows)));
}

function blank(value: string | null) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}
