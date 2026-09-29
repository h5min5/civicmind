import base64
import json
import logging
import re

import httpx
from pydantic import ValidationError

from app.config import get_settings
from app.schemas import IssueFeatures, ModelAssessment, apply_policy
from app.services.embeddings import ProviderError

logger = logging.getLogger("civicmind")

SYSTEM_PROMPT = """You are CivicMind, a strict validator and extractor for civic complaints in Mumbai.

Decide whether the citizen's text describes a plausible civic or urban issue, and, when a photo is attached, whether that photo actually shows a civic issue consistent with the text.

Accept roads, footpaths, potholes, waterlogging, flooding, blocked drains, garbage, sewage, street lights, water supply, public property damage, fallen trees blocking a street, encroachment on public land, and similar municipal problems.
Swearing is acceptable when the text still describes a real civic problem.
Reject random text, jokes, spam, greetings, tests, harassment with no civic issue, private consumer disputes, and personal matters.
Reject the submission when an attached photo is a selfie, meme, food, pet, screenshot, blank image, or any scene that is not a civic issue, or when the photo contradicts the text.
If you are not confident this is a real civic complaint, reject it.
Do not invent a location or a time. You are not given GPS or a timestamp.

Return one JSON object and nothing else, with exactly these keys:
{
  "is_valid_civic_complaint": false,
  "rejection_reason": "short neutral reason, or null when valid",
  "text_describes_civic_issue": false,
  "image_shows_civic_issue": null,
  "issue_category": "road",
  "issue_type": "pothole",
  "issue_subtype": "asphalt_collapse",
  "severity": "medium",
  "description": "One or two neutral sentences describing the civic issue.",
  "visual_evidence": "What the photo shows, or \\"No image was submitted.\\"",
  "confidence": 0.0
}

issue_category must be one of: road, drainage, water_supply, waste, sewage, streetlight, public_safety, trees_parks, encroachment, pollution, other.
severity must be one of: low, medium, high, critical.
image_shows_civic_issue is null when no image is attached, otherwise true or false.
confidence is a number from 0 to 1.
When the submission is invalid, still fill the issue fields with your best reading or empty strings, and put the reason in rejection_reason. Do not repeat abusive language.
"""


class Analysis:
    def __init__(self, assessment: ModelAssessment, features: IssueFeatures | None):
        self.assessment = assessment
        self.features = features


def analyze_complaint(text: str, image: bytes | None, media_type: str | None) -> Analysis:
    last_error: Exception | None = None
    for attempt in range(2):
        extra = ""
        if attempt == 1:
            extra = (
                "\nYour previous reply could not be validated. "
                "Return only the JSON object. severity must be low, medium, high, or critical. "
                "confidence must be between 0 and 1."
            )
        raw = _complete(text + extra, image, media_type)
        try:
            payload = _extract_json(raw)
            assessment = apply_policy(ModelAssessment.model_validate(payload), has_image=image is not None)
        except (ValidationError, ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            logger.warning("Unparseable model response on attempt %s", attempt + 1)
            continue
        if not assessment.is_valid_civic_complaint:
            return Analysis(assessment, None)
        try:
            features = IssueFeatures.model_validate(assessment.model_dump())
        except ValidationError as exc:
            last_error = exc
            logger.warning("Feature validation failed on attempt %s", attempt + 1)
            continue
        return Analysis(assessment, features)
    raise ProviderError(f"The model did not return a usable assessment. {last_error}")


def semantic_text(original: str, features: IssueFeatures) -> str:
    return "\n".join(
        [
            f"Category: {features.issue_category}",
            f"Type: {features.issue_type}",
            f"Subtype: {features.issue_subtype}",
            f"Severity: {features.severity}",
            f"Description: {features.description}",
            f"Visual evidence: {features.visual_evidence}",
            f"Citizen report: {original.strip()}",
        ]
    )


def _complete(text: str, image: bytes | None, media_type: str | None) -> str:
    settings = get_settings()
    content: list[dict] = [{"type": "text", "text": text}]
    if image is not None and media_type is not None:
        encoded = base64.b64encode(image).decode("ascii")
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:{media_type};base64,{encoded}"},
            }
        )
    payload = {
        "model": settings.groq_model,
        "temperature": 0,
        "max_completion_tokens": 1200,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": content,
            },
        ],
    }
    if image is None:
        payload["messages"][1]["content"] = (
            "No image was attached. Set image_shows_civic_issue to null.\n\nCitizen complaint:\n" + text
        )
    else:
        payload["messages"][1]["content"][0]["text"] = (
            "An image is attached. Judge both the text and the image.\n\nCitizen complaint:\n" + text
        )

    try:
        response = httpx.post(
            f"{settings.groq_base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.groq_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=55,
        )
    except httpx.HTTPError as exc:
        raise ProviderError(f"Could not reach Groq. {exc}") from exc

    if response.status_code == 400 and "response_format" in response.text:
        payload.pop("response_format", None)
        response = httpx.post(
            f"{settings.groq_base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.groq_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=55,
        )
    if response.status_code in {401, 403}:
        raise ProviderError("The Groq API key was rejected. Check GROQ_API_KEY.")
    if response.status_code >= 400:
        raise ProviderError(f"Groq returned {response.status_code}: {response.text[:300]}")

    body = response.json()
    try:
        message = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderError("Groq returned a response without text.") from exc
    if isinstance(message, list):
        message = "".join(part.get("text", "") if isinstance(part, dict) else str(part) for part in message)
    if not isinstance(message, str) or not message.strip():
        raise ProviderError("Groq returned an empty assessment.")
    return message


def _extract_json(content: str) -> dict:
    stripped = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
    stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
    stripped = re.sub(r"\s*```$", "", stripped)
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("Model did not return JSON")
    payload = json.loads(stripped[start : end + 1])
    if not isinstance(payload, dict):
        raise ValueError("Model JSON was not an object")
    return payload
