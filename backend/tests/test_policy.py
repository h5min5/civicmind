import unittest

from pydantic import ValidationError

from app.schemas import IssueFeatures, ModelAssessment, apply_policy, canonical_category


def assessment(**overrides) -> ModelAssessment:
    values = {
        "is_valid_civic_complaint": True,
        "rejection_reason": None,
        "text_describes_civic_issue": True,
        "image_shows_civic_issue": None,
        "issue_category": "road",
        "issue_type": "pothole",
        "issue_subtype": "asphalt_collapse",
        "severity": "high",
        "description": "A deep pothole has opened on the carriageway.",
        "visual_evidence": "No image was submitted.",
        "confidence": 0.82,
    }
    values.update(overrides)
    return ModelAssessment.model_validate(values)


class PolicyTests(unittest.TestCase):
    def test_civic_text_without_a_photo_is_accepted(self):
        result = apply_policy(assessment(), has_image=False)
        self.assertTrue(result.is_valid_civic_complaint)
        self.assertIsNone(result.image_shows_civic_issue)
        IssueFeatures.model_validate(result.model_dump())

    def test_random_text_is_rejected(self):
        result = apply_policy(
            assessment(
                is_valid_civic_complaint=False,
                text_describes_civic_issue=False,
                rejection_reason="This is not a civic issue.",
                description="",
            ),
            has_image=False,
        )
        self.assertFalse(result.is_valid_civic_complaint)
        self.assertIn("civic", result.rejection_reason or "")

    def test_civic_text_with_a_random_photo_is_rejected(self):
        result = apply_policy(
            assessment(image_shows_civic_issue=False, visual_evidence="A plate of food."),
            has_image=True,
        )
        self.assertFalse(result.is_valid_civic_complaint)
        self.assertFalse(result.image_shows_civic_issue)
        self.assertIn("image", (result.rejection_reason or "").lower())

    def test_missing_image_judgement_fails_closed(self):
        result = apply_policy(assessment(image_shows_civic_issue=None), has_image=True)
        self.assertFalse(result.is_valid_civic_complaint)
        self.assertFalse(result.image_shows_civic_issue)

    def test_matching_photo_stays_valid(self):
        result = apply_policy(
            assessment(image_shows_civic_issue=True, visual_evidence="Broken asphalt and standing water."),
            has_image=True,
        )
        self.assertTrue(result.is_valid_civic_complaint)
        self.assertTrue(result.image_shows_civic_issue)

    def test_category_aliases_and_severity(self):
        self.assertEqual(canonical_category("Garbage dump"), "waste")
        self.assertEqual(canonical_category("waterlogging"), "drainage")
        features = IssueFeatures.model_validate(
            assessment(issue_category="potholes", severity="severe", confidence=88).model_dump()
        )
        self.assertEqual(features.issue_category, "road")
        self.assertEqual(features.severity, "high")
        self.assertAlmostEqual(features.confidence, 0.88)

    def test_unknown_severity_is_rejected_by_the_schema(self):
        with self.assertRaises(ValidationError):
            IssueFeatures.model_validate(assessment(severity="banana").model_dump())


if __name__ == "__main__":
    unittest.main()
