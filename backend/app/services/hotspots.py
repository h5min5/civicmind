"""Geographic concentration from stored incident coordinates."""

from collections import Counter
from datetime import datetime, timedelta, timezone


def cell_key(latitude: float, longitude: float, step: float = 0.008) -> tuple[float, float]:
    return (round(latitude / step) * step, round(longitude / step) * step)


def is_emerging(recent: int, previous: int) -> bool:
    return recent >= 3 and (previous == 0 or recent >= 2 * previous)


def detect_hotspots(points: list[dict], now: datetime | None = None) -> list[dict]:
    """Flag cells with a sharp 14-day rise, or open incidents that keep collecting reports.

    A point needs latitude, longitude, last_reported_at, report_count, status, and issue_category.
    """
    current = now or datetime.now(timezone.utc)
    recent_cut = current - timedelta(days=14)
    previous_cut = current - timedelta(days=28)
    cells: dict[tuple[float, float], dict] = {}
    for point in points:
        latitude = point.get("latitude")
        longitude = point.get("longitude")
        reported = point.get("last_reported_at")
        if latitude is None or longitude is None or reported is None:
            continue
        if isinstance(reported, str):
            reported = datetime.fromisoformat(reported)
        if reported.tzinfo is None:
            reported = reported.replace(tzinfo=timezone.utc)
        key = cell_key(float(latitude), float(longitude))
        bucket = cells.setdefault(
            key,
            {
                "recent": 0,
                "previous": 0,
                "open": 0,
                "reports": 0,
                "categories": Counter(),
                "latitudes": [],
                "longitudes": [],
                "areas": Counter(),
            },
        )
        if reported >= recent_cut:
            bucket["recent"] += 1
        elif reported >= previous_cut:
            bucket["previous"] += 1
        if point.get("status") != "resolved":
            bucket["open"] += 1
        bucket["reports"] += int(point.get("report_count") or 1)
        bucket["categories"][point.get("issue_category") or "other"] += 1
        if point.get("area"):
            bucket["areas"][point["area"]] += 1
        bucket["latitudes"].append(float(latitude))
        bucket["longitudes"].append(float(longitude))

    found: list[dict] = []
    for key, bucket in cells.items():
        emerging = is_emerging(bucket["recent"], bucket["previous"])
        recurring = bucket["reports"] >= 4 and bucket["open"] >= 1
        if not emerging and not recurring:
            continue
        category = bucket["categories"].most_common(1)[0][0]
        area = bucket["areas"].most_common(1)[0][0] if bucket["areas"] else None
        found.append(
            {
                "latitude": round(sum(bucket["latitudes"]) / len(bucket["latitudes"]), 6),
                "longitude": round(sum(bucket["longitudes"]) / len(bucket["longitudes"]), 6),
                "cell_latitude": round(key[0], 4),
                "cell_longitude": round(key[1], 4),
                "recent_incidents": bucket["recent"],
                "previous_incidents": bucket["previous"],
                "open_incidents": bucket["open"],
                "report_count": bucket["reports"],
                "dominant_category": category,
                "area": area,
                "emerging": emerging,
                "recurring": recurring,
                "rule": (
                    "Emerging: at least 3 incidents in the last 14 days, and at least twice the prior 14 days. "
                    "Recurring: at least 4 stored reports and one incident that is not resolved."
                ),
            }
        )
    found.sort(key=lambda item: (item["emerging"], item["recent_incidents"], item["report_count"]), reverse=True)
    return found


INTERVENTIONS = {
    "cleanup": (0.22, "More frequent collection and cleanup"),
    "repair": (0.28, "Targeted repair campaign"),
    "drain_cleaning": (0.32, "Drain cleaning and obstruction removal"),
    "street_lighting": (0.18, "Street-light repair and inspection"),
    "inspection": (0.16, "Additional inspections and preventive checks"),
}


def simulate_intervention(spot: dict, intervention: str, capacity_pct: int, duration_days: int) -> dict:
    """Transparent scenario estimate; this is a planning aid, not a statistical forecast."""
    if intervention not in INTERVENTIONS:
        raise ValueError("Unknown intervention.")
    capacity_pct = max(0, min(100, capacity_pct))
    duration_days = max(1, min(90, duration_days))
    base_effect, label = INTERVENTIONS[intervention]
    open_count = int(spot.get("open_incidents") or 0)
    report_count = int(spot.get("report_count") or 0)
    recent = int(spot.get("recent_incidents") or 0)

    capacity_factor = capacity_pct / 100
    duration_factor = min(duration_days / 30, 1.5)
    severity_factor = 1 + min(recent / 10, 0.5)
    estimated_reduction = round(base_effect * capacity_factor * duration_factor * severity_factor, 3)
    estimated_reduction = max(0.05, min(0.75, estimated_reduction))

    baseline_open = max(open_count, 1)
    residual_open = max(0, round(baseline_open * (1 - estimated_reduction)))
    fewer_reports = max(0, round(report_count * estimated_reduction))
    risk_reduction = round(estimated_reduction * 100, 1)

    return {
        "intervention": intervention,
        "intervention_label": label,
        "capacity_pct": capacity_pct,
        "duration_days": duration_days,
        "baseline_open_incidents": baseline_open,
        "estimated_residual_open_incidents": residual_open,
        "estimated_open_incidents_resolved": baseline_open - residual_open,
        "estimated_fewer_reports": fewer_reports,
        "estimated_risk_reduction_pct": risk_reduction,
        "method": (
            "Planning estimate based on intervention effectiveness, capacity, duration, and recent hotspot activity. "
            "Assumes no major external change and does not claim measured causal impact."
        ),
    }


def area_health(points: list[dict]) -> dict:
    """Compare localities that actually appear on stored incidents.

    score = 100 * (0.40 * resolution rate + 0.30 * open relief + 0.30 * priority relief)
    open relief = 1 - min(open incidents / 10, 1)
    priority relief = 1 - min(mean priority / 10, 1)
    Higher is healthier. Areas with no incidents are omitted.
    """
    grouped: dict[str, list[dict]] = {}
    for point in points:
        area = (point.get("area") or "").strip()
        if not area:
            continue
        grouped.setdefault(area, []).append(point)
    rows = []
    for area, items in grouped.items():
        total = len(items)
        resolved = sum(1 for item in items if item.get("status") == "resolved")
        open_count = sum(1 for item in items if item.get("status") != "resolved")
        priorities = [float(item["priority"]) for item in items if item.get("priority") is not None]
        mean_priority = sum(priorities) / len(priorities) if priorities else None
        resolution_rate = resolved / total
        open_relief = 1 - min(open_count / 10, 1)
        priority_relief = 1 - min((mean_priority or 0) / 10, 1)
        score = round(100 * (0.40 * resolution_rate + 0.30 * open_relief + 0.30 * priority_relief), 1)
        rows.append(
            {
                "area": area,
                "incidents": total,
                "open_incidents": open_count,
                "resolved_incidents": resolved,
                "resolution_rate": round(resolution_rate, 3),
                "mean_priority": round(mean_priority, 2) if mean_priority is not None else None,
                "score": score,
            }
        )
    rows.sort(key=lambda item: item["score"])
    return {
        "method": (
            "Civic health = 100 * (0.40 * resolution rate + 0.30 * (1 - min(open/10, 1)) "
            "+ 0.30 * (1 - min(mean priority/10, 1))). Higher means healthier. "
            "Only areas with at least one stored incident are included."
        ),
        "areas": rows,
    }
