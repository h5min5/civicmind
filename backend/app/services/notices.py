"""Official notices and circulars. Citizens read the active board. Desks issue and withdraw."""

import re
import uuid
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Notice, User
from app.services.auth import AuthError
from app.services.departments import DEPARTMENT_IDS, department_name

IST = timezone(timedelta(hours=5, minutes=30))
KINDS = ("warning", "closure", "advisory", "circular")
MAX_NOTICE_BYTES = 8_000_000


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _visible(notice: Notice, now: datetime | None = None) -> bool:
    moment = now or datetime.now(timezone.utc)
    if notice.status != "active" or _aware(notice.effective_from) > moment:
        return False
    if notice.effective_until and _aware(notice.effective_until) < moment:
        return False
    return True


def _public(notice: Notice, issuer: str | None) -> dict:
    file_path = f"/api/notices/{notice.id}/file" if notice.file_name and _visible(notice) else None
    return {
        "id": str(notice.id),
        "reference_code": notice.reference_code,
        "title": notice.title,
        "body": notice.body,
        "kind": notice.kind,
        "department": notice.department,
        "department_name": "Citywide" if notice.department is None else department_name(notice.department),
        "area": notice.area,
        "status": notice.status,
        "effective_from": _aware(notice.effective_from).isoformat(),
        "effective_until": _aware(notice.effective_until).isoformat() if notice.effective_until else None,
        "issued_by": issuer or "Civic desk",
        "file_name": notice.file_name,
        "file_media_type": notice.file_media_type,
        "file_path": file_path,
        "created_at": _aware(notice.created_at).isoformat(),
        "withdrawn_at": _aware(notice.withdrawn_at).isoformat() if notice.withdrawn_at else None,
    }


def _rows(session: Session, statement):
    found = session.execute(statement).all()
    return [_public(notice, name) for notice, name in found]


def public_notices(session: Session) -> list[dict]:
    now = datetime.now(timezone.utc)
    statement = (
        select(Notice, User.name)
        .join(User, User.id == Notice.issued_by)
        .where(
            Notice.status == "active",
            Notice.effective_from <= now,
            or_(Notice.effective_until.is_(None), Notice.effective_until >= now),
        )
        .order_by(Notice.created_at.desc())
    )
    return _rows(session, statement)


def authority_notices(session: Session, department: str | None) -> list[dict]:
    statement = select(Notice, User.name).join(User, User.id == Notice.issued_by)
    if department == "unassigned":
        return []
    if department:
        statement = statement.where(or_(Notice.department == department, Notice.department.is_(None)))
    statement = statement.order_by(Notice.created_at.desc())
    return _rows(session, statement)


def read_notice_file(data: bytes, filename: str | None) -> tuple[bytes, str, str]:
    if not data:
        raise ValueError("The uploaded notice is empty.")
    if len(data) > MAX_NOTICE_BYTES:
        raise ValueError("The notice file must be under 8 MB.")
    if data.startswith(b"%PDF"):
        media = "application/pdf"
        fallback = "notice.pdf"
    elif data.startswith(b"\xff\xd8\xff"):
        media = "image/jpeg"
        fallback = "notice.jpg"
    elif data.startswith(b"\x89PNG\r\n\x1a\n"):
        media = "image/png"
        fallback = "notice.png"
    elif len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        media = "image/webp"
        fallback = "notice.webp"
    else:
        raise ValueError("Upload a PDF, JPG, PNG, or WebP notice.")
    raw_name = Path(filename or fallback).name
    cleaned = re.sub(r"[^A-Za-z0-9._ -]", "", raw_name).strip(" .")[:120] or fallback
    return data, media, cleaned


def notice_document(session: Session, notice_id: uuid.UUID) -> tuple[bytes, str, str]:
    notice = session.get(Notice, notice_id)
    if notice is None or not notice.file_bytes or not notice.file_name or not notice.file_media_type:
        raise LookupError("This notice has no document.")
    if not _visible(notice):
        raise LookupError("This notice is not on the public board.")
    return notice.file_bytes, notice.file_media_type, notice.file_name


def issue_notice(session: Session, user: User, payload: dict, document: tuple[bytes, str, str] | None = None) -> dict:
    if user.role == "authority":
        department = user.department
        if not department:
            raise AuthError("This account is not assigned to a department.", 403)
    else:
        raw = payload.get("department")
        if raw in (None, "", "citywide"):
            department = None
        elif raw == "unassigned":
            raise ValueError("Choose a department, or leave the notice citywide.")
        elif raw not in DEPARTMENT_IDS:
            raise ValueError("Unknown department.")
        else:
            department = raw
    title = str(payload.get("title") or "").strip()
    body = str(payload.get("body") or "").strip()
    kind = str(payload.get("kind") or "").strip()
    area = str(payload.get("area") or "").strip() or None
    if len(title) < 8:
        raise ValueError("Give the notice a title of at least a short phrase.")
    if document is None and len(body) < 20:
        raise ValueError("Write the notice, or upload the official PDF or photo.")
    if not body:
        body = "The official document is attached."
    if kind not in KINDS:
        raise ValueError("Kind must be a warning, closure, advisory, or circular.")
    if area and len(area) > 120:
        raise ValueError("Area name is too long.")
    until = _until(payload.get("effective_until"))
    notice = Notice(
        reference_code=f"NT-{uuid.uuid4().hex[:8].upper()}",
        title=title[:160],
        body=body[:4000],
        kind=kind,
        department=department,
        area=area,
        status="active",
        effective_from=datetime.now(timezone.utc),
        effective_until=until,
        issued_by=user.id,
        file_bytes=document[0] if document else None,
        file_media_type=document[1] if document else None,
        file_name=document[2] if document else None,
    )
    session.add(notice)
    session.flush()
    return _public(notice, user.name)


def withdraw_notice(session: Session, user: User, notice_id: uuid.UUID) -> dict:
    notice = session.get(Notice, notice_id)
    if notice is None:
        raise LookupError("Notice not found.")
    if user.role != "admin" and notice.department != user.department:
        raise AuthError("This account can only withdraw notices from its own desk.", 403)
    if notice.department is None and user.role != "admin":
        raise AuthError("Only an administrator can withdraw a citywide notice.", 403)
    if notice.status == "withdrawn":
        return _public(notice, session.get(User, notice.issued_by).name if session.get(User, notice.issued_by) else None)
    notice.status = "withdrawn"
    notice.withdrawn_at = datetime.now(timezone.utc)
    session.flush()
    issuer = session.get(User, notice.issued_by)
    return _public(notice, issuer.name if issuer else None)


def _until(value) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        day = value.date()
    else:
        try:
            day = date.fromisoformat(str(value)[:10])
        except ValueError as exc:
            raise ValueError("Effective until must be a date.") from exc
    today = datetime.now(IST).date()
    if day < today:
        raise ValueError("The notice cannot expire before today.")
    return datetime.combine(day, time(23, 59, 59), tzinfo=IST)
