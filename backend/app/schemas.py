import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

CATEGORIES = {
    "road",
    "drainage",
    "water_supply",
    "waste",
    "sewage",
    "streetlight",
    "public_safety",
    "trees_parks",
    "encroachment",
    "pollution",
    "other",
}

CATEGORY_ALIASES = {
    "roads": "road",
    "pothole": "road",
    "potholes": "road",
    "footpath": "road",
    "sidewalk": "road",
    "garbage": "waste",
    "trash": "waste",
    "litter": "waste",
    "dumping": "waste",
    "solid_waste": "waste",
    "lighting": "streetlight",
    "street_light": "streetlight",
    "street_lights": "streetlight",
    "light": "streetlight",
    "water": "water_supply",
    "waterlogging": "drainage",
    "flood": "drainage",
    "flooding": "drainage",
    "drain": "drainage",
    "gutter": "drainage",
    "sewer": "sewage",
    "manhole": "sewage",
    "tree": "trees_parks",
    "trees": "trees_parks",
    "park": "trees_parks",
    "parks": "trees_parks",
    "safety": "public_safety",
    "hazard": "public_safety",
    "encroachment": "encroachment",
    "noise": "pollution",
    "air": "pollution",
}

SEVERITY_ALIASES = {
    "low": "low",
    "minor": "low",
    "medium": "medium",
    "moderate": "medium",
    "normal": "medium",
    "high": "high",
    "severe": "high",
    "serious": "high",
    "critical": "critical",
    "urgent": "critical",
    "emergency": "critical",
}


def slug(value: str, limit: int = 80) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    return (cleaned or "unspecified")[:limit]


def canonical_category(value: str) -> str:
    key = slug(value)
    if key in CATEGORIES:
        return key
    if key in CATEGORY_ALIASES:
        return CATEGORY_ALIASES[key]
    head = key.split("_")[0]
    if head in CATEGORIES:
        return head
    if head in CATEGORY_ALIASES:
        return CATEGORY_ALIASES[head]
    return "other"


def clean_text(value: str, limit: int) -> str:
    collapsed = re.sub(r"\s+", " ", value).strip()
    return collapsed[:limit]


class ModelAssessment(BaseModel):
    """Raw structured output from the multimodal model, before policy checks."""

    model_config = ConfigDict(extra="ignore")

    is_valid_civic_complaint: bool
    rejection_reason: str | None = None
    text_describes_civic_issue: bool
    image_shows_civic_issue: bool | None = None
    issue_category: str = "other"
    issue_type: str = ""
    issue_subtype: str = ""
    severity: str = "low"
    description: str = ""
    visual_evidence: str = ""
    confidence: float = 0

    @field_validator("is_valid_civic_complaint", "text_describes_civic_issue", mode="before")
    @classmethod
    def coerce_bool(cls, value):
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"true", "yes", "1"}:
                return True
            if lowered in {"false", "no", "0"}:
                return False
        return value

    @field_validator("image_shows_civic_issue", mode="before")
    @classmethod
    def coerce_optional_bool(cls, value):
        if value is None or value == "":
            return None
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"true", "yes", "1"}:
                return True
            if lowered in {"false", "no", "0"}:
                return False
            if lowered in {"null", "none", "n/a", "na"}:
                return None
        return value

    @field_validator("confidence", mode="before")
    @classmethod
    def coerce_confidence(cls, value):
        if value is None or value == "":
            return 0.0
        number = float(value)
        if number > 1:
            number = number / 100
        return max(0.0, min(1.0, number))

    @field_validator("rejection_reason", mode="before")
    @classmethod
    def empty_reason(cls, value):
        if value is None:
            return None
        text = str(value).strip()
        return text or None


class IssueFeatures(BaseModel):
    model_config = ConfigDict(extra="ignore")

    issue_category: str
    issue_type: str = Field(min_length=1, max_length=80)
    issue_subtype: str = Field(min_length=1, max_length=80)
    severity: Literal["low", "medium", "high", "critical"]
    description: str = Field(min_length=8, max_length=800)
    visual_evidence: str = Field(min_length=1, max_length=500)
    confidence: float = Field(ge=0, le=1)

    @field_validator("issue_category")
    @classmethod
    def normalize_category(cls, value: str) -> str:
        return canonical_category(value)

    @field_validator("issue_type", "issue_subtype")
    @classmethod
    def normalize_type(cls, value: str) -> str:
        return slug(value)

    @field_validator("severity", mode="before")
    @classmethod
    def normalize_severity(cls, value: str) -> str:
        key = str(value).strip().lower()
        if key not in SEVERITY_ALIASES:
            raise ValueError("severity must be low, medium, high, or critical")
        return SEVERITY_ALIASES[key]

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return clean_text(value, 800)

    @field_validator("visual_evidence")
    @classmethod
    def normalize_visual(cls, value: str) -> str:
        return clean_text(value, 500)


def apply_policy(assessment: ModelAssessment, has_image: bool) -> ModelAssessment:
    """Fail closed: text must be civic, and a photo must actually show the issue."""
    data = assessment.model_dump()
    reasons: list[str] = []

    if not data["text_describes_civic_issue"]:
        data["is_valid_civic_complaint"] = False
        reasons.append("The text does not describe a plausible civic or urban issue.")

    if has_image:
        if data["image_shows_civic_issue"] is not True:
            data["image_shows_civic_issue"] = False
            data["is_valid_civic_complaint"] = False
            reasons.append("The image does not show a real civic issue.")
    else:
        data["image_shows_civic_issue"] = None

    if not data["is_valid_civic_complaint"]:
        model_reason = (data.get("rejection_reason") or "").strip()
        data["rejection_reason"] = model_reason or " ".join(reasons) or "This submission is not a civic complaint."
        return ModelAssessment.model_validate(data)

    data["rejection_reason"] = None
    if not str(data.get("issue_type") or "").strip():
        data["issue_type"] = "general"
    if not str(data.get("issue_subtype") or "").strip():
        data["issue_subtype"] = data["issue_type"]
    if not str(data.get("visual_evidence") or "").strip():
        data["visual_evidence"] = (
            "No image was submitted." if not has_image else "Civic issue visible in the submitted photo."
        )
    return ModelAssessment.model_validate(data)
