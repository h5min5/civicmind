import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import undefer

from app.config import get_settings
from app.database import SessionLocal, ping_database, safe_error
from app.models import Complaint
from app.services.dashboard import authority_stats, list_authority_complaints, normalize_status, update_complaint_status
from app.services.embeddings import ProviderError, cached_dimension, get_embedding_client
from app.services.groq_vision import analyze_complaint
from app.services.pipeline import submit_complaint
from app.services.queries import list_complaints, list_incidents

router = APIRouter()


class StatusUpdateRequest(BaseModel):
    status: str


MAX_IMAGE_BYTES = 3_500_000
SEVERITIES = {"low", "medium", "high", "critical"}


@router.get("/health")
def health():
    settings = get_settings()
    database = ping_database()
    dimension = cached_dimension()
    embedding_error = None
    if database["ok"] and dimension is None:
        session = SessionLocal()
        try:
            dimension = get_embedding_client().probe(session)
            session.commit()
        except Exception as exc:
            session.rollback()
            embedding_error = safe_error(exc)
        finally:
            session.close()
    return {
        "service": "civicmind",
        "database_ok": database["ok"],
        "database_error": database["error"],
        "postgis": database["postgis"],
        "pgvector": database["pgvector"],
        "groq_model": settings.groq_model,
        "embedding_model": settings.embedding_model,
        "embedding_dimensions": dimension,
        "embedding_verified": dimension is not None,
        "embedding_error": embedding_error,
        "thresholds": _thresholds(),
    }


@router.post("/complaints")
def create_complaint(
    text: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    image: UploadFile | None = File(None),
):
    complaint_text = _clean_text(text)
    _validate_coordinates(latitude, longitude)
    image_bytes, media_type = _read_image(image)
    timestamp = datetime.now(timezone.utc)
    try:
        analysis = analyze_complaint(complaint_text, image_bytes, media_type)
    except ProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    if analysis.features is None:
        return _rejected(analysis.assessment, timestamp)

    database = ping_database()
    if not database["ok"]:
        raise HTTPException(status_code=503, detail=database["error"] or "Database is unavailable.")

    session = SessionLocal()
    try:
        with session.begin():
            complaint, incident, decision, dimension = submit_complaint(
                session,
                complaint_text,
                latitude,
                longitude,
                timestamp,
                analysis,
                image_bytes,
                media_type,
            )
            payload = _accepted(analysis, complaint, incident, decision, dimension)
        return payload
    except ProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    finally:
        session.close()


@router.get("/authority/stats")
def authority_summary():
    database = ping_database()
    if not database["ok"]:
        raise HTTPException(status_code=503, detail=database["error"] or "Database is unavailable.")
    session = SessionLocal()
    try:
        return authority_stats(session)
    finally:
        session.close()


@router.get("/authority/complaints")
def authority_complaints(
    q: str | None = None,
    department: str | None = None,
    priority: str | None = None,
    status: str | None = None,
    issue_type: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    sort_by: str = Query(default="severity_score", pattern="(severity_score|date|priority)"),
):
    database = ping_database()
    if not database["ok"]:
        raise HTTPException(status_code=503, detail=database["error"] or "Database is unavailable.")
    session = SessionLocal()
    try:
        return {"complaints": list_authority_complaints(
            session,
            q=_blank(q),
            department=_blank(department),
            priority=_blank(priority),
            status=_blank(status),
            issue_type=_blank(issue_type),
            limit=limit,
            sort_by=sort_by,
        )}
    finally:
        session.close()


@router.patch("/authority/complaints/{complaint_id}/status")
def update_status(complaint_id: uuid.UUID, body: "StatusUpdateRequest"):
    database = ping_database()
    if not database["ok"]:
        raise HTTPException(status_code=503, detail=database["error"] or "Database is unavailable.")
    session = SessionLocal()
    try:
        with session.begin():
            updated = update_complaint_status(session, str(complaint_id), body.status)
        return {"complaint_id": str(complaint_id), "status": updated["status"]}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    finally:
        session.close()


@router.get("/complaints")
def complaints(
    q: str | None = None,
    category: str | None = None,
    severity: str | None = None,
    issue_type: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    near_lat: float | None = None,
    near_lng: float | None = None,
    radius_m: float | None = Query(default=None, gt=0, le=20000),
    limit: int = Query(default=20, ge=1, le=50),
):
    _validate_search(severity, near_lat, near_lng, radius_m)
    if near_lat is not None and radius_m is None:
        radius_m = 1000
    database = ping_database()
    if not database["ok"]:
        raise HTTPException(status_code=503, detail=database["error"] or "Database is unavailable.")
    session = SessionLocal()
    try:
        return {
            "complaints": list_complaints(
                session,
                q=_blank(q),
                category=_blank(category),
                severity=_blank(severity),
                issue_type=_blank(issue_type),
                date_from=date_from,
                date_to=date_to,
                near_lat=near_lat,
                near_lng=near_lng,
                radius_m=radius_m,
                limit=limit,
            )
        }
    finally:
        session.close()


