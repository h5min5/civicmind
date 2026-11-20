import unittest

from app.services.geocode import pick_area


class AreaNameTests(unittest.TestCase):
    def test_prefers_the_suburb_over_the_city(self):
        self.assertEqual(
            pick_area({"suburb": "Kandivali West", "city": "Mumbai", "state": "Maharashtra"}),
            "Kandivali West",
        )

    def test_uses_neighbourhood_when_suburb_is_missing(self):
        self.assertEqual(pick_area({"neighbourhood": "Orchid Suburbia", "city": "Mumbai"}), "Orchid Suburbia")

    def test_falls_back_to_the_city(self):
        self.assertEqual(pick_area({"city": "Mumbai"}), "Mumbai")

    def test_empty_address_has_no_area(self):
        self.assertIsNone(pick_area({}))

    def test_skips_a_municipal_ward_for_the_locality(self):
        self.assertEqual(
            pick_area(
                {
                    "neighbourhood": "Renuka Nagar",
                    "quarter": "Mahavir Nagar",
                    "suburb": "R/S Ward",
                    "city_district": "Mumbai Zone 4",
                }
            ),
            "Renuka Nagar, Mahavir Nagar",
        )

    def test_keeps_a_ward_when_nothing_more_local_exists(self):
        self.assertEqual(pick_area({"suburb": "R/S Ward"}), "R/S Ward")


if __name__ == "__main__":
    unittest.main()
