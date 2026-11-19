"""First-run accounts and tracking codes for rows created before these columns existed."""

import uuid

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models import User
from app.services.auth import hash_password, normalize_email
from app.services.departments import DEPARTMENTS, department_name

DEMO_ACCOUNTS = [
    ("Platform Admin", "admin@civicmind.in", "admin", None, "Admin@12345"),
    ("Citizen Demo", "citizen@civicmind.in", "citizen", None, "Citizen@12345"),
]


def complaint_code(value: uuid.UUID) -> str:
    return f"CM-{value.hex[:8].upper()}"


def incident_code(value: uuid.UUID) -> str:
    return f"INC-{value.hex[:8].upper()}"


def seed() -> None:
    from app.database import SessionLocal

    session = SessionLocal()
    try:
        _backfill_codes(session)
        _seed_users(session)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _backfill_codes(session: Session) -> None:
    session.execute(
        text(
            """
            UPDATE incidents
            SET tracking_code = 'INC-' || UPPER(SUBSTRING(REPLACE(id::text, '-', ''), 1, 8))
            WHERE tracking_code IS NULL
            """
        )
    )
    session.execute(
        text(
            """
            UPDATE complaints
            SET tracking_code = 'CM-' || UPPER(SUBSTRING(REPLACE(id::text, '-', ''), 1, 8))
            WHERE tracking_code IS NULL
            """
        )
    )
    session.execute(text("UPDATE incidents SET status = 'open' WHERE status IS NULL"))
    session.execute(text("UPDATE incidents SET reopen_count = 0 WHERE reopen_count IS NULL"))
    session.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_incidents_tracking_code ON incidents (tracking_code)"))
    session.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_complaints_tracking_code ON complaints (tracking_code)"))


def _seed_users(session: Session) -> None:
    accounts = list(DEMO_ACCOUNTS)
    for department in DEPARTMENTS:
        accounts.append((f"{department.name} Desk", f"{department.id}@civicmind.in", "authority", department.id, "Authority@12345"))
    for name, email, role, department, password in accounts:
        normalized = normalize_email(email)
        existing = session.scalar(select(User).where(User.email == normalized))
        if existing is not None:
            continue
        session.add(
            User(
                id=uuid.uuid4(),
                name=name,
                email=normalized,
                password_hash=hash_password(password),
                role=role,
                department=department,
            )
        )


def demo_roster() -> list[dict]:
    roster = [
        {"name": name, "email": email, "role": role, "department": department_name(department) if department else None}
        for name, email, role, department, _password in DEMO_ACCOUNTS
    ]
    roster.extend(
        {"name": f"{item.name} Desk", "email": f"{item.id}@civicmind.in", "role": "authority", "department": item.name}
        for item in DEPARTMENTS
    )
    return roster
