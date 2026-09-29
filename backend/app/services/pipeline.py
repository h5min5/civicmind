import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models import Complaint, Incident
from app.services.embeddings import get_embedding_client, to_pgvector
from app.services.geocode import lookup_area
from app.services.groq_vision import Analysis, semantic_text
from app.services.matching import Candidate, Decision, Thresholds, evaluate_candidates

logger = logging.getLogger("civicmind")

SEVERITY_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}


def submit_complaint(
    session: Session,
    original_text: str,
    latitude: float,
    longitude: float,
    timestamp: datetime,
    analysis: Analysis,
    image: bytes | None,
    media_type: str | None,
) -> tuple[Complaint, Incident, Decision, int]:
    if analysis.features is None:
        raise RuntimeError("Only accepted complaints can be stored.")
    features = analysis.features
    settings = get_settings()
    area = lookup_area(latitude, longitude)
    session.execute(text("SELECT pg_advisory_xact_lock(451234)"))
    embedding = get_embedding_client().embed(semantic_text(original_text, features), session)
    session.flush()

    candidates = _load_candidates(
        session,
        embedding,
        latitude,
        longitude,
        timestamp,
        settings,
    )
    decision = evaluate_candidates(candidates, _thresholds(settings))
    if decision.matched_existing and decision.incident_id is not None:
        incident = session.get(Incident, uuid.UUID(decision.incident_id))
        if incident is None:
            raise RuntimeError("Matched incident no longer exists.")
        incident.report_count += 1
        incident.last_reported_at = timestamp
        if SEVERITY_RANK[features.severity] > SEVERITY_RANK[incident.severity]:
            incident.severity = features.severity
        if area and not incident.area:
            incident.area = area
    else:
        incident = Incident(
            id=uuid.uuid4(),
            issue_category=features.issue_category,
            issue_type=features.issue_type,
            severity=features.severity,
            latitude=latitude,
            longitude=longitude,
            area=area,
            first_reported_at=timestamp,
            last_reported_at=timestamp,
            report_count=1,
        )
        session.add(incident)
        session.flush()

    complaint_id = uuid.uuid4()
    complaint = Complaint(
        id=complaint_id,
        original_text=original_text,
        image_path=f"/api/complaints/{complaint_id}/image" if image else None,
        image_bytes=image,
        image_media_type=media_type,
        issue_category=features.issue_category,
        issue_type=features.issue_type,
        issue_subtype=features.issue_subtype,
        severity=features.severity,
        description=features.description,
        visual_evidence=features.visual_evidence,
        confidence=features.confidence,
        latitude=latitude,
        longitude=longitude,
        area=area,
        timestamp=timestamp,
        embedding=embedding,
        incident_id=incident.id,
        created_at=timestamp,
    )
    session.add(complaint)
    session.flush()
    logger.info(
        "Stored complaint %s on incident %s matched=%s dim=%s",
        complaint.id,
        incident.id,
        decision.matched_existing,
        len(embedding),
    )
    return complaint, incident, decision, len(embedding)


def _thresholds(settings: Settings) -> Thresholds:
    return Thresholds(
        semantic_similarity=settings.similarity_threshold,
        geo_radius_meters=settings.geo_radius_meters,
        time_window_hours=settings.time_window_hours,
    )


def _load_candidates(
    session: Session,
    embedding: list[float],
    latitude: float,
    longitude: float,
    timestamp: datetime,
    settings: Settings,
) -> list[Candidate]:
    vector = to_pgvector(embedding)
    window = timedelta(hours=settings.time_window_hours)
    params = {
        "embedding": vector,
        "latitude": latitude,
        "longitude": longitude,
        "radius_m": settings.geo_radius_meters,
        "window_start": timestamp - window,
        "window_end": timestamp + window,
        "timestamp": timestamp,
        "limit": settings.candidate_limit,
    }
    semantic_rows = session.execute(text(_CANDIDATE_SQL), params).mappings().all()
    spatial_rows = session.execute(text(_SPATIAL_SQL), params).mappings().all()
    merged: dict[str, Candidate] = {}
    for row in [*semantic_rows, *spatial_rows]:
        candidate = _candidate_from_row(row)
        if candidate is not None:
            merged[candidate.complaint_id] = candidate
    return list(merged.values())


def _candidate_from_row(row) -> Candidate | None:
    if row["semantic_similarity"] is None or row["distance_m"] is None or row["incident_id"] is None:
        return None
    similarity = max(0.0, min(1.0, float(row["semantic_similarity"])))
    return Candidate(
        complaint_id=str(row["id"]),
        incident_id=str(row["incident_id"]),
        semantic_similarity=similarity,
        distance_m=float(row["distance_m"]),
        time_difference_hours=abs(float(row["time_difference_hours"])),
    )


_DISTANCE = """
ST_Distance(
  ST_SetSRID(ST_MakePoint(c.longitude, c.latitude), 4326)::geography,
  ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography
)
"""

_SELECT = f"""
SELECT
  c.id,
  c.incident_id,
  (1 - (c.embedding <=> CAST(:embedding AS vector))) AS semantic_similarity,
  {_DISTANCE} AS distance_m,
  (ABS(EXTRACT(EPOCH FROM (c.timestamp - :timestamp))) / 3600.0) AS time_difference_hours
FROM complaints c
WHERE c.embedding IS NOT NULL
  AND c.incident_id IS NOT NULL
"""

_CANDIDATE_SQL = _SELECT + """
ORDER BY c.embedding <=> CAST(:embedding AS vector)
LIMIT :limit
"""

_SPATIAL_SQL = _SELECT + f"""
  AND c.timestamp BETWEEN :window_start AND :window_end
  AND ST_DWithin(
    ST_SetSRID(ST_MakePoint(c.longitude, c.latitude), 4326)::geography,
    ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
    :radius_m
  )
ORDER BY c.embedding <=> CAST(:embedding AS vector)
LIMIT :limit
"""
