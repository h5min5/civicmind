from dataclasses import dataclass


@dataclass(frozen=True)
class Thresholds:
    semantic_similarity: float
    geo_radius_meters: float
    time_window_hours: float


@dataclass(frozen=True)
class Candidate:
    complaint_id: str
    incident_id: str
    semantic_similarity: float
    distance_m: float
    time_difference_hours: float


@dataclass(frozen=True)
class Decision:
    matched_existing: bool
    incident_id: str | None
    compared_complaint_id: str | None
    semantic_similarity: float | None
    geographic_distance_m: float | None
    time_difference_hours: float | None
    passed_similarity: bool | None
    passed_distance: bool | None
    passed_time: bool | None
    explanation: str


def format_distance(meters: float) -> str:
    if meters < 1000:
        return f"{meters:.0f} m"
    return f"{meters / 1000:.2f} km"


def format_hours(hours: float) -> str:
    if hours < 1:
        return f"{round(hours * 60)} min"
    return f"{hours:.1f} h"


def _passes(candidate: Candidate, thresholds: Thresholds) -> bool:
    return (
        candidate.semantic_similarity >= thresholds.semantic_similarity
        and candidate.distance_m <= thresholds.geo_radius_meters
        and candidate.time_difference_hours <= thresholds.time_window_hours
    )


def evaluate_candidates(candidates: list[Candidate], thresholds: Thresholds) -> Decision:
    """Transparent AND-rule: similarity, distance, and time must all pass."""
    if not candidates:
        return Decision(
            matched_existing=False,
            incident_id=None,
            compared_complaint_id=None,
            semantic_similarity=None,
            geographic_distance_m=None,
            time_difference_hours=None,
            passed_similarity=None,
            passed_distance=None,
            passed_time=None,
            explanation="Created a new incident. No earlier complaint is available to compare.",
        )

    winners = [candidate for candidate in candidates if _passes(candidate, thresholds)]
    if winners:
        best = max(winners, key=lambda candidate: candidate.semantic_similarity)
        return Decision(
            matched_existing=True,
            incident_id=best.incident_id,
            compared_complaint_id=best.complaint_id,
            semantic_similarity=best.semantic_similarity,
            geographic_distance_m=best.distance_m,
            time_difference_hours=best.time_difference_hours,
            passed_similarity=True,
            passed_distance=True,
            passed_time=True,
            explanation=(
                "Joined an existing incident. "
                f"Semantic similarity is {best.semantic_similarity:.2f} "
                f"(threshold {thresholds.semantic_similarity:.2f}), "
                f"the report is {format_distance(best.distance_m)} away "
                f"(limit {format_distance(thresholds.geo_radius_meters)}), "
                f"and the time gap is {format_hours(best.time_difference_hours)} "
                f"(limit {format_hours(thresholds.time_window_hours)})."
            ),
        )

    def miss_rank(candidate: Candidate) -> tuple[int, float]:
        failures = 0
        if candidate.semantic_similarity < thresholds.semantic_similarity:
            failures += 1
        if candidate.distance_m > thresholds.geo_radius_meters:
            failures += 1
        if candidate.time_difference_hours > thresholds.time_window_hours:
            failures += 1
        return (failures, -candidate.semantic_similarity)

    near = min(candidates, key=miss_rank)
    similarity_ok = near.semantic_similarity >= thresholds.semantic_similarity
    distance_ok = near.distance_m <= thresholds.geo_radius_meters
    time_ok = near.time_difference_hours <= thresholds.time_window_hours
    reasons: list[str] = []
    if not similarity_ok:
        reasons.append(
            f"semantic similarity {near.semantic_similarity:.2f} is below {thresholds.semantic_similarity:.2f}"
        )
    if not distance_ok:
        reasons.append(
            f"distance {format_distance(near.distance_m)} is outside {format_distance(thresholds.geo_radius_meters)}"
        )
    if not time_ok:
        reasons.append(
            f"time gap {format_hours(near.time_difference_hours)} is outside {format_hours(thresholds.time_window_hours)}"
        )
    return Decision(
        matched_existing=False,
        incident_id=None,
        compared_complaint_id=near.complaint_id,
        semantic_similarity=near.semantic_similarity,
        geographic_distance_m=near.distance_m,
        time_difference_hours=near.time_difference_hours,
        passed_similarity=similarity_ok,
        passed_distance=distance_ok,
        passed_time=time_ok,
        explanation="Created a new incident. The closest comparable complaint did not pass every rule: " + "; ".join(reasons) + ".",
    )
