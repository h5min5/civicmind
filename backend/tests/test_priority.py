import unittest
from datetime import datetime, timedelta, timezone

from app.services.departments import department_for_category, infer_department
from app.services.priority import combine, duration_score, location_score, priority_for_incident, volume_score
from app.services.hotspots import simulate_intervention


class DepartmentRoutingTests(unittest.TestCase):
    def test_known_categories_keep_their_desk(self):
        self.assertEqual(department_for_category("road"), "roads_infra")
        self.assertEqual(department_for_category("sewage"), "sanitation")
        self.assertEqual(department_for_category("pollution"), "public_health")
        self.assertEqual(department_for_category("traffic"), "traffic")

    def test_other_is_not_forced_onto_a_desk(self):
        self.assertIsNone(department_for_category("other"))
        self.assertIsNone(department_for_category(None))

    def test_routing_confidence_marks_category_phrase_and_unmatched_reports(self):
        department, _reason, confidence = infer_department("road", "pothole", "A pothole")
        self.assertEqual(department, "roads_infra")
        self.assertEqual(confidence, 0.95)
        department, _reason, confidence = infer_department(None, "pipe leak", "Water is leaking")
        self.assertEqual(department, "water_supply")
        self.assertEqual(confidence, 0.82)
        department, _reason, confidence = infer_department("other", "unknown issue", "Some unclear problem")
        self.assertIsNone(department)
        self.assertEqual(confidence, 0.0)


class InterventionSimulationTests(unittest.TestCase):
    def test_intervention_returns_bounded_scenario(self):
        result = simulate_intervention(
            {"open_incidents": 10, "report_count": 20, "recent_incidents": 6},
            "drain_cleaning",
            50,
            30,
        )
        self.assertLessEqual(result["estimated_residual_open_incidents"], 10)
        self.assertGreater(result["estimated_risk_reduction_pct"], 0)
        self.assertIn("planning estimate", result["method"].lower())

    def test_intervention_input_limits_are_bounded(self):
        result = simulate_intervention(
            {"open_incidents": 2, "report_count": 4, "recent_incidents": 1},
            "cleanup",
            500,
            500,
        )
        self.assertEqual(result["capacity_pct"], 100)
        self.assertEqual(result["duration_days"], 90)


class PriorityTests(unittest.TestCase):
    def test_weights_sum_to_the_published_formula(self):
        self.assertEqual(combine(7, 8, 1, 8, 2), 5.7)

    def test_volume_rises_with_repeat_reports(self):
        self.assertEqual(volume_score(1), 1)
        self.assertEqual(volume_score(2), 3)
        self.assertEqual(volume_score(12), 10)

    def test_named_mumbai_location_scores_higher_than_a_bare_pin(self):
        self.assertEqual(location_score(19.208, 72.835, "Mahavir Nagar"), 8)
        self.assertEqual(location_score(19.208, 72.835, None), 5)
        self.assertEqual(location_score(28.6, 77.2, "Delhi"), 3)

    def test_open_issues_become_more_urgent_as_they_age(self):
        start = datetime(2026, 9, 1, tzinfo=timezone.utc)
        self.assertEqual(duration_score(start, start + timedelta(hours=2)), 1)
        self.assertEqual(duration_score(start, start + timedelta(days=10)), 8)

    def test_a_fresh_pothole_stays_a_moderate_priority(self):
        now = datetime(2026, 9, 29, 14, 0, tzinfo=timezone.utc)
        result = priority_for_incident(
            category="road",
            severity="medium",
            report_count=2,
            latitude=19.20835,
            longitude=72.83496,
            area="Renuka Nagar, Mahavir Nagar",
            started_at=now - timedelta(hours=2),
            status="open",
            resolved_at=None,
            now=now,
        )
        self.assertEqual(result["impact"], 7)
        self.assertEqual(result["risk"], 5)
        self.assertEqual(result["volume"], 3)
        self.assertEqual(result["location"], 8)
        self.assertEqual(result["duration"], 1)
        self.assertEqual(result["score"], combine(7, 5, 3, 8, 1))


if __name__ == "__main__":
    unittest.main()
