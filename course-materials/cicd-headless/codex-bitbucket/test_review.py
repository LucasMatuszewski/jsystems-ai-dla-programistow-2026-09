"""Offline contract tests. All fixtures are synthetic; no service credentials needed."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("review.py")


def load_module():
    spec = importlib.util.spec_from_file_location("review", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ReviewContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.review = load_module()

    def setUp(self):
        self.pr = {
            "id": 7, "state": "OPEN", "title": "COURSE-42 Fix authorization",
            "description": "Synthetic acceptance criteria",
            "source": {"commit": {"hash": "a" * 40}, "branch": {"name": "feature/COURSE-42-auth"},
                       "repository": {"full_name": "training/demo"}},
            "destination": {"commit": {"hash": "b" * 40}, "repository": {"full_name": "training/demo"}},
        }
        self.env = {"BITBUCKET_WORKSPACE": "training", "BITBUCKET_REPO_SLUG": "demo",
                    "BITBUCKET_PR_ID": "7", "JIRA_PROJECT_KEYS": "COURSE",
                    "BITBUCKET_BOT_UUID": "{bot}", "JIRA_BOT_ACCOUNT_ID": "jira-bot"}
        self.context = {"workspace": "training", "repo": "demo", "pr_id": "7",
                        "head": "a" * 40, "base": "b" * 40, "issue_key": "COURSE-42",
                        "files": ["app.py"], "diff": "diff --git a/app.py b/app.py\n+deny()\n",
                        "ticket": {"summary": "Fix authorization", "description": "Use permissions"}}
        self.report = {"summary": "Authorization defect", "findings": [
            {"path": "app.py", "line": 1, "severity": "high", "title": "Missing permission check",
             "evidence": "An unrelated user can read the record", "recommendation": "Check ownership"}],
            "limitations": ["Tests were not executed"]}

    def test_collect_fetches_diff_and_only_selected_jira_fields(self):
        calls = []
        def bb(method, path, payload=None, text=False):
            calls.append((method, path))
            if "/diffstat" in path:
                return {"values": [{"new": {"path": "app.py"}, "old": {"path": "app.py"}}]}
            if path.endswith("/diff"):
                return self.context["diff"]
            return self.pr
        def jira(method, path, payload=None):
            calls.append((method, path))
            return {"key": "COURSE-42", "fields": {"summary": "Fix authorization",
                    "description": {"type": "doc", "content": [{"type": "paragraph", "content": [
                        {"type": "text", "text": "Use permissions"}]}]}, "status": {"name": "In Review"}}}
        context = self.review.collect(self.env, bb, jira)
        self.assertEqual(context["head"], "a" * 40)
        self.assertEqual(context["ticket"]["description"], "Use permissions")
        self.assertIn(("GET", "/rest/api/3/issue/COURSE-42?fields=summary,description,status"), calls)

    def test_collect_rejects_moving_pr_and_incomplete_diff(self):
        count = 0
        def bb(method, path, payload=None, text=False):
            nonlocal count
            if path.endswith("/diff"):
                return self.context["diff"]
            if "/diffstat" in path:
                return {"values": [{"new": {"path": "app.py"}}, {"new": {"path": "other.py"}}]}
            count += 1
            return self.pr
        with self.assertRaisesRegex(ValueError, "Incomplete diff"):
            self.review.collect(self.env, bb, None)
        def moving(method, path, payload=None, text=False):
            if path.endswith("/diff"):
                return self.context["diff"]
            if "/diffstat" in path:
                return {"values": [{"new": {"path": "app.py"}}]}
            nonlocal count
            count += 1
            pr = json.loads(json.dumps(self.pr))
            if count > 2:
                pr["source"]["commit"]["hash"] = "c" * 40
            return pr
        count = 1
        with self.assertRaisesRegex(ValueError, "changed"):
            self.review.collect(self.env, moving, None)

    def test_ticket_keys_are_unambiguous_and_project_scoped(self):
        self.assertEqual(self.review.issue_key(self.pr, self.env), "COURSE-42")
        self.pr["title"] = "OTHER-3 unrelated"
        with self.assertRaisesRegex(ValueError, "Ambiguous"):
            self.review.issue_key(self.pr, self.env)
        self.pr["source"]["branch"]["name"] = "feature/OTHER-3"
        with self.assertRaisesRegex(ValueError, "project"):
            self.review.issue_key(self.pr, self.env)

    def test_publish_updates_bot_comments_on_later_pages_and_uses_jira_adf(self):
        writes = []
        marker = "[codex-cr-review]: #"
        def bb(method, path, payload=None, text=False):
            if method != "GET":
                writes.append(("bb", method, path, payload))
                return {"id": 99}
            if path.endswith("/comments?pagelen=100"):
                return {"values": [{"id": 4, "user": {"uuid": "human"}, "content": {"raw": marker}}],
                        "next": "https://api.bitbucket.org/2.0/repositories/training/demo/pullrequests/7/comments?page=2"}
            if "page=2" in path:
                return {"values": [{"id": 99, "user": {"uuid": "{bot}"}, "content": {"raw": marker}}]}
            return self.pr
        def jira(method, path, payload=None):
            if method != "GET":
                writes.append(("jira", method, path, payload))
                return {"id": "12"}
            return {"comments": [{"id": "12", "author": {"accountId": "jira-bot"}, "body": {
                "type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text",
                "text": "codex-cr:training/demo#7"}]}]}}], "startAt": 0, "maxResults": 100, "total": 1}
        self.review.publish(self.context, self.report, self.env, bb, jira)
        self.assertEqual([(w[0], w[1], w[2]) for w in writes], [
            ("bb", "PUT", "/repositories/training/demo/pullrequests/7/comments/99"),
            ("jira", "PUT", "/rest/api/3/issue/COURSE-42/comment/12")])
        self.assertEqual(writes[1][3]["body"]["type"], "doc")
        self.assertEqual(writes[1][3]["body"]["version"], 1)
        self.assertIn("Tests were not executed", writes[0][3]["content"]["raw"])

    def test_stale_or_malformed_report_never_publishes(self):
        writes = []
        def bb(method, path, payload=None, text=False):
            if method != "GET":
                writes.append(method)
            pr = json.loads(json.dumps(self.pr))
            pr["destination"]["commit"]["hash"] = "d" * 40
            return pr
        with self.assertRaisesRegex(ValueError, "changed"):
            self.review.publish(self.context, self.report, self.env, bb, lambda *args: {})
        self.assertEqual(writes, [])
        for value in [True, 0, -1]:
            self.report["findings"][0]["line"] = value
            with self.assertRaises(ValueError):
                self.review.validate_report(self.report, self.context)
        self.report["findings"][0]["line"] = 1
        self.report["findings"][0]["path"] = "outside.py"
        with self.assertRaisesRegex(ValueError, "path"):
            self.review.validate_report(self.report, self.context)

    def test_artifact_cannot_choose_another_ticket_in_the_same_project(self):
        self.context["issue_key"] = "COURSE-999"
        writes = []
        def bb(method, path, payload=None, text=False):
            if method != "GET":
                writes.append(path)
            if "/comments" in path:
                return {"values": []}
            return self.pr
        def jira(method, path, payload=None):
            if method != "GET":
                writes.append(path)
            return {"comments": [], "total": 0}
        with self.assertRaisesRegex(ValueError, "ticket"):
            self.review.publish(self.context, self.report, self.env, bb, jira)
        self.assertEqual(writes, [])

    def test_first_run_creates_comments_and_retry_recovers_from_jira_failure(self):
        bb_comments, jira_comments, methods = [], [], []
        fail_jira = True
        def bb(method, path, payload=None, text=False):
            if method == "GET":
                return {"values": bb_comments} if "/comments" in path else self.pr
            methods.append(("bb", method))
            value = {"id": 8, "user": {"uuid": "{bot}"}, **payload}
            bb_comments[:] = [value]
            return value
        def jira(method, path, payload=None):
            nonlocal fail_jira
            if method == "GET":
                return {"comments": jira_comments, "total": len(jira_comments)}
            if fail_jira:
                fail_jira = False
                raise RuntimeError("Synthetic Jira failure")
            methods.append(("jira", method))
            value = {"id": "9", "author": {"accountId": "jira-bot"}, **payload}
            jira_comments[:] = [value]
            return value
        with self.assertRaisesRegex(RuntimeError, "Jira failure"):
            self.review.publish(self.context, self.report, self.env, bb, jira)
        self.review.publish(self.context, self.report, self.env, bb, jira)
        self.review.publish(self.context, self.report, self.env, bb, jira)
        self.assertEqual(methods, [("bb", "POST"), ("bb", "PUT"), ("jira", "POST"),
                                   ("bb", "PUT"), ("jira", "PUT")])
        self.assertEqual(len(bb_comments), 1)
        self.assertEqual(len(jira_comments), 1)

    def test_jira_pagination_cannot_publish_after_pr_moves(self):
        reads, writes = 0, []
        def bb(method, path, payload=None, text=False):
            nonlocal reads
            if method != "GET":
                writes.append(("bb", method))
                return {"id": 8}
            if "/comments" in path:
                return {"values": []}
            reads += 1
            value = json.loads(json.dumps(self.pr))
            if reads >= 3:
                value["source"]["commit"]["hash"] = "c" * 40
            return value
        def jira(method, path, payload=None):
            if method != "GET":
                writes.append(("jira", method))
            return {"comments": [], "total": 0}
        with self.assertRaisesRegex(ValueError, "changed"):
            self.review.publish(self.context, self.report, self.env, bb, jira)
        self.assertEqual(writes, [("bb", "POST")])

    def test_project_allowlist_spaces_work_during_collection_and_publication(self):
        self.env["JIRA_PROJECT_KEYS"] = "OTHER, COURSE"
        self.assertEqual(self.review.issue_key(self.pr, self.env), "COURSE-42")
        writes = []
        def bb(method, path, payload=None, text=False):
            if method != "GET":
                writes.append("bb")
            return {"values": []} if "/comments" in path else self.pr
        def jira(method, path, payload=None):
            if method != "GET":
                writes.append("jira")
            return {"comments": [], "total": 0}
        self.review.publish(self.context, self.report, self.env, bb, jira)
        self.assertEqual(writes, ["bb", "jira"])

    def test_review_of_pr_7_does_not_overwrite_jira_review_of_pr_70(self):
        writes = []
        def bb(method, path, payload=None, text=False):
            return {"values": []} if "/comments" in path else self.pr
        def jira(method, path, payload=None):
            if method != "GET":
                writes.append((method, path))
                return {"id": "71"}
            return {"comments": [{"id": "70", "author": {"accountId": "jira-bot"}, "body": {
                "type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text",
                "text": "codex-cr:training/demo#70"}]}]}}], "total": 1}
        self.review.publish(self.context, self.report, self.env, bb, jira)
        self.assertEqual(writes, [("POST", "/rest/api/3/issue/COURSE-42/comment")])

    def test_analyze_invokes_codex_with_schema_and_without_publication_secrets(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            context_file = root / "context.json"
            report_file = root / "review.json"
            context_file.write_text(json.dumps(self.context))
            observed = {}
            def run(args, **kwargs):
                observed.update(kwargs)
                observed["args"] = args
                Path(args[args.index("-o") + 1]).write_text(json.dumps(self.report))
                return subprocess.CompletedProcess(args, 0)
            with patch.dict(os.environ, {"CODEX_API_KEY": "synthetic-model-token",
                                         "BITBUCKET_ACCESS_TOKEN": "synthetic-write-token",
                                         "JIRA_API_TOKEN": "synthetic-jira-token"}):
                self.review.analyze(context_file, report_file, "approved-model", run)
            self.assertEqual(json.loads(report_file.read_text()), self.report)
            self.assertNotIn("BITBUCKET_ACCESS_TOKEN", observed["env"])
            self.assertNotIn("JIRA_API_TOKEN", observed["env"])
            self.assertEqual(observed["args"][observed["args"].index("--sandbox") + 1], "read-only")
            self.assertIn("--output-schema", observed["args"])
            self.assertIn("--ignore-user-config", observed["args"])
            self.assertNotEqual(Path(observed["cwd"]), context_file.parent)

    def test_api_rejects_foreign_urls_and_redirects_before_credentials_leave(self):
        api = self.review.Api("https://api.bitbucket.org/2.0", "Bearer synthetic")
        with self.assertRaisesRegex(ValueError, "origin"):
            api.url("https://attacker.invalid/steal")
        with self.assertRaisesRegex(ValueError, "origin"):
            self.review.SafeRedirect().redirect_request(None, None, 302, "Found", {}, "https://attacker.invalid/")


if __name__ == "__main__":
    unittest.main()