@router.get("/incidents")
def incidents(
    q: str | None = None,
    category: str | None = None,
    severity: str | None = None,
    issue_type: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    near_lat: float | None = None,
    near_lng: float | None = None,
    radius_m: float | None = Query(default=None, gt=0, le=20000),
    limit: int = Query(default=20, ge=1, le=50),
):
    _validate_search(severity, near_lat, near_lng, radius_m)
    if near_lat is not None and radius_m is None:
        radius_m = 1000
    database = ping_database()
    if not database["ok"]:
        raise HTTPException(status_code=503, detail=database["error"] or "Database is unavailable.")
    session = SessionLocal()
    try:
        return {
            "incidents": list_incidents(
                session,
                q=_blank(q),
                category=_blank(category),
                severity=_blank(severity),
                issue_type=_blank(issue_type),
                date_from=date_from,
                date_to=date_to,
                near_lat=near_lat,
                near_lng=near_lng,
                radius_m=radius_m,
                limit=limit,
            )
        }
    finally:
        session.close()


@router.get("/complaints/{complaint_id}/image")
def complaint_image(complaint_id: uuid.UUID):
    database = ping_database()
    if not database["ok"]:
        raise HTTPException(status_code=503, detail=database["error"] or "Database is unavailable.")
    session = SessionLocal()
    try:
        complaint = session.get(Complaint, complaint_id, options=(undefer(Complaint.image_bytes),))
        if complaint is None or not complaint.image_bytes:
            raise HTTPException(status_code=404, detail="No image for this complaint.")
        payload = bytes(complaint.image_bytes)
        media_type = complaint.image_media_type or "image/jpeg"
    finally:
        session.close()
    return Response(content=payload, media_type=media_type, headers={"Cache-Control": "public, max-age=86400"})


def _accepted(analysis, complaint: Complaint, incident, decision, dimension: int) -> dict:
    assessment = analysis.assessment
    return {
        "accepted": True,
        "validation": {
            "is_valid_civic_complaint": True,
            "rejection_reason": None,
            "text_describes_civic_issue": assessment.text_describes_civic_issue,
            "image_shows_civic_issue": assessment.image_shows_civic_issue,
        },
        "features": analysis.features.model_dump(),
        "issue_type": complaint.issue_type,
        "department": complaint.department,
        "routing_reason": complaint.routing_reason,
        "severity_score": float(complaint.severity_score) if complaint.severity_score is not None else None,
        "priority": complaint.priority,
        "status": complaint.status,
        "complaint_id": str(complaint.id),
        "incident_id": str(incident.id),
        "matched_existing": decision.matched_existing,
        "semantic_similarity": decision.semantic_similarity,
        "geographic_distance_m": decision.geographic_distance_m,
        "time_difference_hours": decision.time_difference_hours,
        "passed_similarity": decision.passed_similarity,
        "passed_distance": decision.passed_distance,
        "passed_time": decision.passed_time,
        "explanation": decision.explanation,
        "embedding_dimensions": dimension,
        "timestamp": complaint.timestamp.isoformat(),
        "thresholds": _thresholds(),
    }


def _rejected(assessment, timestamp: datetime) -> dict:
    return {
        "accepted": False,
        "validation": {
            "is_valid_civic_complaint": False,
            "rejection_reason": assessment.rejection_reason,
            "text_describes_civic_issue": assessment.text_describes_civic_issue,
            "image_shows_civic_issue": assessment.image_shows_civic_issue,
        },
        "features": None,
        "complaint_id": None,
        "incident_id": None,
        "matched_existing": None,
        "semantic_similarity": None,
        "geographic_distance_m": None,
        "time_difference_hours": None,
        "passed_similarity": None,
        "passed_distance": None,
        "passed_time": None,
        "explanation": assessment.rejection_reason,
        "embedding_dimensions": None,
        "timestamp": timestamp.isoformat(),
        "thresholds": _thresholds(),
    }


def _thresholds() -> dict:
    settings = get_settings()
    return {
        "semantic_similarity": settings.similarity_threshold,
        "geo_radius_meters": settings.geo_radius_meters,
        "time_window_hours": settings.time_window_hours,
    }


def _clean_text(value: str) -> str:
    cleaned = " ".join(value.split())
    if len(cleaned) < 8:
        raise HTTPException(status_code=400, detail="Describe the civic problem in at least a short sentence.")
    if len(cleaned) > 4000:
        raise HTTPException(status_code=400, detail="Complaint text must be under 4000 characters.")
    return cleaned


def _validate_coordinates(latitude: float, longitude: float) -> None:
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise HTTPException(status_code=400, detail="Latitude or longitude is outside the valid range.")


def _validate_search(
    severity: str | None,
    near_lat: float | None,
    near_lng: float | None,
    radius_m: float | None,
) -> None:
    if severity and severity not in SEVERITIES:
        raise HTTPException(status_code=400, detail="Severity must be low, medium, high, or critical.")
    if (near_lat is None) != (near_lng is None):
        raise HTTPException(status_code=400, detail="Provide both latitude and longitude to search by location.")
    if near_lat is not None and near_lng is not None:
        _validate_coordinates(near_lat, near_lng)
    if radius_m is not None and near_lat is None:
        raise HTTPException(status_code=400, detail="Add a location before using a search radius.")


def _blank(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _read_image(image: UploadFile | None) -> tuple[bytes | None, str | None]:
    if image is None or not image.filename:
        return None, None
    data = image.file.read()
    if not data:
        return None, None
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Photo must be under 3.5 MB. Try a smaller JPG.")
    media_type = _sniff_image(data)
    if media_type is None:
        raise HTTPException(status_code=400, detail="Use a JPG, PNG, or WebP photo of the civic issue.")
    return data, media_type


def _sniff_image(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    return None
