"""Ten civic desks. Category routing stays explainable and deterministic."""

from dataclasses import dataclass

@dataclass(frozen=True)
class Department:
    id: str
    name: str
    categories: tuple[str, ...]
    issues: tuple[str, ...]
    brief: str


DEPARTMENTS: tuple[Department, ...] = (
    Department(
        "roads_infra",
        "Roads & Infrastructure",
        ("road",),
        ("Potholes", "Damaged roads", "Footpaths", "Road infrastructure"),
        "Carriageways, footpaths, and road surface failures.",
    ),
    Department(
        "water_supply",
        "Water Supply",
        ("water_supply",),
        ("Pipeline leakage", "Water shortages", "Contamination", "Pressure issues"),
        "Potable water pipes, supply interruptions, contamination, and pressure.",
    ),
    Department(
        "sanitation",
        "Sanitation",
        ("waste", "sewage"),
        ("Garbage accumulation", "Waste collection", "Overflowing bins", "Sewage"),
        "Solid waste, overflowing bins, and sewage on the street.",
    ),
    Department(
        "street_lighting",
        "Street Lighting",
        ("streetlight",),
        ("Broken streetlights", "Damaged poles", "Lighting failures"),
        "Street lights and lighting poles that have failed.",
    ),
    Department(
        "drainage",
        "Drainage",
        ("drainage",),
        ("Blocked drains", "Waterlogging", "Stormwater drainage"),
        "Storm drains, waterlogging, and blocked nullahs.",
    ),
    Department(
        "public_health",
        "Public Health",
        ("pollution",),
        ("Mosquito breeding", "Pollution", "Hygiene hazards"),
        "Mosquito breeding, pollution, and hygiene hazards in public places.",
    ),
    Department(
        "traffic",
        "Traffic",
        ("traffic",),
        ("Traffic signal faults", "Road obstructions", "Traffic infrastructure"),
        "Signals, road obstructions, and traffic infrastructure.",
    ),
    Department(
        "parks_gardens",
        "Parks & Gardens",
        ("trees_parks",),
        ("Fallen trees", "Park maintenance", "Damaged public gardens"),
        "Fallen trees, parks, and public gardens.",
    ),
    Department(
        "building_encroachment",
        "Building & Encroachment",
        ("encroachment",),
        ("Illegal encroachments", "Unsafe structures", "Building hazards"),
        "Encroachment on public land and unsafe structures.",
    ),
    Department(
        "public_safety",
        "Public Safety",
        ("public_safety",),
        ("Exposed wires", "Dangerous public infrastructure", "Urgent safety hazards"),
        "Exposed wires and other urgent hazards in public space.",
    ),
)

DEPARTMENT_BY_ID = {item.id: item for item in DEPARTMENTS}
DEPARTMENT_IDS = frozenset(DEPARTMENT_BY_ID)
CATEGORY_DEPARTMENT = {category: item.id for item in DEPARTMENTS for category in item.categories}

# Longer phrases are listed first so "water supply" is not captured by a drain rule.
_PHRASES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("exposed wire", "open wire", "dangling wire", "live wire", "electric shock"), "public_safety"),
    (("traffic signal", "signal fault", "signal not", "road obstruction", "traffic jam"), "traffic"),
    (("mosquito", "dengue", "breeding", "epidemic"), "public_health"),
    (("waterlogging", "water logging", "blocked drain", "storm water", "stormwater", "drainage", "flood"), "drainage"),
    (("public toilet", "sewage", "sewer", "manhole"), "sanitation"),
    (("garbage", "overflowing bin", "solid waste", "trash", "rubbish"), "sanitation"),
    (
        ("water supply", "no water", "pipeline", "pipe burst", "pipe leak", "contaminated water", "water shortage", "low pressure", "water leakage"),
        "water_supply",
    ),
    (("street light", "streetlight", "lamp post"), "street_lighting"),
    (("pothole", "footpath", "damaged road", "road damage", "carriageway"), "roads_infra"),
    (("fallen tree", "tree fallen", "dangerous tree", "park maintenance", "garden"), "parks_gardens"),
    (("encroach", "illegal construction", "unsafe structure", "unsafe building"), "building_encroachment"),
    (("pollution", "hygiene"), "public_health"),
)


def department_for_category(category: str | None) -> str | None:
    if not category:
        return None
    return CATEGORY_DEPARTMENT.get(category)


def department_name(department_id: str | None) -> str:
    if not department_id:
        return "Unassigned"
    item = DEPARTMENT_BY_ID.get(department_id)
    return item.name if item else department_id


def infer_department(category: str | None, issue_type: str | None, text: str | None) -> tuple[str | None, str, float]:
    """Return department, explanation, and routing confidence from 0 to 1."""
    mapped = department_for_category(category)
    if mapped:
        name = department_name(mapped)
        return mapped, f"Category '{category}' is handled by {name}.", 0.95
    haystack = " ".join(part for part in (issue_type or "", text or "") if part).lower().replace("_", " ")
    for phrases, department_id in _PHRASES:
        hit = next((phrase for phrase in phrases if phrase in haystack), None)
        if hit:
            name = department_name(department_id)
            return department_id, f"The category was ambiguous, but the report mentions '{hit}', which is handled by {name}.", 0.82
    return None, "No department rule matched this report. It stays unassigned until an administrator routes it.", 0.0


def catalog() -> list[dict]:
    return [
        {
            "id": item.id,
            "name": item.name,
            "categories": list(item.categories),
            "issues": list(item.issues),
            "brief": item.brief,
        }
        for item in DEPARTMENTS
    ]
