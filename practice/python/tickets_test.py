import unittest

from tickets import summarize_ticket, normalize_title, classify_priority


class TicketTests(unittest.TestCase):
    def test_baseline_summary(self):
        self.assertEqual(summarize_ticket({"id": "T-1", "title": "Cannot sign in"}), "T-1: Cannot sign in")

    def test_d1_collapses_whitespace(self):
        self.assertEqual(normalize_title("  Cannot   sign\t in  "), "Cannot sign in")

    def test_d1_rejects_blank_title(self):
        with self.assertRaisesRegex(ValueError, "title"):
            normalize_title(" \t ")

    def test_d2_blocked_is_high(self):
        self.assertEqual(classify_priority({"blocked": True, "severity": 3}), "high")

    def test_d2_severity_one_is_high(self):
        self.assertEqual(classify_priority({"blocked": False, "severity": 1}), "high")

    def test_d2_ordinary_is_normal(self):
        self.assertEqual(classify_priority({"blocked": False, "severity": 3}), "normal")


if __name__ == "__main__":
    unittest.main()
