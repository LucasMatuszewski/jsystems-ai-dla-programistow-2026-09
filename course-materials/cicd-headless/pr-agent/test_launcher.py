"""Run the real launcher with a fake Docker executable; no network or secrets."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("review-pr.sh")


class LauncherContracts(unittest.TestCase):
    def run_launcher(self, provider, url, extra=None, command="review"):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            docker = root / "docker"
            docker.write_text('#!/usr/bin/env python3\nimport json,sys\nprint(json.dumps(sys.argv[1:]))\n')
            docker.chmod(0o755)
            env = {"PATH": folder + ":" + os.environ["PATH"],
                   "PR_AGENT_IMAGE": "pragent/pr-agent@sha256:" + "a" * 64,
                   "GIT_PLATFORM": provider, "PR_URL": url,
                   "REVIEW_MODEL": "approved-model", "ANTHROPIC__KEY": "synthetic-secret"}
            env.update(extra or {})
            return subprocess.run(["bash", str(SCRIPT), command], env=env, capture_output=True, text=True)

    def test_supported_platforms_forward_names_and_cli_command(self):
        fixtures = [
            ("github", "https://github.com/training/demo/pull/7", {"GITHUB__USER_TOKEN": "secret"}),
            ("gitlab", "https://gitlab.example.com/team/demo/-/merge_requests/7",
             {"GITLAB__URL": "https://gitlab.example.com", "GITLAB__PERSONAL_ACCESS_TOKEN": "secret"}),
            ("bitbucket", "https://bitbucket.org/training/demo/pull-requests/7", {"BITBUCKET__BEARER_TOKEN": "secret"}),
            ("bitbucket_server", "https://git.example.com/projects/COURSE/repos/demo/pull-requests/7",
             {"BITBUCKET_SERVER__URL": "https://git.example.com", "BITBUCKET_SERVER__BEARER_TOKEN": "secret"}),
            ("azure", "https://dev.azure.com/training/course/_git/demo/pullrequest/7",
             {"AZURE_DEVOPS__ORG": "https://dev.azure.com/training", "AZURE_DEVOPS__PAT": "secret"}),
        ]
        for provider, url, extra in fixtures:
            with self.subTest(provider=provider):
                result = self.run_launcher(provider, url, extra)
                self.assertEqual(result.returncode, 0, result.stderr)
                args = json.loads(result.stdout)
                self.assertEqual(args[-5:], ["-m", "pr_agent.cli", "--pr_url", url, "review"])
                self.assertIn("CONFIG__PROPAGATE_TOOL_ERRORS=true", args)
                self.assertNotIn("synthetic-secret", result.stdout)
                self.assertNotIn("=secret", result.stdout)

    def test_invalid_command_origin_and_image_never_start_docker(self):
        for overrides, command in [({}, "push"), ({"PR_URL": "https://attacker.invalid/pull/7"}, "review"),
                                   ({"PR_AGENT_IMAGE": "pragent/pr-agent:latest"}, "review")]:
            with self.subTest(overrides=overrides, command=command):
                result = self.run_launcher("github", "https://github.com/training/demo/pull/7",
                                           {"GITHUB__USER_TOKEN": "secret", **overrides}, command)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
