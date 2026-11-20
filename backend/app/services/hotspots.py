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
