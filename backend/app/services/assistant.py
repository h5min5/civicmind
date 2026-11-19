"""Citizen assistant and authority copilot. Model answers are grounded in retrieved notes and stored figures."""

import json

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Incident, User
from app.services.embeddings import ProviderError
from app.services.groq_vision import complete_chat
from app.services.rag import retrieve
from app.services.workspace import incident_detail, load_issues, overview, public_tracking

SYSTEM = """You are the CivicMind assistant for Mumbai civic operations.
Answer only from the knowledge excerpts and the operational JSON in the user message.
If they do not contain the answer, say that the knowledge base does not cover it.
Do not invent complaint counts, dates, accuracy figures, circular numbers, or sources.
When you use an excerpt, name its source file.
Write in plain sentences. If the citizen wrote in Hindi or Marathi, you may answer in that language using the same facts.
"""

SUMMARY_SYSTEM = """Summarize these citizen reports in two or three neutral sentences.
Use only the text provided. Do not invent injuries, costs, causes, or locations that are not written.
Do not add a heading.
"""


def citizen_reply(session: Session, question: str, tracking_code: str | None) -> dict:
    facts = None
    if tracking_code:
        try:
            detail = public_tracking(session, tracking_code)
            facts = _track_facts(detail)
        except LookupError:
            facts = {"tracking_code": tracking_code, "found": False}
    excerpts = retrieve(session, question)
    return _reply(question, excerpts, facts, "Citizen")


def authority_reply(session: Session, user: User, question: str, department: str | None, incident_id) -> dict:
    board = overview(session, department)
    facts = {
        "viewer": user.name,
        "role": user.role,
        "department_scope": board["department_name"],
        "total_complaints": board["total_complaints"],
        "total_incidents": board["total_incidents"],
        "active_incidents": board["active_incidents"],
        "critical_issues": board["critical_issues"],
        "resolved_issues": board["resolved_issues"],
        "resolution_rate": board["resolution_rate"],
        "average_resolution_hours": board["average_resolution_hours"],
    }
    if incident_id is not None:
        detail = incident_detail(session, incident_id)
        if user.role != "admin" and detail["department"] != user.department:
            raise PermissionError("That incident is outside this account's department.")
        facts["incident"] = _track_facts(detail)
    excerpts = retrieve(session, question)
    return _reply(question, excerpts, facts, "Authority")


def write_ai_summary(session: Session, incident: Incident) -> str:
    reports = session.execute(
        text("SELECT description, original_text FROM complaints WHERE incident_id = :id ORDER BY timestamp"),
        {"id": incident.id},
    ).mappings().all()
    lines = []
    for row in reports:
        text = (row["description"] or row["original_text"] or "").strip()
        if text:
            lines.append(f"- {text}")
    if not lines:
        raise ValueError("There is no report text to summarize.")
    summary = complete_chat(SUMMARY_SYSTEM, "Citizen reports:\n" + "\n".join(lines[:12]))
    cleaned = " ".join(summary.split())
    if not cleaned:
        raise ProviderError("The model returned an empty summary.")
    incident.ai_summary = cleaned[:1200]
    return incident.ai_summary


def _track_facts(detail: dict) -> dict:
    priority = detail.get("priority") or {}
    return {
        "found": True,
        "incident_code": detail.get("tracking_code"),
        "status": detail.get("status"),
        "department": detail.get("department_name"),
        "severity": detail.get("severity"),
        "area": detail.get("area"),
        "report_count": detail.get("report_count"),
        "priority_score": priority.get("score"),
        "priority_factors": priority.get("factors"),
        "summary": detail.get("summary"),
        "routing_reason": detail.get("routing_reason"),
        "resolution_note": detail.get("resolution_note"),
        "recommended_steps": detail.get("recommended_steps"),
    }


def _reply(question: str, excerpts: list[dict], facts: dict | None, audience: str) -> dict:
    sources = [
        {"title": item["title"], "source": item["source"], "excerpt": item["content"][:420], "score": item.get("score")}
        for item in excerpts
    ]
    if not sources and not facts:
        return {
            "mode": "knowledge",
            "answer": "The knowledge base does not contain a passage that answers this.",
            "sources": [],
            "model": None,
        }
    packet = {
        "audience": audience,
        "question": question,
        "excerpts": [{"source": item["source"], "title": item["title"], "text": item["content"]} for item in excerpts],
        "operational_facts": facts,
    }
    settings = get_settings()
    try:
        answer = complete_chat(SYSTEM, json.dumps(packet, ensure_ascii=False, default=str))
        return {"mode": "model", "answer": answer.strip(), "sources": sources, "model": settings.groq_model}
    except ProviderError as exc:
        return {
            "mode": "briefing",
            "answer": _briefing(sources, facts, str(exc)),
            "sources": sources,
            "model": None,
            "model_error": str(exc),
        }


def _briefing(sources: list[dict], facts: dict | None, error: str) -> str:
    parts = [
        "The language model is unavailable, so this answer is assembled only from retrieved notes and stored figures.",
        f"Model error: {error}",
    ]
    if facts:
        parts.append("Stored figures: " + json.dumps(facts, ensure_ascii=False, default=str)[:1800])
    if not sources:
        parts.append("No knowledge passage matched the question.")
    for source in sources:
        parts.append(f"{source['title']} ({source['source']}): {source['excerpt']}")
    return "\n\n".join(parts)
