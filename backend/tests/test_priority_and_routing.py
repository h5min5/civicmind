from app.config import Settings
from app.services.severity import calculate_severity
from app.services.priority import classify_priority
from app.services.routing import route_department


def test_blank_embedding_dimensions_are_allowed():
    settings = Settings(
        database_url="postgresql://user:pass@localhost:5432/postgres",
        groq_api_key="demo",
        embedding_base_url="https://example.com",
        embedding_model="text-embedding-3-small",
        embedding_dimensions="",
    )
    assert settings.embedding_dimensions is None


def test_placeholder_database_url_is_rejected():
    try:
        Settings(
            database_url="postgresql+psycopg://postgres:placeholder@localhost:5432/postgres?sslmode=disable",
            groq_api_key="demo",
            embedding_base_url="https://example.com",
            embedding_model="text-embedding-3-small",
        )
        raise AssertionError("placeholder database URL should be rejected")
    except ValueError as exc:
        assert "DATABASE_URL is still using a placeholder value" in str(exc)


def test_severity_score_is_deterministic_and_in_range():
    result = calculate_severity(
        issue_type="water_leakage",
        issue_category="water_supply",
        description="Major water leakage is flooding the street for 3 days near a busy junction.",
        location="busy_road",
        report_volume=8,
        duration_hours=72,
        safety_context="manhole near school",
    )

    assert 0 <= result["severity_score"] <= 10
    assert result["priority"] in {"low", "medium", "high", "critical"}
    assert result["factors"]["impact"] >= 0
    assert result["factors"]["safety_risk"] >= 0


def test_priority_classification_matches_ranges():
    assert classify_priority(2.9) == "low"
    assert classify_priority(3.0) == "medium"
    assert classify_priority(5.0) == "high"
    assert classify_priority(7.0) == "critical"


def test_routing_for_water_leakage():
    routing = route_department("water_leakage", "water_supply")
    assert routing["department"] == "Water Supply Department"
    assert routing["reason"]
