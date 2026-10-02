from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

IST = timezone(timedelta(hours=5, minutes=30))


def authority_stats(session: Session) -> dict:
    sql = """
    SELECT
      COUNT(*) AS total_complaints,
      SUM(CASE WHEN status IN ('submitted', 'assigned', 'in_progress') THEN 1 ELSE 0 END) AS pending_complaints,
      SUM(CASE WHEN status IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS resolved_complaints,
      SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) AS high_priority_complaints,
      SUM(CASE WHEN priority = 'critical' THEN 1 ELSE 0 END) AS critical_complaints,
      SUM(CASE WHEN matched_existing = TRUE THEN 1 ELSE 0 END) AS duplicate_complaints
    FROM complaints
    """
    row = session.execute(text(sql)).mappings().one()
    department_rows = session.execute(
        text(
            """
            SELECT department, COUNT(*) AS total
            FROM complaints
            WHERE department IS NOT NULL
            GROUP BY department
            ORDER BY total DESC, department ASC
            """
        )
    ).mappings().all()
    priority_rows = session.execute(
        text(
            """
            SELECT priority, COUNT(*) AS total
            FROM complaints
            WHERE priority IS NOT NULL
            GROUP BY priority
            ORDER BY CASE priority
              WHEN 'critical' THEN 1
              WHEN 'high' THEN 2
              WHEN 'medium' THEN 3
              WHEN 'low' THEN 4
              ELSE 5
            END
            """
        )
    ).mappings().all()
    return {
        "total_complaints": int(row["total_complaints"] or 0),
        "pending_complaints": int(row["pending_complaints"] or 0),
        "resolved_complaints": int(row["resolved_complaints"] or 0),
        "high_priority_complaints": int(row["high_priority_complaints"] or 0),
        "critical_complaints": int(row["critical_complaints"] or 0),
        "duplicate_complaints": int(row["duplicate_complaints"] or 0),
        "complaints_by_department": [{"department": item["department"], "total": int(item["total"])} for item in department_rows],
        "complaints_by_priority": [{"priority": item["priority"], "total": int(item["total"])} for item in priority_rows],
    }


def list_authority_complaints(
    session: Session,
    *,
    q: str | None = None,
    department: str | None = None,
    priority: str | None = None,
    status: str | None = None,
    issue_type: str | None = None,
    limit: int = 50,
    sort_by: str = "severity_score",
) -> list[dict]:
    clauses = ["1=1"]
    params: dict = {"limit": limit}
    if q:
        clauses.append("(issue_type ILIKE :q OR description ILIKE :q OR original_text ILIKE :q)")
        params["q"] = f"%{q}%"
    if department:
        clauses.append("department = :department")
        params["department"] = department
    if priority:
        clauses.append("priority = :priority")
        params["priority"] = priority
    if status:
        clauses.append("status = :status")
        params["status"] = status
    if issue_type:
        clauses.append("issue_type ILIKE :issue_type ESCAPE '\\'")
        params["issue_type"] = f"%{issue_type}%"

    sort = "severity_score DESC NULLS LAST, timestamp DESC"
    if sort_by == "date":
        sort = "timestamp DESC"
    elif sort_by == "priority":
        sort = "CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, severity_score DESC NULLS LAST"

    sql = f"""
    SELECT
      id,
      issue_type,
      issue_category,
      description,
      latitude,
      longitude,
      timestamp,
      department,
      severity_score,
      priority,
      status,
      matched_existing,
      original_text
    FROM complaints
    WHERE {" AND ".join(clauses)}
    ORDER BY {sort}
    LIMIT :limit
    """
    rows = session.execute(text(sql), params).mappings().all()
    complaints = []
    for row in rows:
        item = {key: value for key, value in dict(row).items()}
        if isinstance(item.get("timestamp"), datetime):
            item["timestamp"] = item["timestamp"].isoformat()
        if isinstance(item.get("severity_score"), float):
            item["severity_score"] = round(item["severity_score"], 2)
        complaints.append(item)
    return complaints


def update_complaint_status(session: Session, complaint_id: str, status: str) -> dict:
    normalized = normalize_status(status)
    sql = """
    UPDATE complaints
    SET status = :status
    WHERE id = :complaint_id
    RETURNING id, status, priority, department, severity_score
    """
    row = session.execute(text(sql), {"status": normalized, "complaint_id": complaint_id}).mappings().one_or_none()
    if row is None:
        raise ValueError("Complaint not found.")
    return dict(row)


def normalize_status(value: str) -> str:
    cleaned = (value or "").strip().lower().replace("-", "_")
    aliases = {
        "submitted": "submitted",
        "assigned": "assigned",
        "in progress": "in_progress",
        "in_progress": "in_progress",
        "inprogress": "in_progress",
        "resolved": "resolved",
        "closed": "closed",
    }
    return aliases.get(cleaned, cleaned if cleaned in {"submitted", "assigned", "in_progress", "resolved", "closed"} else "submitted")
