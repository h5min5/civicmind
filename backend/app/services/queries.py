import uuid
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

IST = timezone(timedelta(hours=5, minutes=30))

COMPLAINT_COLUMNS = """
id, original_text, image_path, issue_category, issue_type, issue_subtype,
severity, severity_score, priority, department, routing_reason, status,
matched_existing, description, visual_evidence, confidence, latitude, longitude,
timestamp, incident_id, created_at
"""

INCIDENT_COLUMNS = """
id, issue_category, issue_type, severity, latitude, longitude,
first_reported_at, last_reported_at, report_count
"""


def list_complaints(
    session: Session,
    *,
    q: str | None,
    category: str | None,
    severity: str | None,
    issue_type: str | None,
    date_from: date | None,
    date_to: date | None,
    near_lat: float | None,
    near_lng: float | None,
    radius_m: float | None,
    limit: int,
) -> list[dict]:
    clauses, params = _filters(
        q,
        category,
        severity,
        issue_type,
        date_from,
        date_to,
        text_columns=("original_text", "description", "issue_type", "issue_subtype"),
    )
    distance = "NULL::double precision"
    order = "timestamp DESC"
    if near_lat is not None and near_lng is not None and radius_m is not None:
        params.update({"near_lat": near_lat, "near_lng": near_lng, "radius_m": radius_m})
        distance = """
        ST_Distance(
          ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
          ST_SetSRID(ST_MakePoint(:near_lng, :near_lat), 4326)::geography
        )
        """
        clauses.append(
            """
            ST_DWithin(
              ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
              ST_SetSRID(ST_MakePoint(:near_lng, :near_lat), 4326)::geography,
              :radius_m
            )
            """
        )
        order = "distance_m ASC, timestamp DESC"
    params["limit"] = limit
    sql = f"""
    SELECT {COMPLAINT_COLUMNS}, {distance} AS distance_m
    FROM complaints
    WHERE {" AND ".join(clauses)}
    ORDER BY {order}
    LIMIT :limit
    """
    rows = session.execute(text(sql), params).mappings().all()
    return [_record(row) for row in rows]


def list_incidents(
    session: Session,
    *,
    q: str | None,
    category: str | None,
    severity: str | None,
    issue_type: str | None,
    date_from: date | None,
    date_to: date | None,
    near_lat: float | None,
    near_lng: float | None,
    radius_m: float | None,
    limit: int,
) -> list[dict]:
    clauses, params = _filters(
        q,
        category,
        severity,
        issue_type,
        date_from,
        date_to,
        text_columns=("issue_type", "issue_category"),
        time_column="last_reported_at",
    )
    distance = "NULL::double precision"
    order = "last_reported_at DESC"
    if near_lat is not None and near_lng is not None and radius_m is not None:
        params.update({"near_lat": near_lat, "near_lng": near_lng, "radius_m": radius_m})
        distance = """
        ST_Distance(
          ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
          ST_SetSRID(ST_MakePoint(:near_lng, :near_lat), 4326)::geography
        )
        """
        clauses.append(
            """
            ST_DWithin(
              ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
              ST_SetSRID(ST_MakePoint(:near_lng, :near_lat), 4326)::geography,
              :radius_m
            )
            """
        )
        order = "distance_m ASC, last_reported_at DESC"
    params["limit"] = limit
    sql = f"""
    SELECT {INCIDENT_COLUMNS}, {distance} AS distance_m
    FROM incidents
    WHERE {" AND ".join(clauses)}
    ORDER BY {order}
    LIMIT :limit
    """
    rows = session.execute(text(sql), params).mappings().all()
    return [_record(row) for row in rows]


def _filters(
    q: str | None,
    category: str | None,
    severity: str | None,
    issue_type: str | None,
    date_from: date | None,
    date_to: date | None,
    text_columns: tuple[str, ...],
    time_column: str = "timestamp",
) -> tuple[list[str], dict]:
    clauses = ["1=1"]
    params: dict = {}
    if category:
        clauses.append("issue_category = :category")
        params["category"] = category
    if severity:
        clauses.append("severity = :severity")
        params["severity"] = severity
    if issue_type:
        clauses.append("issue_type ILIKE :issue_type ESCAPE '\\'")
        params["issue_type"] = f"%{_escape_like(issue_type)}%"
    if q:
        like = f"%{_escape_like(q)}%"
        parts = [f"{column} ILIKE :q ESCAPE '\\'" for column in text_columns]
        clauses.append("(" + " OR ".join(parts) + ")")
        params["q"] = like
    if date_from is not None:
        clauses.append(f"{time_column} >= :date_from")
        params["date_from"] = datetime.combine(date_from, time.min, tzinfo=IST)
    if date_to is not None:
        clauses.append(f"{time_column} < :date_to_exclusive")
        params["date_to_exclusive"] = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=IST)
    return clauses, params


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _record(row) -> dict:
    item: dict = {}
    for key, value in dict(row).items():
        if isinstance(value, uuid.UUID):
            item[key] = str(value)
        elif isinstance(value, datetime):
            item[key] = value.isoformat()
        elif key in {"distance_m", "confidence", "latitude", "longitude"} and value is not None:
            item[key] = float(value)
        else:
            item[key] = value
    return item
