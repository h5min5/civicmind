import unittest
from datetime import datetime, timedelta, timezone

from app.services.auth import can_manage, hash_password, scope_department, verify_password
from app.services.auth import AuthError
from app.services.departments import department_for_category, infer_department
from app.services.forecast import evaluate_forecast, routing_agreement
from app.services.hotspots import area_health, cell_key, detect_hotspots, is_emerging
from app.services.rag import rank_chunks
from app.services.reports import build_csv, build_pdf
from app.services.summary import extractive_summary, recommended_steps
from app.services.workspace import allowed_transition


class AuthTests(unittest.TestCase):
    def test_password_round_trip(self):
        stored = hash_password("Authority@12345", rounds=1000)
        self.assertTrue(verify_password("Authority@12345", stored))
        self.assertFalse(verify_password("wrong-password", stored))

    def test_authorities_stay_inside_their_department(self):
        self.assertTrue(can_manage("admin", None, "roads_infra"))
        self.assertTrue(can_manage("admin", None, None))
        self.assertTrue(can_manage("authority", "roads_infra", "roads_infra"))
        self.assertFalse(can_manage("authority", "roads_infra", "drainage"))
        self.assertFalse(can_manage("authority", "roads_infra", None))
        self.assertFalse(can_manage("citizen", None, "roads_infra"))
        self.assertEqual(scope_department("authority", "drainage", None), "drainage")
        self.assertEqual(scope_department("admin", None, "all"), None)
        with self.assertRaises(AuthError):
            scope_department("authority", "drainage", "traffic")


class RoutingTests(unittest.TestCase):
    def test_phrase_routing_covers_the_ten_desks_and_leaves_stray_animals_unassigned(self):
        self.assertEqual(infer_department("road", "pothole", "deep pothole")[0], "roads_infra")
        self.assertEqual(infer_department("other", "general", "There is an exposed wire hanging over the footpath")[0], "public_safety")
        self.assertEqual(infer_department(None, "", "Public Toilet Condition")[0], "sanitation")
        self.assertEqual(infer_department(None, "", "Street Light Failure")[0], "street_lighting")
        self.assertIsNone(infer_department(None, "", "Stray Animal Menace")[0])
        self.assertIsNone(department_for_category("other"))
        self.assertIn("unassigned", infer_department("other", "general", "hello there")[1].lower())


class LifecycleTests(unittest.TestCase):
    def test_status_moves_forward_and_can_reopen(self):
        self.assertTrue(allowed_transition("open", "in_progress"))
        self.assertTrue(allowed_transition("in_progress", "resolved"))
        self.assertTrue(allowed_transition("resolved", "open"))
        self.assertFalse(allowed_transition("open", "open"))
        self.assertFalse(allowed_transition("resolved", "in_progress"))


class SummaryTests(unittest.TestCase):
    def test_summary_uses_only_the_stored_reports(self):
        text = extractive_summary(
            ["A deep pothole has opened outside the bus stop."],
            "pothole",
            "road",
            "Mahavir Nagar",
        )
        self.assertIn("1 citizen report", text)
        self.assertIn("Mahavir Nagar", text)
        self.assertIn("deep pothole", text)

    def test_steps_ask_for_assignment_when_no_department_is_set(self):
        steps = recommended_steps({"status": "open", "department": None, "severity": "low", "report_count": 1, "priority": {"score": 2}})
        self.assertTrue(any("administrator" in step.lower() for step in steps))


class HotspotTests(unittest.TestCase):
    def test_a_cell_with_a_sharp_rise_is_emerging(self):
        self.assertTrue(is_emerging(4, 1))
        self.assertTrue(is_emerging(3, 0))
        self.assertFalse(is_emerging(2, 0))
        now = datetime(2026, 11, 18, tzinfo=timezone.utc)
        points = []
        for index in range(4):
            points.append(
                {
                    "latitude": 19.08,
                    "longitude": 72.88,
                    "last_reported_at": now - timedelta(days=index),
                    "report_count": 1,
                    "status": "open",
                    "issue_category": "drainage",
                    "area": "Dadar",
                }
            )
        found = detect_hotspots(points, now)
        self.assertTrue(found)
        self.assertTrue(found[0]["emerging"])
        self.assertEqual(cell_key(19.08, 72.88), cell_key(19.081, 72.881))

    def test_area_health_is_computed_from_the_rows_it_is_given(self):
        result = area_health(
            [
                {"area": "Dadar", "status": "resolved", "priority": 2},
                {"area": "Dadar", "status": "open", "priority": 9},
            ]
        )
        self.assertEqual(len(result["areas"]), 1)
        self.assertEqual(result["areas"][0]["incidents"], 2)
        self.assertGreaterEqual(result["areas"][0]["score"], 0)
        self.assertLessEqual(result["areas"][0]["score"], 100)


class ForecastTests(unittest.TestCase):
    def test_holdout_metrics_come_from_the_series(self):
        series = []
        year, month = 2022, 1
        for index in range(30):
            seasonal = 20 if month in {6, 7, 8, 9} else 8
            series.append((year, month, seasonal + index // 12))
            month += 1
            if month == 13:
                month = 1
                year += 1
        result = evaluate_forecast(series)
        self.assertTrue(result["available"])
        self.assertEqual(result["holdout_months"], 6)
        self.assertEqual(len(result["holdout"]), 6)
        self.assertEqual(len(result["forecast"]), 6)
        self.assertGreaterEqual(result["mae"], 0)
        self.assertIsNotNone(result["mape"])

    def test_archive_routing_agreement_is_measured_when_the_file_exists(self):
        result = routing_agreement()
        if not result.get("available"):
            self.skipTest(result.get("reason"))
        self.assertGreater(result["compared"], 1000)
        self.assertGreaterEqual(result["agreement"], 0)
        self.assertLessEqual(result["agreement"], 1)
        by_name = {item["category"]: item for item in result["by_category"]}
        self.assertEqual(by_name["Pothole / Road Damage"]["agreement"], 1)
        self.assertEqual(by_name["Stray Animal Menace"]["agreement"], 0)


class RetrievalTests(unittest.TestCase):
    def test_keyword_retrieval_returns_the_passage_that_shares_the_question_words(self):
        ranked = rank_chunks(
            "which desk fixes a pothole",
            [
                {"title": "Roads", "source": "operations.md", "content": "Potholes on the carriageway go to Roads and Infrastructure."},
                {"title": "Lights", "source": "operations.md", "content": "Broken street lights go to Street Lighting."},
            ],
        )
        self.assertEqual(ranked[0]["title"], "Roads")
        self.assertGreater(ranked[0]["score"], 0)


class ReportTests(unittest.TestCase):
    def test_csv_and_pdf_contain_the_rows_they_were_given(self):
        csv_text = build_csv([{"tracking_code": "INC-1", "priority": 6.2}], ["tracking_code", "priority"])
        self.assertIn("INC-1", csv_text)
        self.assertIn("priority", csv_text)
        pdf = build_pdf(["CivicMind operational report", "No incidents in this view."])
        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertIn(b"%%EOF", pdf)


if __name__ == "__main__":
    unittest.main()
