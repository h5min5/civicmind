import re
from typing import Any


def calculate_severity(
    *,
    issue_type: str,
    issue_category: str,
    description: str,
    location: str,
    report_volume: int | float | None = None,
    duration_hours: int | float | None = None,
    safety_context: str | None = None,
) -> dict[str, Any]:
    """Calculate a deterministic 0-10 severity score and explain the factors."""
    impact = _normalize_impact(issue_type, issue_category, description)
    safety_risk = _normalize_safety_risk(description, safety_context, issue_type)
    report_volume_score = _normalize_report_volume(report_volume)
    location_score = _normalize_location(location, issue_type, description)
    duration_score = _normalize_duration(duration_hours, description)

    severity_score = (
        0.30 * impact
        + 0.25 * safety_risk
        + 0.20 * report_volume_score
        + 0.15 * location_score
        + 0.10 * duration_score
    )
    severity_score = max(0.0, min(10.0, severity_score))

    result = {
        "severity_score": round(severity_score, 2),
        "priority": classify_priority(severity_score),
        "factors": {
            "impact": round(impact, 2),
            "safety_risk": round(safety_risk, 2),
            "report_volume": round(report_volume_score, 2),
            "location": round(location_score, 2),
            "duration": round(duration_score, 2),
        },
    }
    return result


def classify_priority(score: float) -> str:
    if score < 3:
        return "low"
    if score < 5:
        return "medium"
    if score < 7:
        return "high"
    return "critical"


def _normalize_impact(issue_type: str, issue_category: str, description: str) -> float:
    value = 0.0
    text = f"{issue_type} {issue_category} {description}".lower()
    high_keywords = {
        "water leakage",
        "open manhole",
        "sewer overflow",
        "major flood",
        "drain blocked",
        "road collapse",
        "pothole",
        "dangerous",
        "bus stop",
        "school",
    }
    medium_keywords = {
        "broken light",
        "garbage",
        "drain",
        "waterlogging",
        "sewerage",
        "puddle",
        "blocked drain",
    }
    if any(keyword in text for keyword in high_keywords):
        value += 6.5
    if any(keyword in text for keyword in medium_keywords):
        value += 3.5
    if "large area" in text or "major" in text or "severe" in text:
        value += 2.0
    if "minor" in text:
        value -= 2.0
    if "few" in text and "days" not in text:
        value -= 1.0
    return _clamp(value, 0.0, 10.0)


def _normalize_safety_risk(description: str, safety_context: str | None, issue_type: str) -> float:
    text = f"{description} {safety_context or ''} {issue_type}".lower()
    score = 2.0
    if any(token in text for token in ["school", "hospital", "traffic", "busy", "junction", "road", "near school", "manhole", "open"]):
        score += 3.5
    if any(token in text for token in ["dangerous", "exposed", "falling", "flooded", "electric", "hazard", "accident"]):
        score += 3.0
    if "minor" in text or "low" in text:
        score -= 1.5
    return _clamp(score, 0.0, 10.0)


def _normalize_report_volume(report_volume: int | float | None) -> float:
    value = report_volume or 0
    value = float(value)
    normalized = (value / 10.0) * 10.0
    return _clamp(normalized, 0.0, 10.0)


def _normalize_location(location: str, issue_type: str, description: str) -> float:
    text = f"{location} {issue_type} {description}".lower()
    score = 3.0
    if any(token in text for token in ["school", "junction", "busy", "market", "residential", "hospital", "road", "near"]) :
        score += 4.0
    if any(token in text for token in ["lane", "main road", "crossing", "flyover"]):
        score += 2.0
    if "minor" in text and "street" in text:
        score -= 2.0
    return _clamp(score, 0.0, 10.0)


def _normalize_duration(duration_hours: int | float | None, description: str) -> float:
    if duration_hours is not None:
        duration_value = float(duration_hours)
        return _clamp(duration_value / 24 * 10.0, 0.0, 10.0)
    text = description.lower()
    if re.search(r"(\d+)\s*(day|days|week|weeks|month|months)", text):
        match = re.search(r"(\d+)\s*(day|days|week|weeks|month|months)", text)
        if match:
            number = int(match.group(1))
            unit = match.group(2)
            multiplier = {"day": 24, "days": 24, "week": 168, "weeks": 168, "month": 720, "months": 720}.get(unit, 1)
            return _clamp((number * multiplier) / 24 * 10.0, 0.0, 10.0)
    if any(token in text for token in ["for days", "for weeks", "continuing", "persistent", "ongoing"]):
        return 7.0
    return 2.0


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))
