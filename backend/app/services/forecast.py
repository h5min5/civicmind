"""Archive forecasts and routing agreement. Metrics are calculated from the CSV, never filled in."""

import csv
from datetime import date
from functools import lru_cache
from pathlib import Path

from app.config import BASE_DIR
from app.services.departments import infer_department

ARCHIVE_DEPARTMENT = {
    "Roads": "roads_infra",
    "Hydraulic": "water_supply",
    "SWM": "sanitation",
    "Sanitation": "sanitation",
    "Storm Water Drain": "drainage",
    "Electric": "street_lighting",
    "Garden": "parks_gardens",
    "Building Proposal": "building_encroachment",
    "Encroachment": "building_encroachment",
    "Environment": "public_health",
    "Health": "public_health",
    "Veterinary": "public_health",
}

MONSOON_MONTHS = {6, 7, 8, 9}


def archive_path() -> Path | None:
    candidates = (
        BASE_DIR.parent / "frontend" / "data" / "bmc_historical_complaints.csv",
        BASE_DIR / "data" / "bmc_historical_complaints.csv",
    )
    for path in candidates:
        if path.is_file():
            return path
    return None


def _month_label(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def _add_month(year: int, month: int, steps: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + steps
    return index // 12, index % 12 + 1


def _line(values: list[float]) -> tuple[float, float]:
    count = len(values)
    if count == 0:
        return 0.0, 0.0
    mean_x = (count - 1) / 2
    mean_y = sum(values) / count
    variance = sum((index - mean_x) ** 2 for index in range(count))
    if variance == 0:
        return 0.0, mean_y
    covariance = sum((index - mean_x) * (value - mean_y) for index, value in enumerate(values))
    slope = covariance / variance
    return slope, mean_y - slope * mean_x


def predict_seasonal(train: list[float], steps: int, start_month: int) -> list[float]:
    """Least-squares trend plus the average residual of each calendar month in the training window."""
    slope, intercept = _line(train)
    month_sum = [0.0] * 12
    month_count = [0] * 12
    for index, value in enumerate(train):
        month = (start_month + index) % 12
        month_sum[month] += value - (intercept + slope * index)
        month_count[month] += 1
    seasonal = [month_sum[month] / month_count[month] if month_count[month] else 0.0 for month in range(12)]
    origin = len(train)
    forecasts: list[float] = []
    for step in range(steps):
        index = origin + step
        month = (start_month + index) % 12
        forecasts.append(max(0.0, intercept + slope * index + seasonal[month]))
    return forecasts


def consecutive_months(counts: dict[tuple[int, int], int]) -> list[tuple[int, int, int]]:
    if not counts:
        return []
    start = min(counts)
    end = max(counts)
    series: list[tuple[int, int, int]] = []
    year, month = start
    while (year, month) <= end:
        series.append((year, month, counts.get((year, month), 0)))
        year, month = _add_month(year, month, 1)
    return series


def evaluate_forecast(series: list[tuple[int, int, int]], holdout: int = 6, horizon: int = 6) -> dict:
    method = (
        "Additive seasonal trend: least-squares line on monthly counts, plus the mean residual of each "
        "calendar month in the training window. The last 6 months are held out."
    )
    if len(series) < holdout + 12:
        return {
            "available": False,
            "reason": f"Need at least {holdout + 12} consecutive months to score a 6-month holdout. Found {len(series)}.",
            "method": method,
        }
    train = series[:-holdout]
    test = series[-holdout:]
    start_month = train[0][1] - 1
    predicted = predict_seasonal([float(item[2]) for item in train], holdout, start_month)
    errors = [abs(pred - item[2]) for pred, item in zip(predicted, test)]
    squared = [(pred - item[2]) ** 2 for pred, item in zip(predicted, test)]
    mape_terms = [abs(pred - item[2]) / item[2] for pred, item in zip(predicted, test) if item[2] > 0]
    future_seed = [float(item[2]) for item in series]
    future = predict_seasonal(future_seed, horizon, series[0][1] - 1)
    last_year, last_month = series[-1][0], series[-1][1]
    return {
        "available": True,
        "method": method,
        "train_months": len(train),
        "holdout_months": holdout,
        "mae": round(sum(errors) / len(errors), 2),
        "rmse": round((sum(squared) / len(squared)) ** 0.5, 2),
        "mape": round(sum(mape_terms) / len(mape_terms), 4) if mape_terms else None,
        "mape_months": len(mape_terms),
        "holdout": [
            {"label": _month_label(item[0], item[1]), "actual": item[2], "predicted": round(pred, 1)}
            for item, pred in zip(test, predicted)
        ],
        "history": [{"label": _month_label(item[0], item[1]), "actual": item[2]} for item in series],
        "forecast": [
            {
                "label": _month_label(*_add_month(last_year, last_month, step + 1)),
                "predicted": round(value, 1),
            }
            for step, value in enumerate(future)
        ],
    }


def _archive_rows(path: str, mtime_ns: int) -> tuple[dict, ...]:
    del mtime_ns
    rows: list[dict] = []
    with open(path, encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            try:
                year = int(raw["year"])
                month = int(raw["month"])
                days = float(raw["resolution_days"]) if raw.get("resolution_days") else None
            except (TypeError, ValueError, KeyError):
                continue
            if month < 1 or month > 12:
                continue
            rows.append(
                {
                    "year": year,
                    "month": month,
                    "monsoon": str(raw.get("is_monsoon_season") or "").strip() in {"1", "true", "True"},
                    "ward": (raw.get("ward_area") or "").strip(),
                    "category": (raw.get("complaint_category") or "").strip(),
                    "department": (raw.get("department_assigned") or "").strip(),
                    "severity": (raw.get("severity") or "").strip(),
                    "status": (raw.get("complaint_status") or "").strip(),
                    "resolution_days": days,
                }
            )
    return tuple(rows)


def load_archive() -> list[dict]:
    path = archive_path()
    if path is None:
        return []
    stat = path.stat()
    return list(_cached_rows(str(path), stat.st_mtime_ns))


@lru_cache(maxsize=2)
def _cached_rows(path: str, mtime_ns: int) -> tuple[dict, ...]:
    return _archive_rows(path, mtime_ns)


def filter_archive(department_id: str | None) -> list[dict]:
    rows = load_archive()
    if not department_id:
        return rows
    return [row for row in rows if ARCHIVE_DEPARTMENT.get(row["department"]) == department_id]


def monthly_counts(rows: list[dict]) -> list[tuple[int, int, int]]:
    counts: dict[tuple[int, int], int] = {}
    for row in rows:
        key = (row["year"], row["month"])
        counts[key] = counts.get(key, 0) + 1
    return consecutive_months(counts)


def routing_agreement(rows: list[dict] | None = None) -> dict:
    method = (
        "Each archive category string is passed through CivicMind phrase routing. "
        "The archive department name is aligned with a fixed crosswalk. "
        "Agreement is the share of rows where those two departments match. "
        "This is not the accuracy of a trained classifier."
    )
    source = load_archive() if rows is None else rows
    if not source:
        return {"available": False, "reason": "The historical complaints file is not available.", "method": method}
    compared = 0
    matched = 0
    by_category: dict[str, dict] = {}
    for row in source:
        expected = ARCHIVE_DEPARTMENT.get(row["department"])
        if not expected:
            continue
        predicted, _reason = infer_department(None, "", row["category"])
        compared += 1
        ok = predicted == expected
        matched += int(ok)
        bucket = by_category.setdefault(
            row["category"],
            {"category": row["category"], "expected": expected, "predicted": predicted, "compared": 0, "matched": 0},
        )
        bucket["compared"] += 1
        bucket["matched"] += int(ok)
    breakdown = []
    for bucket in by_category.values():
        bucket["agreement"] = round(bucket["matched"] / bucket["compared"], 4) if bucket["compared"] else None
        breakdown.append(bucket)
    breakdown.sort(key=lambda item: item["compared"], reverse=True)
    return {
        "available": compared > 0,
        "method": method,
        "compared": compared,
        "matched": matched,
        "agreement": round(matched / compared, 4) if compared else None,
        "by_category": breakdown,
    }


def archive_snapshot(department_id: str | None) -> dict:
    rows = filter_archive(department_id)
    if not rows:
        return {"available": False, "reason": "No historical rows are available for this department view."}
    series = monthly_counts(rows)
    resolved = [row for row in rows if row["status"] == "Resolved" and row["resolution_days"] is not None]
    monsoon = sum(1 for row in rows if row["month"] in MONSOON_MONTHS)
    wards: dict[str, int] = {}
    categories: dict[str, int] = {}
    severities: dict[str, int] = {}
    for row in rows:
        if row["ward"]:
            wards[row["ward"]] = wards.get(row["ward"], 0) + 1
        if row["category"]:
            categories[row["category"]] = categories.get(row["category"], 0) + 1
        if row["severity"]:
            severities[row["severity"]] = severities.get(row["severity"], 0) + 1
    avg_days = round(sum(row["resolution_days"] for row in resolved) / len(resolved), 2) if resolved else None
    return {
        "available": True,
        "source": "BMC historical complaints file, 2019–2025",
        "rows": len(rows),
        "resolved": sum(1 for row in rows if row["status"] == "Resolved"),
        "resolution_rate": round(sum(1 for row in rows if row["status"] == "Resolved") / len(rows), 4),
        "average_resolution_days": avg_days,
        "monsoon_share": round(monsoon / len(rows), 4),
        "categories": _top(categories, 12),
        "severities": _top(severities, 8),
        "wards": _top(wards, 10),
        "monthly": [{"label": _month_label(year, month), "count": count} for year, month, count in series],
        "forecast": evaluate_forecast(series),
        "span": {
            "from": date(series[0][0], series[0][1], 1).isoformat() if series else None,
            "to": date(series[-1][0], series[-1][1], 1).isoformat() if series else None,
        },
    }


def _top(counts: dict[str, int], limit: int) -> list[dict]:
    ordered = sorted(counts.items(), key=lambda item: item[1], reverse=True)[:limit]
    return [{"name": name, "count": count} for name, count in ordered]
