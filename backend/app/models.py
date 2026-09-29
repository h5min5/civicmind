import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
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


class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (
        CheckConstraint("severity IN ('low','medium','high','critical')", name="ck_incident_severity"),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="ck_incident_lat"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="ck_incident_lng"),
        CheckConstraint("report_count >= 1", name="ck_incident_reports"),
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


class Complaint(Base):
    __tablename__ = "complaints"
    __table_args__ = (
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_complaint_confidence"),
        CheckConstraint("severity IN ('low','medium','high','critical')", name="ck_complaint_severity"),
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
    issue_type: Mapped[str] = mapped_column(String(80), nullable=False)
    issue_subtype: Mapped[str] = mapped_column(String(80), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
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


class AppMeta(Base):
    __tablename__ = "app_meta"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
