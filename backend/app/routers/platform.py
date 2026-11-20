import uuid
from typing import Literal

from fastapi import APIRouter, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.database import SessionLocal, ping_database
from app.models import User
from app.services.assistant import authority_reply, citizen_reply, write_ai_summary
from app.services.auth import AuthError, close_session, normalize_email, open_session, public_user, resolve_user, scope_department, verify_password
from app.services.auth import hash_password
from app.services.departments import DEPARTMENT_IDS, catalog, department_name
from app.services.embeddings import ProviderError
from app.services.forecast import archive_path, archive_snapshot, load_archive, routing_agreement
from app.services.hotspots import detect_hotspots
from app.services.notices import authority_notices, issue_notice, notice_document, public_notices, read_notice_file, withdraw_notice
from app.services.priority import WEIGHTS
from app.services.reports import build_csv, build_pdf
from app.services.workspace import (
    activity,
    add_feedback,
    build_alerts,
    export_rows,
    filter_issues,
    find_tracking,
    incident_detail,
    list_notifications,
    live_analytics,
    load_issues,
    mark_all_notifications,
    mark_notification,
    my_complaints,
    overview,
    public_tracking,
    require_incident,
    resolution_image,
    store_resolution_image,
    update_incident,
)

router = APIRouter()
MAX_IMAGE_BYTES = 3_500_000


class Credentials(BaseModel):
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=8, max_length=100)


class RegisterBody(Credentials):
    name: str = Field(min_length=2, max_length=80)


class AccountBody(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=8, max_length=100)
    role: Literal["citizen", "authority", "admin"]
    department: str | None = None


class IncidentPatch(BaseModel):
    status: Literal["open", "in_progress", "resolved"] | None = None
    department: str | None = None
    note: str | None = Field(default=None, max_length=2000)
    resolution: str | None = Field(default=None, max_length=2000)
    reassign: bool = False


class BulkPatch(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=50)
    status: Literal["open", "in_progress", "resolved"]
    note: str | None = None
    resolution: str | None = None


class FeedbackBody(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)
    confirmed: bool


