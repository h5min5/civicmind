"""Authority workspace, lifecycle, and the queries behind it."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session, undefer

from app.config import get_settings
from app.models import Complaint, Feedback, Incident, IncidentEvent, Notification, ResolutionImage, User
from app.services.auth import AuthError, can_manage
from app.services.bootstrap import complaint_code, incident_code
from app.services.departments import DEPARTMENT_IDS, department_name, infer_department
from app.services.embeddings import to_pgvector
from app.services.forecast import archive_snapshot
from app.services.hotspots import area_health, detect_hotspots
from app.services.priority import priority_for_incident
from app.services.summary import extractive_summary, recommended_steps

STATUSES = ("open", "in_progress", "resolved")
ALLOWED = {
    "open": {"in_progress", "resolved"},
    "in_progress": {"open", "resolved"},
    "resolved": {"open"},
}
SEVERITY_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}

INCIDENT_SQL = """
i.id, i.issue_category, i.issue_type, i.severity, i.latitude, i.longitude, i.area,
i.department, i.status, i.resolved_at, i.first_reported_at, i.last_reported_at, i.report_count,
i.routing_reason, i.summary, i.ai_summary, i.tracking_code, i.resolution_note, i.reopen_count
"""


def allowed_transition(current: str, new: str) -> bool:
    return new in ALLOWED.get(current, set())


def add_event(session: Session, incident_id: uuid.UUID, kind: str, message: str, actor_id: uuid.UUID | None = None) -> None:
    session.add(
        IncidentEvent(
            id=uuid.uuid4(),
            incident_id=incident_id,
            actor_id=actor_id,
            kind=kind,
            message=message,
            created_at=datetime.now(timezone.utc),
        )
    )


def notify(session: Session, user_ids: list[uuid.UUID], title: str, body: str, incident_id: uuid.UUID | None) -> None:
    seen: set[uuid.UUID] = set()
    now = datetime.now(timezone.utc)
    for user_id in user_ids:
        if user_id in seen:
            continue
        seen.add(user_id)
        session.add(
            Notification(
                id=uuid.uuid4(),
                user_id=user_id,
                incident_id=incident_id,
                title=title[:160],
                body=body[:2000],
                created_at=now,
            )
        )


def recipient_ids(session: Session, department: str | None) -> list[uuid.UUID]:
    if department:
        rows = session.execute(
            text(
                """
                SELECT id FROM users
                WHERE role = 'admin' OR (role = 'authority' AND department = :department)
                """
            ),
            {"department": department},
        ).scalars()
    else:
        rows = session.execute(text("SELECT id FROM users WHERE role = 'admin'")).scalars()
    return list(rows)


def citizen_ids(session: Session, incident_id: uuid.UUID) -> list[uuid.UUID]:
    rows = session.execute(
        text("SELECT DISTINCT citizen_id FROM complaints WHERE incident_id = :id AND citizen_id IS NOT NULL"),
        {"id": incident_id},
    ).scalars()
    return list(rows)


def _department_sql(department: str | None) -> tuple[str, dict]:
    if department == "unassigned":
        return "i.department IS NULL", {}
    if department:
        if department not in DEPARTMENT_IDS:
            raise ValueError("Unknown department.")
        return "i.department = :department", {"department": department}
    return "TRUE", {}


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return _aware(value).isoformat()
    return str(value)


def issue_from_row(row, now: datetime | None = None) -> dict:
    started = _aware(row["first_reported_at"])
    resolved = _aware(row["resolved_at"])
    priority = priority_for_incident(
        category=row["issue_category"],
        severity=row["severity"],
        report_count=int(row["report_count"]),
        latitude=float(row["latitude"]),
        longitude=float(row["longitude"]),
        area=row["area"],
        started_at=started,
        status=row["status"] or "open",
        resolved_at=resolved,
        now=now,
    )
    return {
        "id": str(row["id"]),
        "tracking_code": row["tracking_code"],
        "issue_category": row["issue_category"],
        "issue_type": row["issue_type"],
        "severity": row["severity"],
        "latitude": float(row["latitude"]),
        "longitude": float(row["longitude"]),
        "area": row["area"],
        "department": row["department"],
        "department_name": department_name(row["department"]),
        "status": row["status"] or "open",
        "first_reported_at": started.isoformat(),
        "last_reported_at": _iso(row["last_reported_at"]),
        "resolved_at": resolved.isoformat() if resolved else None,
        "report_count": int(row["report_count"]),
        "routing_reason": row["routing_reason"],
        "summary": row["summary"],
        "ai_summary": row["ai_summary"],
        "resolution_note": row["resolution_note"],
        "reopen_count": int(row["reopen_count"] or 0),
        "priority": priority,
    }


def load_issues(session: Session, department: str | None, now: datetime | None = None) -> list[dict]:
    clause, params = _department_sql(department)
    rows = session.execute(text(f"SELECT {INCIDENT_SQL} FROM incidents i WHERE {clause}"), params).mappings().all()
    return [issue_from_row(row, now) for row in rows]


def apply_priority(incident: Incident, now: datetime | None = None) -> dict:
    priority = priority_for_incident(
        category=incident.issue_category,
        severity=incident.severity,
        report_count=incident.report_count,
        latitude=incident.latitude,
        longitude=incident.longitude,
        area=incident.area,
        started_at=_aware(incident.first_reported_at),
        status=incident.status or "open",
        resolved_at=_aware(incident.resolved_at),
        now=now,
    )
    incident.priority_score = priority["score"]
    return priority


def refresh_summary(session: Session, incident: Incident) -> str:
    rows = session.execute(
        text("SELECT description FROM complaints WHERE incident_id = :id ORDER BY timestamp"),
        {"id": incident.id},
    ).scalars().all()
    incident.summary = extractive_summary(list(rows), incident.issue_type, incident.issue_category, incident.area)
    return incident.summary


def finalize_submission(session: Session, incident: Incident, complaint: Complaint, explanation: str, created: bool) -> dict:
    if created or not incident.department:
        department, reason = infer_department(incident.issue_category, incident.issue_type, complaint.original_text)
        if created or incident.department is None:
            incident.department = department
            incident.routing_reason = reason
    if not incident.tracking_code:
        incident.tracking_code = incident_code(incident.id)
    if not incident.status:
        incident.status = "open"
    if not complaint.tracking_code:
        complaint.tracking_code = complaint_code(complaint.id)
    summary = refresh_summary(session, incident)
    priority = apply_priority(incident)
    if created:
        message = f"Incident {incident.tracking_code} opened from {complaint.tracking_code}. {incident.routing_reason} {explanation}"
        kind = "opened"
    else:
        message = f"{complaint.tracking_code} joined {incident.tracking_code}. {explanation}"
        kind = "aggregated"
    add_event(session, incident.id, kind, message, complaint.citizen_id)
    notify(
        session,
        recipient_ids(session, incident.department),
        complaint.tracking_code or "New report",
        summary,
        incident.id,
    )
    if complaint.citizen_id:
        notify(
            session,
            [complaint.citizen_id],
            "Complaint filed",
            f"{complaint.tracking_code} is on incident {incident.tracking_code}. {incident.routing_reason}",
            incident.id,
        )
    return priority


def _sort_key(item: dict, sort: str):
    if sort == "oldest":
        return item["first_reported_at"]
    if sort == "reports":
        return item["report_count"]
    if sort == "severity":
        return SEVERITY_RANK.get(item["severity"], 0)
    if sort == "latest":
        return item["last_reported_at"] or ""
    return item["priority"]["score"]


def filter_issues(
    issues: list[dict],
    *,
    status: str | None,
    severity: str | None,
    query: str | None,
    priority_min: float | None,
    sort: str,
    page: int,
    page_size: int,
) -> dict:
    found = issues
    if status:
        found = [item for item in found if item["status"] == status]
    if severity:
        found = [item for item in found if item["severity"] == severity]
    if query:
        needle = query.lower()
        found = [
            item
            for item in found
            if needle in " ".join(
                str(item.get(key) or "")
                for key in ("tracking_code", "issue_type", "issue_category", "area", "summary", "department")
            ).lower()
        ]
    if priority_min is not None:
        found = [item for item in found if item["priority"]["score"] >= priority_min]
    reverse = sort != "oldest"
    found = sorted(found, key=lambda item: _sort_key(item, sort), reverse=reverse)
    total = len(found)
    start = max(page - 1, 0) * page_size
    return {"total": total, "page": page, "page_size": page_size, "issues": found[start : start + page_size]}


def overview(session: Session, department: str | None) -> dict:
    issues = load_issues(session, department)
    complaints = sum(item["report_count"] for item in issues)
    active = [item for item in issues if item["status"] in {"open", "in_progress"}]
    critical = [item for item in active if item["severity"] == "critical" or item["priority"]["urgent"]]
    resolved = [item for item in issues if item["status"] == "resolved"]
    hours = []
    for item in resolved:
        if not item["resolved_at"]:
            continue
        start = datetime.fromisoformat(item["first_reported_at"])
        end = datetime.fromisoformat(item["resolved_at"])
        hours.append(max((end - start).total_seconds() / 3600, 0))
    buckets: dict[str, dict] = {}
    for item in issues:
        key = item["department"] or "unassigned"
        bucket = buckets.setdefault(
            key,
            {"department": key, "name": department_name(item["department"]), "incidents": 0, "open": 0, "in_progress": 0, "resolved": 0, "complaints": 0},
        )
        bucket["incidents"] += 1
        bucket[item["status"]] = bucket.get(item["status"], 0) + 1
        bucket["complaints"] += item["report_count"]
    return {
        "department": department,
        "department_name": "All departments" if not department else department_name(department if department != "unassigned" else None),
        "total_complaints": complaints,
        "total_incidents": len(issues),
        "active_incidents": len(active),
        "critical_issues": len([item for item in issues if item["severity"] == "critical" and item["status"] != "resolved"]),
        "urgent_issues": len([item for item in issues if item["priority"]["urgent"] and item["status"] != "resolved"]),
        "resolved_issues": len(resolved),
        "resolution_rate": round(len(resolved) / len(issues), 4) if issues else None,
        "average_resolution_hours": round(sum(hours) / len(hours), 2) if hours else None,
        "workload": list(buckets.values()),
        "open_complaints": sum(item["report_count"] for item in issues if item["status"] == "open"),
        "in_progress_complaints": sum(item["report_count"] for item in issues if item["status"] == "in_progress"),
        "resolved_complaints": sum(item["report_count"] for item in issues if item["status"] == "resolved"),
    }


def require_incident(session: Session, incident_id: uuid.UUID, user: User) -> Incident:
    incident = session.get(Incident, incident_id)
    if incident is None:
        raise LookupError("Incident not found.")
    if not can_manage(user.role, user.department, incident.department):
        raise AuthError("You cannot manage this incident.", 403)
    return incident


def _reports(session: Session, incident_id: uuid.UUID) -> list[dict]:
    rows = session.execute(
        text(
            """
            SELECT id, tracking_code, original_text, description, visual_evidence, severity, issue_category,
                   issue_type, issue_subtype, confidence, latitude, longitude, area, timestamp, image_path, language
            FROM complaints
            WHERE incident_id = :id
            ORDER BY timestamp
            """
        ),
        {"id": incident_id},
    ).mappings().all()
    return [_plain(row) for row in rows]


def _events(session: Session, incident_id: uuid.UUID) -> list[dict]:
    rows = session.execute(
        text(
            """
            SELECT e.id, e.kind, e.message, e.created_at, u.name AS actor
            FROM incident_events e
            LEFT JOIN users u ON u.id = e.actor_id
            WHERE e.incident_id = :id
            ORDER BY e.created_at
            """
        ),
        {"id": incident_id},
    ).mappings().all()
    return [_plain(row) for row in rows]


def _resolution_images(session: Session, incident_id: uuid.UUID) -> list[dict]:
    rows = session.execute(
        text(
            """
            SELECT id, note, image_media_type, created_at
            FROM resolution_images
            WHERE incident_id = :id
            ORDER BY created_at
            """
        ),
        {"id": incident_id},
    ).mappings().all()
    items = []
    for row in rows:
        item = _plain(row)
        item["image_path"] = f"/api/resolutions/{item['id']}/image"
        items.append(item)
    return items


def _feedback(session: Session, incident_id: uuid.UUID) -> list[dict]:
    rows = session.execute(
        text(
            """
            SELECT id, rating, comment, confirmed, created_at
            FROM feedback
            WHERE incident_id = :id
            ORDER BY created_at
            """
        ),
        {"id": incident_id},
    ).mappings().all()
    return [_plain(row) for row in rows]


def _plain(row) -> dict:
    item = {}
    for key, value in dict(row).items():
        if isinstance(value, uuid.UUID):
            item[key] = str(value)
        elif isinstance(value, datetime):
            item[key] = _aware(value).isoformat()
        elif isinstance(value, float):
            item[key] = float(value)
        else:
            item[key] = value
    return item


def incident_detail(session: Session, incident_id: uuid.UUID) -> dict:
    clause, params = "i.id = :id", {"id": incident_id}
    row = session.execute(text(f"SELECT {INCIDENT_SQL} FROM incidents i WHERE {clause}"), params).mappings().first()
    if row is None:
        raise LookupError("Incident not found.")
    issue = issue_from_row(row)
    issue["reports"] = _reports(session, incident_id)
    issue["events"] = _events(session, incident_id)
    issue["resolution_images"] = _resolution_images(session, incident_id)
    issue["feedback"] = _feedback(session, incident_id)
    issue["recommended_steps"] = recommended_steps(issue)
    issue["similar"] = similar_incidents(session, incident_id)
    return issue


def update_incident(session: Session, incident: Incident, user: User, payload: dict) -> None:
    note = (payload.get("note") or "").strip()
    if "department" in payload and payload["department"] != incident.department:
        if user.role != "admin":
            raise AuthError("Only an administrator can reassign a department.", 403)
        department = payload["department"] or None
        if department is not None and department not in DEPARTMENT_IDS:
            raise ValueError("Unknown department.")
        previous = department_name(incident.department)
        incident.department = department
        incident.routing_reason = note or f"Reassigned by {user.name}."
        add_event(
            session,
            incident.id,
            "reassigned",
            f"Moved from {previous} to {department_name(department)}. {incident.routing_reason}",
            user.id,
        )
        notify(session, recipient_ids(session, department), "Incident reassigned", incident.routing_reason, incident.id)
    status = payload.get("status")
    if status:
        if status not in STATUSES:
            raise ValueError("Status must be open, in progress, or resolved.")
        if not allowed_transition(incident.status, status):
            raise ValueError(f"Cannot move this incident from {incident.status.replace('_', ' ')} to {status.replace('_', ' ')}.")
        if status == "resolved":
            resolution = (payload.get("resolution") or note).strip()
            if len(resolution) < 8:
                raise ValueError("Describe the resolution in at least a short sentence.")
            incident.resolution_note = resolution
            incident.resolved_at = datetime.now(timezone.utc)
            message = f"Marked resolved. {resolution}"
        elif incident.status == "resolved" and status == "open":
            incident.reopen_count = (incident.reopen_count or 0) + 1
            incident.resolved_at = None
            message = note or "Reopened."
        else:
            message = note or f"Status set to {status.replace('_', ' ')}."
        incident.status = status
        add_event(session, incident.id, "status", message, user.id)
        notify(session, citizen_ids(session, incident.id), "Complaint update", message, incident.id)
    elif note:
        add_event(session, incident.id, "note", note, user.id)
    apply_priority(incident)


def find_tracking(session: Session, code: str) -> tuple[Complaint | None, Incident | None]:
    cleaned = code.strip().upper()
    complaint_id = session.execute(
        text("SELECT id FROM complaints WHERE upper(tracking_code) = :code"),
        {"code": cleaned},
    ).scalar()
    if complaint_id is not None:
        found = session.get(Complaint, complaint_id)
        incident = session.get(Incident, found.incident_id) if found else None
        return found, incident
    incident_id = session.execute(
        text("SELECT id FROM incidents WHERE upper(tracking_code) = :code"),
        {"code": cleaned},
    ).scalar()
    if incident_id is None:
        return None, None
    incident = session.get(Incident, incident_id)
    complaint_id = session.execute(
        text("SELECT id FROM complaints WHERE incident_id = :id ORDER BY timestamp DESC LIMIT 1"),
        {"id": incident_id},
    ).scalar()
    found = session.get(Complaint, complaint_id) if complaint_id else None
    return found, incident


def public_tracking(session: Session, code: str) -> dict:
    complaint, incident = find_tracking(session, code)
    if incident is None:
        raise LookupError("No complaint or incident uses that tracking code.")
    detail = incident_detail(session, incident.id)
    detail["matched_complaint"] = None
    if complaint is not None:
        detail["matched_complaint"] = {
            "id": str(complaint.id),
            "tracking_code": complaint.tracking_code,
            "original_text": complaint.original_text,
            "timestamp": _iso(complaint.timestamp),
            "image_path": complaint.image_path,
        }
    return detail


def add_feedback(session: Session, incident: Incident, complaint: Complaint | None, user: User | None, rating: int | None, comment: str | None, confirmed: bool) -> None:
    if incident.status != "resolved":
        raise ValueError("Feedback opens after the incident is marked resolved.")
    text_comment = (comment or "").strip()
    if not confirmed and len(text_comment) < 8:
        raise ValueError("Explain what is still unresolved in at least a short sentence.")
    if rating is not None and not 1 <= rating <= 5:
        raise ValueError("Rating must be from 1 to 5.")
    session.add(
        Feedback(
            id=uuid.uuid4(),
            incident_id=incident.id,
            complaint_id=complaint.id if complaint else None,
            citizen_id=user.id if user and user.role == "citizen" else None,
            rating=rating,
            comment=text_comment or None,
            confirmed=confirmed,
            created_at=datetime.now(timezone.utc),
        )
    )
    if confirmed:
        message = text_comment or "Citizen confirmed the resolution."
        add_event(session, incident.id, "feedback", message, user.id if user else None)
        notify(session, recipient_ids(session, incident.department), "Resolution confirmed", message, incident.id)
        return
    incident.status = "open"
    incident.resolved_at = None
    incident.reopen_count = (incident.reopen_count or 0) + 1
    apply_priority(incident)
    add_event(session, incident.id, "reopened", f"Citizen asked to reopen this incident. {text_comment}", user.id if user else None)
    notify(session, recipient_ids(session, incident.department), "Reopen requested", text_comment, incident.id)


def similar_incidents(session: Session, incident_id: uuid.UUID, limit: int = 5) -> list[dict]:
    settings = get_settings()
    row = session.execute(
        text(
            """
            SELECT embedding::text AS embedding, timestamp
            FROM complaints
            WHERE incident_id = :id AND embedding IS NOT NULL
            ORDER BY timestamp DESC
            LIMIT 1
            """
        ),
        {"id": incident_id},
    ).mappings().first()
    if row is None or not row["embedding"]:
        return []
    embedding = row["embedding"]
    if isinstance(embedding, list):
        embedding = to_pgvector(embedding)
    neighbors = session.execute(
        text(
            """
            SELECT
              c.id,
              c.incident_id,
              c.timestamp,
              i.tracking_code,
              i.issue_type,
              i.issue_category,
              i.area,
              i.status,
              i.latitude,
              i.longitude,
              (1 - (c.embedding <=> CAST(:embedding AS vector))) AS semantic_similarity,
              ST_Distance(
                ST_SetSRID(ST_MakePoint(c.longitude, c.latitude), 4326)::geography,
                ST_SetSRID(ST_MakePoint(i2.longitude, i2.latitude), 4326)::geography
              ) AS distance_m,
              (ABS(EXTRACT(EPOCH FROM (c.timestamp - :timestamp))) / 3600.0) AS time_difference_hours
            FROM complaints c
            JOIN incidents i ON i.id = c.incident_id
            JOIN incidents i2 ON i2.id = :incident_id
            WHERE c.incident_id <> :incident_id
              AND c.embedding IS NOT NULL
            ORDER BY c.embedding <=> CAST(:embedding AS vector)
            LIMIT :limit
            """
        ),
        {"embedding": embedding, "incident_id": incident_id, "timestamp": row["timestamp"], "limit": limit},
    ).mappings().all()
    results = []
    seen: set[str] = set()
    for neighbor in neighbors:
        incident_key = str(neighbor["incident_id"])
        if incident_key in seen or neighbor["semantic_similarity"] is None:
            continue
        seen.add(incident_key)
        similarity = max(0.0, min(1.0, float(neighbor["semantic_similarity"])))
        distance = float(neighbor["distance_m"] or 0)
        gap = abs(float(neighbor["time_difference_hours"] or 0))
        passed_similarity = similarity >= settings.similarity_threshold
        passed_distance = distance <= settings.geo_radius_meters
        passed_time = gap <= settings.time_window_hours
        failed = []
        if not passed_similarity:
            failed.append(f"similarity {similarity:.2f} is below {settings.similarity_threshold:.2f}")
        if not passed_distance:
            failed.append(f"distance {distance:.0f} m is outside {settings.geo_radius_meters:.0f} m")
        if not passed_time:
            failed.append(f"time gap {gap:.1f} h is outside {settings.time_window_hours:.0f} h")
        explanation = (
            "These reports meet the duplicate rule but were stored as separate incidents."
            if not failed
            else "Not merged because " + "; ".join(failed) + "."
        )
        results.append(
            {
                "incident_id": incident_key,
                "tracking_code": neighbor["tracking_code"],
                "issue_type": neighbor["issue_type"],
                "issue_category": neighbor["issue_category"],
                "area": neighbor["area"],
                "status": neighbor["status"],
                "latitude": float(neighbor["latitude"]),
                "longitude": float(neighbor["longitude"]),
                "semantic_similarity": round(similarity, 3),
                "geographic_distance_m": round(distance, 1),
                "time_difference_hours": round(gap, 2),
                "passed_similarity": passed_similarity,
                "passed_distance": passed_distance,
                "passed_time": passed_time,
                "explanation": explanation,
            }
        )
    return results


def live_analytics(session: Session, department: str | None) -> dict:
    issues = load_issues(session, department)
    by_month: dict[str, int] = {}
    by_category: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    by_status: dict[str, int] = {}
    by_priority = {"0-2": 0, "2-4": 0, "4-6": 0, "6-8": 0, "8-10": 0}
    monsoon = 0
    for item in issues:
        started = datetime.fromisoformat(item["first_reported_at"])
        label = started.strftime("%Y-%m")
        by_month[label] = by_month.get(label, 0) + 1
        by_category[item["issue_category"]] = by_category.get(item["issue_category"], 0) + 1
        by_severity[item["severity"]] = by_severity.get(item["severity"], 0) + 1
        by_status[item["status"]] = by_status.get(item["status"], 0) + 1
        score = item["priority"]["score"]
        if score < 2:
            by_priority["0-2"] += 1
        elif score < 4:
            by_priority["2-4"] += 1
        elif score < 6:
            by_priority["4-6"] += 1
        elif score < 8:
            by_priority["6-8"] += 1
        else:
            by_priority["8-10"] += 1
        if started.month in {6, 7, 8, 9}:
            monsoon += 1
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
    return {
        "incidents": len(issues),
        "monthly": [{"label": key, "count": by_month[key]} for key in sorted(by_month)],
        "categories": [{"name": key, "count": value} for key, value in sorted(by_category.items(), key=lambda item: item[1], reverse=True)],
        "severities": [{"name": key, "count": value} for key, value in by_severity.items()],
        "statuses": [{"name": key, "count": value} for key, value in by_status.items()],
        "priority_bands": [{"name": key, "count": value} for key, value in by_priority.items()],
        "monsoon_incidents": monsoon,
        "other_season_incidents": len(issues) - monsoon,
        "hotspots": detect_hotspots(points),
        "area_health": area_health(points),
        "archive": archive_snapshot(None if department in {None, "unassigned"} else department),
    }


def build_alerts(issues: list[dict], hotspots: list[dict]) -> list[dict]:
    alerts = []
    for item in issues:
        if item["status"] == "resolved":
            continue
        if item["priority"]["urgent"] or item["severity"] == "critical":
            alerts.append(
                {
                    "kind": "high_risk",
                    "incident_id": item["id"],
                    "tracking_code": item["tracking_code"],
                    "title": f"{item['tracking_code'] or 'Incident'} is urgent",
                    "detail": f"Priority {item['priority']['score']:.1f}, severity {item['severity']}.",
                }
            )
        if item["priority"]["duration"] >= 8:
            alerts.append(
                {
                    "kind": "long_unresolved",
                    "incident_id": item["id"],
                    "tracking_code": item["tracking_code"],
                    "title": f"{item['tracking_code'] or 'Incident'} has been open a long time",
                    "detail": item["priority"]["factors"][-1]["detail"],
                }
            )
        if item["report_count"] >= 5:
            alerts.append(
                {
                    "kind": "report_volume",
                    "incident_id": item["id"],
                    "tracking_code": item["tracking_code"],
                    "title": f"{item['tracking_code'] or 'Incident'} has {item['report_count']} reports",
                    "detail": "Report volume crossed the alert threshold of 5 stored complaints.",
                }
            )
    for spot in hotspots:
        if not spot["emerging"]:
            continue
        alerts.append(
            {
                "kind": "emerging_hotspot",
                "incident_id": None,
                "tracking_code": None,
                "title": "Emerging hotspot",
                "detail": (
                    f"{spot['recent_incidents']} incidents in the last 14 days near "
                    f"{spot['area'] or 'an unnamed cell'} (previous 14 days: {spot['previous_incidents']})."
                ),
                "latitude": spot["latitude"],
                "longitude": spot["longitude"],
            }
        )
    return alerts[:40]


def activity(session: Session, department: str | None, limit: int = 40) -> list[dict]:
    clause, params = _department_sql(department)
    params["limit"] = limit
    rows = session.execute(
        text(
            f"""
            SELECT e.id, e.kind, e.message, e.created_at, e.incident_id, i.tracking_code, i.department, u.name AS actor
            FROM incident_events e
            JOIN incidents i ON i.id = e.incident_id
            LEFT JOIN users u ON u.id = e.actor_id
            WHERE {clause}
            ORDER BY e.created_at DESC
            LIMIT :limit
            """
        ),
        params,
    ).mappings().all()
    return [_plain(row) for row in rows]


def export_rows(issues: list[dict]) -> list[dict]:
    rows = []
    for item in issues:
        priority = item["priority"]
        rows.append(
            {
                "tracking_code": item["tracking_code"],
                "department": item["department_name"],
                "status": item["status"],
                "category": item["issue_category"],
                "issue_type": item["issue_type"],
                "severity": item["severity"],
                "priority": priority["score"],
                "impact": priority["impact"],
                "safety_risk": priority["risk"],
                "report_volume": priority["volume"],
                "location": priority["location"],
                "duration": priority["duration"],
                "reports": item["report_count"],
                "area": item["area"] or "",
                "latitude": item["latitude"],
                "longitude": item["longitude"],
                "first_reported_at": item["first_reported_at"],
                "last_reported_at": item["last_reported_at"],
                "resolved_at": item["resolved_at"] or "",
                "summary": item["summary"] or "",
            }
        )
    return rows


def my_complaints(session: Session, user_id: uuid.UUID) -> list[dict]:
    rows = session.execute(
        text(
            """
            SELECT c.id, c.tracking_code, c.original_text, c.description, c.issue_category, c.issue_type,
                   c.severity, c.area, c.timestamp, c.image_path, c.incident_id,
                   i.tracking_code AS incident_tracking_code, i.status, i.department, i.summary
            FROM complaints c
            JOIN incidents i ON i.id = c.incident_id
            WHERE c.citizen_id = :user_id
            ORDER BY c.timestamp DESC
            """
        ),
        {"user_id": user_id},
    ).mappings().all()
    return [_plain(row) for row in rows]


def list_notifications(session: Session, user_id: uuid.UUID) -> list[dict]:
    rows = session.execute(
        text(
            """
            SELECT id, title, body, incident_id, read_at, created_at
            FROM notifications
            WHERE user_id = :user_id
            ORDER BY created_at DESC
            LIMIT 50
            """
        ),
        {"user_id": user_id},
    ).mappings().all()
    items = [_plain(row) for row in rows]
    for item in items:
        item["unread"] = item["read_at"] is None
    return items


def mark_notification(session: Session, user_id: uuid.UUID, notification_id: uuid.UUID) -> bool:
    result = session.execute(
        text(
            """
            UPDATE notifications
            SET read_at = COALESCE(read_at, NOW())
            WHERE id = :id AND user_id = :user_id
            """
        ),
        {"id": notification_id, "user_id": user_id},
    )
    return result.rowcount > 0


def mark_all_notifications(session: Session, user_id: uuid.UUID) -> None:
    session.execute(
        text("UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE user_id = :user_id"),
        {"user_id": user_id},
    )


def store_resolution_image(session: Session, incident: Incident, user: User, image: bytes, media_type: str, note: str | None) -> uuid.UUID:
    image_id = uuid.uuid4()
    session.add(
        ResolutionImage(
            id=image_id,
            incident_id=incident.id,
            image_bytes=image,
            image_media_type=media_type,
            note=(note or "").strip() or None,
            uploaded_by=user.id,
            created_at=datetime.now(timezone.utc),
        )
    )
    add_event(session, incident.id, "evidence", note or "Resolution photo added.", user.id)
    return image_id


def resolution_image(session: Session, image_id: uuid.UUID) -> tuple[bytes, str] | None:
    image = session.get(ResolutionImage, image_id, options=(undefer(ResolutionImage.image_bytes),))
    if image is None:
        return None
    return bytes(image.image_bytes), image.image_media_type
