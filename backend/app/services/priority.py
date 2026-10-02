def classify_priority(score: float) -> str:
    if score < 3:
        return "low"
    if score < 5:
        return "medium"
    if score < 7:
        return "high"
    return "critical"