class AskBody(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    tracking_code: str | None = None
    incident_id: uuid.UUID | None = None
    department: str | None = None


def _session():
    database = ping_database()
    if not database["ok"]:
        raise HTTPException(status_code=503, detail=database["error"] or "Database is unavailable.")
    return SessionLocal()


def _run(work):
    session = _session()
    try:
        result = work(session)
        session.commit()
        return result
    except HTTPException:
        session.rollback()
        raise
    except AuthError as exc:
        session.rollback()
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc
    except LookupError as exc:
        session.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        session.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        session.rollback()
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ProviderError as exc:
        session.rollback()
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    finally:
        session.close()


def _email(value: str) -> str:
    cleaned = normalize_email(value)
    if "@" not in cleaned or "." not in cleaned.split("@")[-1]:
        raise ValueError("Enter a valid email address.")
    return cleaned


def _authority(session, authorization: str | None) -> User:
    user = resolve_user(session, authorization, required=True)
    if user is None or user.role not in {"authority", "admin"}:
        raise AuthError("An authority or administrator account is required.", 403)
    return user


def _scope(user: User, department: str | None) -> str | None:
    return scope_department(user.role, user.department, department)


@router.get("/notices")
def notices():
    def work(session):
        return {"notices": public_notices(session)}

    return _run(work)


@router.get("/authority/notices")
def desk_notices(department: str | None = None, authorization: str | None = Header(None)):
    def work(session):
        user = _authority(session, authorization)
        return {"notices": authority_notices(session, _scope(user, department))}

    return _run(work)


@router.post("/authority/notices")
def create_notice(
    title: str = Form(...),
    kind: Literal["warning", "closure", "advisory", "circular"] = Form(...),
    body: str = Form(""),
    department: str | None = Form(None),
    area: str | None = Form(None),
    effective_until: str | None = Form(None),
    document: UploadFile | None = File(None),
    authorization: str | None = Header(None),
):
    payload = document.file.read() if document is not None and document.filename else b""
    filename = document.filename if document is not None else None

    def work(session):
        user = _authority(session, authorization)
        stored = read_notice_file(payload, filename) if payload else None
        return {
            "notice": issue_notice(
                session,
                user,
                {
                    "title": title,
                    "body": body,
                    "kind": kind,
                    "department": department,
                    "area": area,
                    "effective_until": effective_until,
                },
                stored,
            )
        }

    return _run(work)


@router.get("/notices/{notice_id}/file")
def notice_file(notice_id: uuid.UUID):
    session = _session()
    try:
        payload, media_type, filename = notice_document(session, notice_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    finally:
        session.close()
    return Response(
        content=payload,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"', "Cache-Control": "public, max-age=300"},
    )


@router.post("/authority/notices/{notice_id}/withdraw")
def close_notice(notice_id: uuid.UUID, authorization: str | None = Header(None)):
    def work(session):
        user = _authority(session, authorization)
        return {"notice": withdraw_notice(session, user, notice_id)}

    return _run(work)


@router.get("/departments")
def departments():
    return {"departments": catalog()}


@router.get("/public/stats")
def public_stats():
    def work(session):
        from sqlalchemy import text

        complaint_count = session.execute(text("SELECT COUNT(*) FROM complaints")).scalar() or 0
        incident_count = session.execute(text("SELECT COUNT(*) FROM incidents")).scalar() or 0
        resolved_count = session.execute(text("SELECT COUNT(*) FROM incidents WHERE status = 'resolved'")).scalar() or 0
        archive = load_archive()
        return {
            "live_complaints": int(complaint_count),
            "live_incidents": int(incident_count),
            "live_resolved": int(resolved_count),
            "archive_complaints": len(archive) if archive_path() else None,
            "archive_label": "BMC historical complaints, 2019–2025" if archive_path() else None,
        }

    return _run(work)


@router.post("/auth/register")
def register(body: RegisterBody):
    def work(session):
        email = _email(body.email)
        existing = session.scalar(select(User).where(User.email == email))
        if existing is not None:
            raise HTTPException(status_code=409, detail="An account with that email already exists.")
        user = User(
            name=body.name.strip(),
            email=email,
            password_hash=hash_password(body.password),
            role="citizen",
            department=None,
        )
        session.add(user)
        session.flush()
        token = open_session(session, user)
        return {"token": token, "user": public_user(user)}

    return _run(work)


@router.post("/auth/login")
def login(body: Credentials):
    def work(session):
        email = _email(body.email)
        user = session.scalar(select(User).where(User.email == email))
        if user is None or not verify_password(body.password, user.password_hash):
            raise AuthError("Email or password is incorrect.")
        token = open_session(session, user)
        return {"token": token, "user": public_user(user)}

    return _run(work)


@router.post("/auth/logout")
def logout(authorization: str | None = Header(None)):
    def work(session):
        from app.services.auth import read_bearer

        raw = read_bearer(authorization)
        if raw:
            close_session(session, raw)
        return {"ok": True}

    return _run(work)


@router.get("/auth/me")
def me(authorization: str | None = Header(None)):
    def work(session):
        user = resolve_user(session, authorization, required=True)
        return {"user": public_user(user)}

    return _run(work)


@router.get("/me/complaints")
def complaints_mine(authorization: str | None = Header(None)):
    def work(session):
        user = resolve_user(session, authorization, required=True)
        return {"complaints": my_complaints(session, user.id)}

    return _run(work)


@router.get("/me/notifications")
def notifications(authorization: str | None = Header(None)):
    def work(session):
        user = resolve_user(session, authorization, required=True)
        items = list_notifications(session, user.id)
        return {"notifications": items, "unread": sum(1 for item in items if item["unread"])}

    return _run(work)


@router.post("/me/notifications/{notification_id}/read")
def read_notification(notification_id: uuid.UUID, authorization: str | None = Header(None)):
    def work(session):
        user = resolve_user(session, authorization, required=True)
        if not mark_notification(session, user.id, notification_id):
            raise LookupError("Notification not found.")
        return {"ok": True}

    return _run(work)


@router.post("/me/notifications/read-all")
def read_notifications(authorization: str | None = Header(None)):
    def work(session):
        user = resolve_user(session, authorization, required=True)
        mark_all_notifications(session, user.id)
        return {"ok": True}

    return _run(work)


@router.get("/track/{code}")
def track(code: str):
    def work(session):
        return public_tracking(session, code)

    return _run(work)


@router.post("/track/{code}/feedback")
def track_feedback(code: str, body: FeedbackBody, authorization: str | None = Header(None)):
    def work(session):
        user = resolve_user(session, authorization, required=False)
        complaint, incident = find_tracking(session, code)
        if incident is None:
            raise LookupError("No complaint or incident uses that tracking code.")
        add_feedback(session, incident, complaint, user, body.rating, body.comment, body.confirmed)
        return public_tracking(session, code)

    return _run(work)


@router.post("/assistant/citizen")
def ask_citizen(body: AskBody):
    def work(session):
        return citizen_reply(session, body.question.strip(), body.tracking_code)

    return _run(work)


@router.post("/assistant/authority")
def ask_authority(body: AskBody, authorization: str | None = Header(None)):
    def work(session):
        user = _authority(session, authorization)
        department = _scope(user, body.department)
        return authority_reply(session, user, body.question.strip(), department, body.incident_id)

    return _run(work)


@router.get("/authority/overview")
def authority_overview(department: str | None = None, authorization: str | None = Header(None)):
    def work(session):
        user = _authority(session, authorization)
        return overview(session, _scope(user, department))

    return _run(work)


@router.get("/authority/incidents")
def authority_incidents(
    department: str | None = None,
    status: str | None = None,
    severity: str | None = None,
    q: str | None = None,
    priority_min: float | None = Query(default=None, ge=0, le=10),
    sort: str = "priority",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    authorization: str | None = Header(None),
):
    def work(session):
        user = _authority(session, authorization)
        if sort not in {"priority", "latest", "oldest", "reports", "severity"}:
            raise ValueError("Unknown sort.")
        if status and status not in {"open", "in_progress", "resolved"}:
            raise ValueError("Unknown status.")
        if severity and severity not in {"low", "medium", "high", "critical"}:
            raise ValueError("Unknown severity.")
        issues = load_issues(session, _scope(user, department))
        return filter_issues(
            issues,
            status=status,
            severity=severity,
            query=(q or "").strip() or None,
            priority_min=priority_min,
            sort=sort,
            page=page,
            page_size=page_size,
        )

    return _run(work)


@router.get("/authority/incidents/{incident_id}")
def authority_incident(incident_id: uuid.UUID, authorization: str | None = Header(None)):
    def work(session):
        user = _authority(session, authorization)
        incident = require_incident(session, incident_id, user)
        return incident_detail(session, incident.id)

    return _run(work)


@router.patch("/authority/incidents/{incident_id}")
def patch_incident(incident_id: uuid.UUID, body: IncidentPatch, authorization: str | None = Header(None)):
    def work(session):
        user = _authority(session, authorization)
        incident = require_incident(session, incident_id, user)
        payload = body.model_dump(exclude_unset=True)
        if "department" in payload and not body.reassign:
            payload.pop("department")
        update_incident(session, incident, user, payload)
        return incident_detail(session, incident.id)

    return _run(work)


@router.post("/authority/incidents/bulk")
def bulk_incidents(body: BulkPatch, authorization: str | None = Header(None)):
    def work(session):
        user = _authority(session, authorization)
        updated = []
        for incident_id in body.ids:
            incident = require_incident(session, incident_id, user)
            update_incident(
                session,
                incident,
                user,
                {"status": body.status, "note": body.note, "resolution": body.resolution},
            )
            updated.append(str(incident_id))
        return {"updated": updated}

    return _run(work)


@router.post("/authority/incidents/{incident_id}/evidence")
def incident_evidence(
    incident_id: uuid.UUID,
    image: UploadFile = File(...),
    note: str | None = Form(None),
    authorization: str | None = Header(None),
):
    def work(session):
        user = _authority(session, authorization)
        incident = require_incident(session, incident_id, user)
        payload, media_type = _read_image(image)
        if payload is None or media_type is None:
            raise ValueError("Attach a JPG, PNG, or WebP photo.")
        image_id = store_resolution_image(session, incident, user, payload, media_type, note)
        return {"id": str(image_id), "image_path": f"/api/resolutions/{image_id}/image"}

    return _run(work)


@router.post("/authority/incidents/{incident_id}/summarize")
def summarize_incident(incident_id: uuid.UUID, authorization: str | None = Header(None)):
    def work(session):
        user = _authority(session, authorization)
        incident = require_incident(session, incident_id, user)
        summary = write_ai_summary(session, incident)
        from app.services.workspace import add_event

        add_event(session, incident.id, "summary", "Stored an AI summary written from the citizen report text.", user.id)
        return {"ai_summary": summary, "model": "groq"}

    return _run(work)


@router.get("/authority/activity")
def authority_activity(department: str | None = None, authorization: str | None = Header(None)):
    def work(session):
        user = _authority(session, authorization)
        return {"events": activity(session, _scope(user, department))}

    return _run(work)


@router.get("/authority/analytics")
def authority_analytics(department: str | None = None, authorization: str | None = Header(None)):
    def work(session):
        user = _authority(session, authorization)
        return live_analytics(session, _scope(user, department))

    return _run(work)


@router.get("/authority/hotspots")
def authority_hotspots(department: str | None = None, authorization: str | None = Header(None)):
    def work(session):
        user = _authority(session, authorization)
        scope = _scope(user, department)
        issues = load_issues(session, scope)
        points = [
            {
                "latitude": item["latitude"],
                "longitude": item["longitude"],
                "last_reported_at": item["last_reported_at"],
                "report_count": item["report_count"],
                "status": item["status"],
                "issue_category": item["issue_category"],
                "area": item["area"],
                "priority": item["priority"]["score"],
            }
            for item in issues
        ]
        from app.services.hotspots import area_health

        archive = archive_snapshot(None if scope in {None, "unassigned"} else scope)
        return {"live": detect_hotspots(points), "area_health": area_health(points), "archive": archive}

    return _run(work)


@router.get("/authority/alerts")
def authority_alerts(department: str | None = None, authorization: str | None = Header(None)):
    def work(session):
        user = _authority(session, authorization)
        issues = load_issues(session, _scope(user, department))
        points = [
            {
                "latitude": item["latitude"],
                "longitude": item["longitude"],
                "last_reported_at": item["last_reported_at"],
                "report_count": item["report_count"],
                "status": item["status"],
                "issue_category": item["issue_category"],
                "area": item["area"],
            }
            for item in issues
        ]
        hotspots = detect_hotspots(points)
        return {"alerts": build_alerts(issues, hotspots)}

    return _run(work)


@router.get("/authority/evaluation")
def authority_evaluation(department: str | None = None, authorization: str | None = Header(None)):
    def work(session):
        user = _authority(session, authorization)
        scope = _scope(user, department)
        archive = archive_snapshot(None if scope in {None, "unassigned"} else scope)
        return {
            "routing": routing_agreement(),
            "forecast": archive.get("forecast") if archive.get("available") else {"available": False, "reason": archive.get("reason")},
            "duplicate_detection": {
                "labeled_pairs": 0,
                "accuracy": None,
                "note": (
                    "This repository does not include a labeled set of duplicate and non-duplicate pairs, "
                    "so match accuracy is not reported. The decision rule is unit-tested: similarity, distance, "
                    "and time must all pass."
                ),
            },
            "priority": {
                "formula": "0.30*impact + 0.25*safety risk + 0.20*report volume + 0.15*location + 0.10*duration",
                "weights": WEIGHTS,
                "note": "Each component is scaled to 0–10 before weighting. Severity labels are stored separately.",
            },
            "archive_rows": archive.get("rows"),
            "department": department_name(scope) if scope and scope != "unassigned" else ("Unassigned" if scope == "unassigned" else "All departments"),
        }

    return _run(work)


@router.get("/authority/export.csv")
def export_csv(
    department: str | None = None,
    status: str | None = None,
    authorization: str | None = Header(None),
):
    def work(session):
        user = _authority(session, authorization)
        issues = load_issues(session, _scope(user, department))
        chosen = filter_issues(issues, status=status, severity=None, query=None, priority_min=None, sort="priority", page=1, page_size=5000)
        columns = list(export_rows(chosen["issues"])[:1][0].keys()) if chosen["issues"] else [
            "tracking_code",
            "department",
            "status",
            "category",
            "issue_type",
            "severity",
            "priority",
        ]
        payload = build_csv(export_rows(chosen["issues"]), columns)
        return Response(
            content=payload,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=civicmind-incidents.csv"},
        )

    return _run(work)


@router.get("/authority/export.pdf")
def export_pdf(
    department: str | None = None,
    status: str | None = None,
    authorization: str | None = Header(None),
):
    def work(session):
        user = _authority(session, authorization)
        scope = _scope(user, department)
        board = overview(session, scope)
        issues = load_issues(session, scope)
        chosen = filter_issues(issues, status=status, severity=None, query=None, priority_min=None, sort="priority", page=1, page_size=40)
        lines = [
            "CivicMind operational report",
            board["department_name"],
            f"Complaints {board['total_complaints']}",
            f"Incidents {board['total_incidents']}",
            f"Active {board['active_incidents']}",
            f"Critical {board['critical_issues']}",
            f"Resolved {board['resolved_issues']}",
            f"Resolution rate {board['resolution_rate'] if board['resolution_rate'] is not None else 'n/a'}",
            f"Average resolution hours {board['average_resolution_hours'] if board['average_resolution_hours'] is not None else 'n/a'}",
            "",
        ]
        if not chosen["issues"]:
            lines.append("No incidents in this view.")
        for item in chosen["issues"]:
            lines.append(
                f"{item['tracking_code'] or item['id'][:8]}  {item['department_name']}  {item['status']}  "
                f"priority {item['priority']['score']:.1f}  {item['severity']}  {item['report_count']} reports  {item['area'] or 'area unknown'}"
            )
            if item.get("summary"):
                lines.append(item["summary"][:180])
            lines.append("")
        return Response(
            content=build_pdf(lines),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=civicmind-report.pdf"},
        )

    return _run(work)


@router.get("/resolutions/{image_id}/image")
def resolution_photo(image_id: uuid.UUID):
    session = _session()
    try:
        found = resolution_image(session, image_id)
    finally:
        session.close()
    if found is None:
        raise HTTPException(status_code=404, detail="No resolution photo with that id.")
    payload, media_type = found
    return Response(content=payload, media_type=media_type, headers={"Cache-Control": "private, max-age=3600"})


@router.get("/admin/users")
def admin_users(authorization: str | None = Header(None)):
    def work(session):
        user = _authority(session, authorization)
        if user.role != "admin":
            raise AuthError("Only an administrator can manage accounts.", 403)
        rows = session.scalars(select(User).order_by(User.role, User.email)).all()
        return {"users": [public_user(item) for item in rows]}

    return _run(work)


@router.post("/admin/users")
def admin_create_user(body: AccountBody, authorization: str | None = Header(None)):
    def work(session):
        actor = _authority(session, authorization)
        if actor.role != "admin":
            raise AuthError("Only an administrator can create accounts.", 403)
        if body.role == "authority":
            if body.department not in DEPARTMENT_IDS:
                raise ValueError("Choose one of the ten departments for an authority account.")
        elif body.department:
            raise ValueError("Only authority accounts are tied to a department.")
        email = _email(body.email)
        existing = session.scalar(select(User).where(User.email == email))
        if existing is not None:
            raise HTTPException(status_code=409, detail="An account with that email already exists.")
        created = User(
            name=body.name.strip(),
            email=email,
            password_hash=hash_password(body.password),
            role=body.role,
            department=body.department if body.role == "authority" else None,
        )
        session.add(created)
        session.flush()
        return {"user": public_user(created)}

    return _run(work)


def _read_image(image: UploadFile | None) -> tuple[bytes | None, str | None]:
    if image is None or not image.filename:
        return None, None
    data = image.file.read()
    if not data:
        return None, None
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Photo must be under 3.5 MB.")
    if data.startswith(b"\xff\xd8\xff"):
        return data, "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return data, "image/png"
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return data, "image/webp"
    raise HTTPException(status_code=400, detail="Use a JPG, PNG, or WebP photo.")
