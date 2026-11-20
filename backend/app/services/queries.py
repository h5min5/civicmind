import uuid
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.services.departments import department_name
from app.services.priority import priority_for_incident

IST = timezone(timedelta(hours=5, minutes=30))

COMPLAINT_COLUMNS = """
id, original_text, image_path, issue_category, issue_type, issue_subtype,
severity, description, visual_evidence, confidence, latitude, longitude, area,
timestamp, incident_id, created_at, tracking_code, language
"""

INCIDENT_COLUMNS = """
id, issue_category, issue_type, severity, latitude, longitude, area,
first_reported_at, last_reported_at, report_count, department, status,
resolved_at, tracking_code, summary, routing_reason, resolution_note, reopen_count
"""


def list_complaints(
    session: Session,
    *,
    q: str | None,
    category: str | None,
    severity: str | None,
    issue_type: str | None,
    area: str | None,
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
        area=area,
        text_columns=("original_text", "description", "issue_type", "issue_subtype", "area"),
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
    return _attach_updates(session, [_record(row) for row in rows], "incident_id")


def list_incidents(
    session: Session,
    *,
    q: str | None,
    category: str | None,
    severity: str | None,
    issue_type: str | None,
    area: str | None,
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
        area=area,
        text_columns=("issue_type", "issue_category", "area"),
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
    return _attach_updates(session, [_with_priority(_record(row)) for row in rows], "id")


def _filters(
    q: str | None,
    category: str | None,
    severity: str | None,
    issue_type: str | None,
    date_from: date | None,
    date_to: date | None,
    text_columns: tuple[str, ...],
    time_column: str = "timestamp",
    area: str | None = None,
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
    if area:
        clauses.append("area = :area")
        params["area"] = area
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


def list_areas(session: Session) -> list[str]:
    rows = session.execute(
        text(
            """
            SELECT area FROM (
              SELECT area FROM complaints WHERE area IS NOT NULL AND btrim(area) <> ''
              UNION
              SELECT area FROM incidents WHERE area IS NOT NULL AND btrim(area) <> ''
            ) names
            ORDER BY area
            """
        )
    ).scalars().all()
    return [str(row) for row in rows]


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _with_priority(item: dict) -> dict:
    started = datetime.fromisoformat(item["first_reported_at"])
    resolved = datetime.fromisoformat(item["resolved_at"]) if item.get("resolved_at") else None
    item["priority"] = priority_for_incident(
        category=item["issue_category"],
        severity=item["severity"],
        report_count=int(item["report_count"]),
        latitude=float(item["latitude"]),
        longitude=float(item["longitude"]),
        area=item.get("area"),
        started_at=started,
        status=item.get("status") or "open",
        resolved_at=resolved,
    )
    item["department_name"] = department_name(item.get("department"))
    return item


def _attach_updates(session: Session, records: list[dict], incident_key: str) -> list[dict]:
    """Authority notes and status changes belong on the public complaint cards."""
    ids: list[uuid.UUID] = []
    seen: set[str] = set()
    for record in records:
        record["updates"] = []
        raw = record.get(incident_key)
        if raw is None:
            continue
        key = str(raw)
        if key in seen:
            continue
        seen.add(key)
        ids.append(uuid.UUID(key))
    if not ids:
        return records
    rows = session.execute(
        text(
            """
            SELECT id, incident_id, kind, message, created_at
            FROM incident_events
            WHERE incident_id IN :ids
              AND kind IN ('note', 'status')
            ORDER BY created_at
            """
        ).bindparams(bindparam("ids", expanding=True)),
        {"ids": ids},
    ).mappings().all()
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        item = _record(row)
        message = (item.get("message") or "").strip()
        if not message:
            continue
        grouped.setdefault(str(item["incident_id"]), []).append(
            {
                "id": item["id"],
                "kind": item["kind"],
                "message": message,
                "created_at": item["created_at"],
            }
        )
    for record in records:
        raw = record.get(incident_key)
        if raw is None:
            continue
        record["updates"] = grouped.get(str(raw), [])
    return records


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
