import logging
import re
import threading
import time

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger("civicmind")

AREA_KEYS = (
    "suburb",
    "neighbourhood",
    "quarter",
    "residential",
    "city_district",
    "village",
    "hamlet",
    "town",
)

_lock = threading.Lock()
_cache: dict[tuple[float, float], str | None] = {}
_last_request = 0.0


_ADMIN = re.compile(r"\b(ward|zone|district)\b", re.IGNORECASE)


def _clean(value: object, *, allow_admin: bool = False) -> str | None:
    text_value = str(value or "").strip()
    if not text_value:
        return None
    if not allow_admin and _ADMIN.search(text_value):
        return None
    return text_value[:120]


def pick_area(address: dict) -> str | None:
    """Choose a neighbourhood name, skipping municipal wards and zones."""
    neighbourhood = _clean(address.get("neighbourhood"))
    quarter = _clean(address.get("quarter"))
    if neighbourhood and quarter and neighbourhood.lower() != quarter.lower():
        return f"{neighbourhood}, {quarter}"[:120]
    for key in ("neighbourhood", "quarter", "residential", "suburb", "village", "hamlet", "town"):
        value = _clean(address.get(key))
        if value:
            return value
    for key in ("city_district", "city", "state_district", "suburb"):
        value = _clean(address.get(key), allow_admin=True)
        if value:
            return value
    return None


def ensure_areas(session: Session) -> None:
    """Fill missing area names for reports saved before the area column existed."""
    with _lock:
        try:
            rows = session.execute(
                text(
                    """
                    SELECT id::text AS id, latitude, longitude
                    FROM complaints
                    WHERE area IS NULL OR btrim(area) = ''
                       OR area ~* '\\yward\\y' OR area ~* '\\yzone\\y'
                    ORDER BY timestamp DESC
                    LIMIT 12
                    """
                )
            ).mappings().all()
            changed = False
            for row in rows:
                name = _lookup_locked(float(row["latitude"]), float(row["longitude"]))
                if not name:
                    continue
                session.execute(
                    text(
                        """
                        UPDATE complaints
                        SET area = :area
                        WHERE id = CAST(:id AS uuid)
                        """
                    ),
                    {"area": name, "id": row["id"]},
                )
                changed = True
            copied = session.execute(
                text(
                    """
                    UPDATE incidents AS incident
                    SET area = report.area
                    FROM (
                      SELECT DISTINCT ON (incident_id) incident_id, area
                      FROM complaints
                      WHERE area IS NOT NULL AND btrim(area) <> ''
                      ORDER BY incident_id, timestamp ASC
                    ) AS report
                    WHERE incident.id = report.incident_id
                      AND (
                        incident.area IS NULL OR btrim(incident.area) = ''
                        OR incident.area ~* '\\yward\\y' OR incident.area ~* '\\yzone\\y'
                      )
                    """
                )
            )
            if changed or copied.rowcount:
                session.commit()
        except Exception:
            session.rollback()
            logger.warning("Could not fill missing area names", exc_info=True)


def lookup_area(latitude: float, longitude: float) -> str | None:
    with _lock:
        return _lookup_locked(latitude, longitude)


def _lookup_locked(latitude: float, longitude: float) -> str | None:
    key = (round(latitude, 4), round(longitude, 4))
    if key in _cache:
        return _cache[key]
    _pace()
    try:
        name = _fetch(latitude, longitude)
    except Exception:
        logger.warning("Area lookup failed", exc_info=True)
        name = None
    _cache[key] = name
    return name


def _pace() -> None:
    global _last_request
    if _last_request:
        wait = 1.1 - (time.monotonic() - _last_request)
        if wait > 0:
            time.sleep(wait)
    _last_request = time.monotonic()


def _fetch(latitude: float, longitude: float) -> str | None:
    response = httpx.get(
        "https://nominatim.openstreetmap.org/reverse",
        params={
            "lat": latitude,
            "lon": longitude,
            "format": "jsonv2",
            "zoom": 18,
            "addressdetails": 1,
        },
        headers={"User-Agent": "CivicMind/1.0 (Mumbai civic complaint platform)"},
        timeout=8,
    )
    if response.status_code != 200:
        logger.warning("Area lookup returned %s", response.status_code)
        return None
    address = response.json().get("address")
    if not isinstance(address, dict):
        return None
    return pick_area(address)
