DEPARTMENT_ROUTING = {
    "pothole": ("Roads Department", "This issue affects road quality and surface safety."),
    "damaged road": ("Roads Department", "This issue affects road quality and surface safety."),
    "road damage": ("Roads Department", "This issue affects road quality and surface safety."),
    "road": ("Roads Department", "This issue affects road quality and surface safety."),
    "water leakage": ("Water Supply Department", "Leakage indicates a water infrastructure problem requiring supply response."),
    "water leak": ("Water Supply Department", "Leakage indicates a water infrastructure problem requiring supply response."),
    "waterlogging": ("Storm Water / Drainage Department", "Standing water suggests drainage or storm water management failure."),
    "drainage": ("Storm Water / Drainage Department", "Standing water suggests drainage or storm water management failure."),
    "drain": ("Storm Water / Drainage Department", "Standing water suggests drainage or storm water management failure."),
    "garbage": ("Solid Waste Management", "Waste accumulation needs collection and sanitation response."),
    "waste": ("Solid Waste Management", "Waste accumulation needs collection and sanitation response."),
    "trash": ("Solid Waste Management", "Waste accumulation needs collection and sanitation response."),
    "streetlight": ("Electrical / Street Lighting Department", "Broken lighting affects visibility and public safety."),
    "street light": ("Electrical / Street Lighting Department", "Broken lighting affects visibility and public safety."),
    "light": ("Electrical / Street Lighting Department", "Broken lighting affects visibility and public safety."),
    "sewer": ("Sewerage Department", "Sewer or sanitation issues need sewer infrastructure action."),
    "sewage": ("Sewerage Department", "Sewer or sanitation issues need sewer infrastructure action."),
    "traffic": ("Traffic Department", "Traffic flow or road safety issues need traffic management intervention."),
    "manhole": ("Sewerage Department", "Open or damaged manholes are sewer-related public safety risks."),
    "public safety": ("Municipal Safety / Public Works Department", "This issue affects public safety and requires urgent municipal attention."),
}


def route_department(issue_type: str, issue_category: str | None = None) -> dict[str, str]:
    normalized = (issue_type or "").strip().lower().replace("_", " ")
    category = (issue_category or "").strip().lower().replace("_", " ")
    for key, (department, reason) in DEPARTMENT_ROUTING.items():
        if key in normalized or key in category:
            return {"department": department, "reason": reason}
    default_department = "Public Works Department"
    return {
        "department": default_department,
        "reason": "This complaint does not match a more specific civic service category; it is routed to public works for review.",
    }
