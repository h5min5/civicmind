"""Incident text built only from stored citizen reports."""


def extractive_summary(reports: list[str], issue_type: str, category: str, area: str | None) -> str:
    unique: list[str] = []
    seen: set[str] = set()
    for report in reports:
        text = " ".join((report or "").split())
        key = text.lower()
        if len(text) < 8 or key in seen:
            continue
        seen.add(key)
        unique.append(text)
        if len(unique) == 3:
            break
    place = f" near {area}" if area else ""
    kind = issue_type.replace("_", " ")
    label = category.replace("_", " ")
    count = len(reports)
    noun = "report" if count == 1 else "reports"
    lead = f"{count} citizen {noun} describe a {kind} ({label}){place}."
    if not unique:
        return lead
    return lead + " " + " ".join(unique)


def recommended_steps(incident: dict) -> list[str]:
    """Operational next steps derived from stored incident fields."""
    steps: list[str] = []
    status = incident.get("status") or "open"
    priority = incident.get("priority") or {}
    score = float(priority.get("score") or 0)
    if not incident.get("department"):
        steps.append("An administrator needs to assign a department. No routing rule matched this report.")
    if status == "open":
        steps.append("Acknowledge the incident and mark it in progress once a crew is assigned.")
    if incident.get("severity") in {"high", "critical"} or score >= 8:
        steps.append("Treat this as an urgent site visit. Severity or the priority score is in the high range.")
    if int(incident.get("report_count") or 1) >= 3:
        steps.append("Several residents reported this incident. Send a status update so they are not left waiting.")
    if status == "in_progress" and not (incident.get("resolution_note") or "").strip():
        steps.append("Record what the crew found before the incident is closed.")
    if status == "resolved":
        steps.append("The citizen can confirm the repair or ask for the incident to be reopened.")
    if not steps:
        steps.append("Keep the authority note current while fieldwork continues.")
    return steps
