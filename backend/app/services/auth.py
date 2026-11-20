"""Passwords, sessions, and role checks. Tokens are random and only their hash is stored."""

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuthSession, User

PBKDF2_ROUNDS = 80_000
SESSION_DAYS = 14


class AuthError(Exception):
    def __init__(self, message: str, status: int = 401):
        super().__init__(message)
        self.message = message
        self.status = status


def hash_password(password: str, rounds: int = PBKDF2_ROUNDS) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, rounds)
    return f"pbkdf2_sha256${rounds}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt_hex, digest_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
        got = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(rounds))
        return hmac.compare_digest(got, expected)
    except (ValueError, TypeError):
        return False


def token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def read_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def public_user(user: User) -> dict:
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "department": user.department,
    }


def can_manage(role: str, user_department: str | None, incident_department: str | None) -> bool:
    if role == "admin":
        return True
    if role != "authority" or not user_department:
        return False
    return incident_department == user_department


def scope_department(role: str, user_department: str | None, requested: str | None) -> str | None:
    """Department filter for a workspace. None means every department."""
    if requested == "all":
        requested = None
    if role == "admin":
        return requested
    if role != "authority" or not user_department:
        raise AuthError("An authority or administrator account is required.", 403)
    if requested and requested != user_department:
        raise AuthError("This account can only open its own department.", 403)
    return user_department


def user_for_token(session: Session, raw_token: str) -> User | None:
    now = datetime.now(timezone.utc)
    found = session.scalar(
        select(AuthSession).where(
            AuthSession.token_hash == token_hash(raw_token),
            AuthSession.expires_at > now,
        )
    )
    if found is None:
        return None
    return session.get(User, found.user_id)


def resolve_user(session: Session, authorization: str | None, *, required: bool) -> User | None:
    raw = read_bearer(authorization)
    if raw is None:
        if required:
            raise AuthError("Sign in to continue.")
        return None
    user = user_for_token(session, raw)
    if user is None:
        raise AuthError("That session has expired. Sign in again.")
    return user


def open_session(session: Session, user: User) -> str:
    raw = secrets.token_urlsafe(32)
    session.add(
        AuthSession(
            id=uuid.uuid4(),
            user_id=user.id,
            token_hash=token_hash(raw),
            expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
        )
    )
    return raw


def close_session(session: Session, raw_token: str) -> None:
    found = session.scalar(select(AuthSession).where(AuthSession.token_hash == token_hash(raw_token)))
    if found is not None:
        session.delete(found)


def normalize_email(value: str) -> str:
    return value.strip().lower()
