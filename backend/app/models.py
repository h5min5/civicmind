import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

SEVERITIES = ("low", "medium", "high", "critical")
STATUSES = ("open", "in_progress", "resolved")
ROLES = ("citizen", "authority", "admin")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('citizen','authority','admin')", name="ck_user_role"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    email: Mapped[str] = mapped_column(String(160), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    department: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (
        CheckConstraint("severity IN ('low','medium','high','critical')", name="ck_incident_severity"),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="ck_incident_lat"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="ck_incident_lng"),
        CheckConstraint("report_count >= 1", name="ck_incident_reports"),
        CheckConstraint("status IN ('open','in_progress','resolved')", name="ck_incident_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    issue_category: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    issue_type: Mapped[str] = mapped_column(String(80), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    area: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    first_reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    report_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    department: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open", server_default="open", index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    routing_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    tracking_code: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True, index=True)
    priority_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    reopen_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class Complaint(Base):
    __tablename__ = "complaints"
    __table_args__ = (
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_complaint_confidence"),
        CheckConstraint("severity IN ('low','medium','high','critical')", name="ck_complaint_severity"),
        CheckConstraint("priority IN ('low','medium','high','critical')", name="ck_complaint_priority"),
        CheckConstraint("status IN ('submitted','assigned','in_progress','resolved','closed')", name="ck_complaint_status"),
        CheckConstraint("severity_score >= 0 AND severity_score <= 10", name="ck_complaint_severity_score"),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="ck_complaint_lat"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="ck_complaint_lng"),
        Index("ix_complaints_timestamp", "timestamp"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    original_text: Mapped[str] = mapped_column(Text, nullable=False)
    image_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    image_bytes: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True, deferred=True)
    image_media_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    issue_category: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    issue_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    issue_subtype: Mapped[str] = mapped_column(String(80), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    severity_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    priority: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    department: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    routing_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="submitted", index=True)
    matched_existing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    visual_evidence: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    area: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(), nullable=False)
    incident_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("incidents.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    citizen_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    language: Mapped[str | None] = mapped_column(String(8), nullable=True)
    tracking_code: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True, index=True)


class IncidentEvent(Base):
    __tablename__ = "incident_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("incidents.id"), nullable=False, index=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    incident_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("incidents.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Feedback(Base):
    __tablename__ = "feedback"
    __table_args__ = (CheckConstraint("rating IS NULL OR (rating >= 1 AND rating <= 5)", name="ck_feedback_rating"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("incidents.id"), nullable=False, index=True)
    complaint_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("complaints.id"), nullable=True)
    citizen_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ResolutionImage(Base):
    __tablename__ = "resolution_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("incidents.id"), nullable=False, index=True)
    image_bytes: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, deferred=True)
    image_media_type: Mapped[str] = mapped_column(String(64), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    source: Mapped[str] = mapped_column(String(160), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(), nullable=True)


class AppMeta(Base):
    __tablename__ = "app_meta"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
