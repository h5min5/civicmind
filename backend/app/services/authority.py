import uuid
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.departments import DEPARTMENT_IDS
from app.services.priority import priority_for_incident

STATUSES = ("open", "in_progress", "resolved")


def authority_board(session: Session, department: str | None, status: str | None) -> dict:
    department_sql, params = _department_filter(department)
    counts = session.execute(
        text(
            f"""
            SELECT
              COUNT(c.id) AS total_complaints,
              COUNT(c.id) FILTER (WHERE i.status = 'open') AS open_complaints,
              COUNT(c.id) FILTER (WHERE i.status = 'in_progress') AS in_progress_complaints,
              COUNT(c.id) FILTER (WHERE i.status = 'resolved') AS resolved_complaints
            FROM incidents i
            LEFT JOIN complaints c ON c.incident_id = i.id
            WHERE {department_sql}
            """
        ),
        params,
    ).mappings().one()
    list_sql = department_sql
    list_params = dict(params)
    if status:
        list_sql = f"{list_sql} AND i.status = :status"
        list_params["status"] = status
    rows = session.execute(
        text(
            f"""
            SELECT
              i.id, i.issue_category, i.issue_type, i.severity, i.latitude, i.longitude, i.area,
              i.department, i.status, i.resolved_at, i.first_reported_at, i.last_reported_at, i.report_count
            FROM incidents i
            WHERE {list_sql}
            ORDER BY i.last_reported_at DESC
            LIMIT 200
            """
        ),
        list_params,
    ).mappings().all()
    issues = [_issue(row) for row in rows]
    issues.sort(key=lambda item: item["priority"]["score"], reverse=True)
    return {
        "total_complaints": int(counts["total_complaints"] or 0),
        "open_complaints": int(counts["open_complaints"] or 0),
        "in_progress_complaints": int(counts["in_progress_complaints"] or 0),
        "resolved_complaints": int(counts["resolved_complaints"] or 0),
        "issues": issues,
    }


def set_incident_status(session: Session, incident_id: uuid.UUID, status: str) -> bool:
    if status not in STATUSES:
        raise ValueError("Status must be open, in_progress, or resolved.")
    resolved_at = datetime.now(timezone.utc) if status == "resolved" else None
    result = session.execute(
        text(
            """
            UPDATE incidents
            SET status = :status,
                resolved_at = CASE WHEN :status = 'resolved' THEN COALESCE(resolved_at, :resolved_at) ELSE NULL END
            WHERE id = :id
            """
        ),
        {"status": status, "resolved_at": resolved_at, "id": incident_id},
    )
    session.commit()
    return result.rowcount > 0


def _department_filter(department: str | None) -> tuple[str, dict]:
    if department == "unassigned":
        return "i.department IS NULL", {}
    if department:
        if department not in DEPARTMENT_IDS:
            raise ValueError("Unknown department.")
        return "i.department = :department", {"department": department}
    return "1=1", {}


def _issue(row) -> dict:
    started = row["first_reported_at"]
    priority = priority_for_incident(
        category=row["issue_category"],
        severity=row["severity"],
        report_count=int(row["report_count"]),
        latitude=float(row["latitude"]),
        longitude=float(row["longitude"]),
        area=row["area"],
        started_at=started,
        status=row["status"] or "open",
        resolved_at=row["resolved_at"],
    )
    return {
        "id": str(row["id"]),
        "issue_category": row["issue_category"],
        "issue_type": row["issue_type"],
        "severity": row["severity"],
        "latitude": float(row["latitude"]),
        "longitude": float(row["longitude"]),
        "area": row["area"],
        "department": row["department"],
        "status": row["status"] or "open",
        "first_reported_at": started.isoformat(),
        "last_reported_at": row["last_reported_at"].isoformat(),
        "report_count": int(row["report_count"]),
        "priority": priority,
    }
