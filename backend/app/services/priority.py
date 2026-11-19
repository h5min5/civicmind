"""Priority from 0 to 10. The stored severity label is left unchanged.

Priority = 0.30(Impact) + 0.25(Safety Risk) + 0.20(Report Volume) + 0.15(Location) + 0.10(Duration)

Each component is already on a 0–10 scale:
- Impact follows the civic category.
- Safety risk follows the severity label: low 2, medium 5, high 8, critical 10.
- Report volume follows the stored report count: 1 → 1, 2 → 3, 3–5 → 6, 6–10 → 8, 11+ → 10.
- Location is 8 inside Mumbai with a named area, 5 inside Mumbai without one, and 3 outside the city box.
- Duration uses the hours since first report, or until resolution if the incident is resolved:
  under 12h → 1, under 48h → 3, under 7 days → 5, under 30 days → 8, otherwise 10.
"""

from datetime import datetime, timezone

WEIGHTS = {
    "impact": 0.30,
    "safety_risk": 0.25,
    "report_volume": 0.20,
    "location": 0.15,
    "duration": 0.10,
}

IMPACT = {
    "public_safety": 10,
    "drainage": 9,
    "water_supply": 8,
    "sewage": 8,
    "road": 7,
    "traffic": 7,
    "streetlight": 6,
    "pollution": 6,
    "waste": 5,
    "encroachment": 5,
    "trees_parks": 4,
    "other": 3,
}

RISK = {"low": 2, "medium": 5, "high": 8, "critical": 10}

MUMBAI_LAT = (18.89, 19.30)
MUMBAI_LNG = (72.77, 73.05)


def combine(impact: float, risk: float, volume: float, location: float, duration: float) -> float:
    score = (
        WEIGHTS["impact"] * impact
        + WEIGHTS["safety_risk"] * risk
        + WEIGHTS["report_volume"] * volume
        + WEIGHTS["location"] * location
        + WEIGHTS["duration"] * duration
    )
    return round(min(10.0, max(0.0, score)), 1)


def impact_score(category: str) -> int:
    return IMPACT.get(category, 3)


def risk_score(severity: str) -> int:
    return RISK.get(severity, 2)


def volume_score(report_count: int) -> int:
    count = max(report_count, 1)
    if count <= 1:
        return 1
    if count == 2:
        return 3
    if count <= 5:
        return 6
    if count <= 10:
        return 8
    return 10


def location_score(latitude: float, longitude: float, area: str | None) -> int:
    inside = MUMBAI_LAT[0] <= latitude <= MUMBAI_LAT[1] and MUMBAI_LNG[0] <= longitude <= MUMBAI_LNG[1]
    if not inside:
        return 3
    if area and area.strip():
        return 8
    return 5


def duration_score(started_at: datetime, as_of: datetime) -> int:
    hours = max((as_of - started_at).total_seconds() / 3600, 0)
    if hours < 12:
        return 1
    if hours < 48:
        return 3
    if hours < 24 * 7:
        return 5
    if hours < 24 * 30:
        return 8
    return 10


def _location_detail(latitude: float, longitude: float, area: str | None, score: int) -> str:
    inside = MUMBAI_LAT[0] <= latitude <= MUMBAI_LAT[1] and MUMBAI_LNG[0] <= longitude <= MUMBAI_LNG[1]
    if not inside:
        return f"The pin is outside the Mumbai operating area, so location scores {score} of 10."
    if area and area.strip():
        return f"The pin is inside Mumbai and the area is recorded as {area.strip()}, so location scores {score} of 10."
    return f"The pin is inside Mumbai but no area name was stored, so location scores {score} of 10."


def _duration_detail(hours: float, score: int) -> str:
    if hours < 12:
        band = "under 12 hours"
    elif hours < 48:
        band = "between 12 and 48 hours"
    elif hours < 24 * 7:
        band = "between 2 and 7 days"
    elif hours < 24 * 30:
        band = "between 7 and 30 days"
    else:
        band = "30 days or more"
    return f"The incident has been open for {hours:.1f} hours ({band}), so duration scores {score} of 10."


def priority_for_incident(
    *,
    category: str,
    severity: str,
    report_count: int,
    latitude: float,
    longitude: float,
    area: str | None,
    started_at: datetime,
    status: str,
    resolved_at: datetime | None,
    now: datetime | None = None,
) -> dict:
    current = now or datetime.now(timezone.utc)
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    as_of = current
    if status == "resolved" and resolved_at is not None:
        as_of = resolved_at if resolved_at.tzinfo else resolved_at.replace(tzinfo=timezone.utc)
    elif as_of.tzinfo is None:
        as_of = as_of.replace(tzinfo=timezone.utc)
    impact = impact_score(category)
    risk = risk_score(severity)
    volume = volume_score(report_count)
    location = location_score(latitude, longitude, area)
    duration = duration_score(started_at, as_of)
    hours = max((as_of - started_at).total_seconds() / 3600, 0)
    score = combine(impact, risk, volume, location, duration)
    factors = [
        {
            "key": "impact",
            "label": "Impact",
            "weight": WEIGHTS["impact"],
            "score": impact,
            "detail": f"{category.replace('_', ' ')} scores {impact} of 10 on civic impact.",
        },
        {
            "key": "risk",
            "label": "Safety risk",
            "weight": WEIGHTS["safety_risk"],
            "score": risk,
            "detail": f"Severity '{severity}' scores {risk} of 10. The severity label itself is unchanged.",
        },
        {
            "key": "volume",
            "label": "Report volume",
            "weight": WEIGHTS["report_volume"],
            "score": volume,
            "detail": f"{max(report_count, 1)} stored report(s) score {volume} of 10.",
        },
        {
            "key": "location",
            "label": "Location",
            "weight": WEIGHTS["location"],
            "score": location,
            "detail": _location_detail(latitude, longitude, area, location),
        },
        {
            "key": "duration",
            "label": "Duration",
            "weight": WEIGHTS["duration"],
            "score": duration,
            "detail": _duration_detail(hours, duration),
        },
    ]
    return {
        "score": score,
        "impact": impact,
        "risk": risk,
        "volume": volume,
        "location": location,
        "duration": duration,
        "duration_hours": round(hours, 1),
        "urgent": score >= 8,
        "weights": WEIGHTS,
        "factors": factors,
    }
