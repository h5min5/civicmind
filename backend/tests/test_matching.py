import unittest

from app.services.matching import Candidate, Thresholds, evaluate_candidates

THRESHOLDS = Thresholds(semantic_similarity=0.80, geo_radius_meters=500, time_window_hours=72)


def candidate(**overrides) -> Candidate:
    values = {
        "complaint_id": "c1",
        "incident_id": "i1",
        "semantic_similarity": 0.9,
        "distance_m": 100,
        "time_difference_hours": 2,
    }
    values.update(overrides)
    return Candidate(**values)


class MatchingTests(unittest.TestCase):
    def test_all_three_rules_join_an_existing_incident(self):
        decision = evaluate_candidates([candidate()], THRESHOLDS)
        self.assertTrue(decision.matched_existing)
        self.assertEqual(decision.incident_id, "i1")
        self.assertIn("Joined an existing incident", decision.explanation)

    def test_exact_thresholds_still_match(self):
        decision = evaluate_candidates(
            [candidate(semantic_similarity=0.80, distance_m=500, time_difference_hours=72)],
            THRESHOLDS,
        )
        self.assertTrue(decision.matched_existing)

    def test_low_similarity_creates_a_new_incident(self):
        decision = evaluate_candidates([candidate(semantic_similarity=0.79)], THRESHOLDS)
        self.assertFalse(decision.matched_existing)
        self.assertIsNone(decision.incident_id)
        self.assertIn("semantic similarity", decision.explanation)
        self.assertFalse(decision.passed_similarity)
        self.assertTrue(decision.passed_distance)
        self.assertTrue(decision.passed_time)

    def test_distance_outside_the_radius_creates_a_new_incident(self):
        decision = evaluate_candidates([candidate(distance_m=501)], THRESHOLDS)
        self.assertFalse(decision.matched_existing)
        self.assertIn("distance", decision.explanation)

    def test_time_outside_the_window_creates_a_new_incident(self):
        decision = evaluate_candidates([candidate(time_difference_hours=72.1)], THRESHOLDS)
        self.assertFalse(decision.matched_existing)
        self.assertIn("time gap", decision.explanation)

    def test_a_passing_nearby_report_beats_a_closer_semantic_match_that_is_far_away(self):
        far = candidate(complaint_id="far", incident_id="far-incident", semantic_similarity=0.99, distance_m=8000)
        near = candidate(complaint_id="near", incident_id="near-incident", semantic_similarity=0.81, distance_m=40)
        decision = evaluate_candidates([far, near], THRESHOLDS)
        self.assertTrue(decision.matched_existing)
        self.assertEqual(decision.incident_id, "near-incident")

    def test_highest_similarity_wins_when_several_reports_pass(self):
        weaker = candidate(complaint_id="a", incident_id="incident-a", semantic_similarity=0.82)
        stronger = candidate(complaint_id="b", incident_id="incident-b", semantic_similarity=0.93)
        decision = evaluate_candidates([weaker, stronger], THRESHOLDS)
        self.assertEqual(decision.incident_id, "incident-b")

    def test_empty_history_creates_the_first_incident(self):
        decision = evaluate_candidates([], THRESHOLDS)
        self.assertFalse(decision.matched_existing)
        self.assertIn("No earlier complaint", decision.explanation)
        self.assertIsNone(decision.semantic_similarity)


if __name__ == "__main__":
    unittest.main()
