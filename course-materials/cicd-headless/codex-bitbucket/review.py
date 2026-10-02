#!/usr/bin/env python3
"""Trusted CI adapter: Bitbucket Cloud + Jira Cloud + headless Codex (stdlib only)."""
import argparse
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib import error, parse, request

MAX_DIFF_BYTES = 120_000
MAX_RESPONSE_BYTES = 2_000_000
MARKER = "[codex-cr-review]: #"


class SafeRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Bitbucket /pullrequests/{id}/diff redirects within this API origin.
        if req is None or parse.urlsplit(req.full_url).netloc != parse.urlsplit(newurl).netloc or not newurl.startswith("https://"):
            raise ValueError("API redirect changed origin")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class Api:
    def __init__(self, base, authorization):
        parts = parse.urlsplit(base)
        if parts.scheme != "https" or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
            raise ValueError("API base must be a trusted HTTPS URL")
        self.base = base.rstrip("/")
        self.authorization = authorization
        self.opener = request.build_opener(SafeRedirect())

    def url(self, path):
        url = path if path.startswith("https://") else self.base + path
        if parse.urlsplit(url).netloc != parse.urlsplit(self.base).netloc or not url.startswith(self.base + "/"):
            raise ValueError("API request changed origin or base path")
        return url

    def __call__(self, method, path, payload=None, text=False):
        data = None if payload is None else json.dumps(payload).encode()
        req = request.Request(self.url(path), data=data, method=method, headers={
            "Authorization": self.authorization, "Content-Type": "application/json",
            "Accept": "text/plain" if text else "application/json"})
        try:
            with self.opener.open(req, timeout=45) as response:
                body = response.read(MAX_RESPONSE_BYTES + 1)
            if len(body) > MAX_RESPONSE_BYTES:
                raise ValueError("API response exceeds the example's size limit")
            return body.decode("utf-8") if text else json.loads(body or b"{}")
        except error.HTTPError as exc:
            # Do not print response bodies, URLs, auth headers, or private ticket text.
            raise RuntimeError(f"API {method} failed with HTTP {exc.code}") from None
        except error.URLError:
            raise RuntimeError("API connection failed") from None


def required(env, name):
    value = env.get(name, "")
    if not value:
        raise ValueError(f"Set {name} in the trusted CI configuration")
    return value


def pr_path(env):
    workspace = required(env, "BITBUCKET_WORKSPACE")
    repo = required(env, "BITBUCKET_REPO_SLUG")
    pr_id = required(env, "BITBUCKET_PR_ID")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", workspace) or not re.fullmatch(r"[A-Za-z0-9_.-]+", repo) or not re.fullmatch(r"[1-9][0-9]*", pr_id):
        raise ValueError("Invalid repository or PR identity")
    return f"/repositories/{workspace}/{repo}/pullrequests/{pr_id}"


def revision(pr):
    if pr.get("state") != "OPEN":
        raise ValueError("PR is not open")
    result = (pr["source"]["commit"]["hash"], pr["destination"]["commit"]["hash"])
    if not all(re.fullmatch(r"[a-f0-9]{40,64}", sha) for sha in result):
        raise ValueError("Invalid PR commit hashes")
    return result


def issue_key(pr, env):
    # Only one ticket; never let model output choose the publication destination.
    keys = set(re.findall(r"(?<![A-Z0-9])[A-Z][A-Z0-9]+-[1-9][0-9]*\b",
                          pr.get("title", "") + " " + pr["source"]["branch"]["name"]))
    if len(keys) > 1:
        raise ValueError("Ambiguous Jira keys in PR title/source branch")
    if not keys:
        return None
    key = keys.pop()
    if key.split("-")[0] not in allowed_projects(env):
        raise ValueError("Jira project is outside JIRA_PROJECT_KEYS")
    return key


def allowed_projects(env):
    return {p.strip() for p in required(env, "JIRA_PROJECT_KEYS").split(",") if p.strip()}


def adf_text(node):
    if isinstance(node, str):
        return node
    if not isinstance(node, dict):
        return ""
    if node.get("type") == "text":
        return node.get("text", "")
    separator = "\n" if node.get("type") == "doc" else ""
    return separator.join(adf_text(child) for child in node.get("content", []))


def bb_pages(bb, path):
    seen = set()
    while path:
        if path in seen or len(seen) >= 100:
            raise ValueError("Invalid or excessive API pagination")
        seen.add(path)
        page = bb("GET", path)
        yield from page.get("values", [])
        path = page.get("next")


def collect(env, bb, jira):
    path = pr_path(env)
    pr = bb("GET", path)
    head, base = revision(pr)
    repository = f"{env['BITBUCKET_WORKSPACE']}/{env['BITBUCKET_REPO_SLUG']}"
    if pr["source"]["repository"]["full_name"] != repository or pr["destination"]["repository"]["full_name"] != repository:
        raise ValueError("This training pipeline accepts same-repository PRs only")
    diff = bb("GET", path + "/diff", text=True)
    files = list(bb_pages(bb, path + "/diffstat?pagelen=100"))
    if len(diff.encode()) > MAX_DIFF_BYTES:
        raise ValueError("Diff exceeds size limit; split the PR or add explicit chunking")
    if len(re.findall(r"^diff --git ", diff, re.MULTILINE)) != len(files):
        raise ValueError("Incomplete diff; refusing to report a successful review")
    if revision(bb("GET", path)) != (head, base):
        raise ValueError("PR changed during context collection; rerun")
    key = issue_key(pr, env)
    ticket = None
    if key:
        if jira is None:
            raise ValueError("Jira client required for the linked ticket")
        issue = jira("GET", f"/rest/api/3/issue/{key}?fields=summary,description,status")
        fields = issue["fields"]
        ticket = {"summary": fields.get("summary", ""), "description": adf_text(fields.get("description")),
                  "status": fields.get("status", {}).get("name", "")}
    return {"workspace": env["BITBUCKET_WORKSPACE"], "repo": env["BITBUCKET_REPO_SLUG"],
            "pr_id": env["BITBUCKET_PR_ID"], "head": head, "base": base,
            "title": pr["title"], "description": pr.get("description", ""),
            "issue_key": key, "ticket": ticket, "diff": diff,
            "files": sorted({part["path"] for entry in files for side in ("new", "old")
                             if (part := entry.get(side)) and part.get("path")})}


def validate_report(report, context):
    if not isinstance(report, dict) or set(report) != {"summary", "findings", "limitations"}:
        raise ValueError("Invalid review object")
    if not isinstance(report["summary"], str) or not report["summary"].strip():
        raise ValueError("Missing review summary")
    if not isinstance(report["limitations"], list) or not all(isinstance(x, str) for x in report["limitations"]):
        raise ValueError("Invalid review limitations")
    if not isinstance(report["findings"], list) or len(report["findings"]) > 10:
        raise ValueError("Invalid findings count")
    for finding in report["findings"]:
        if not isinstance(finding, dict) or set(finding) != {"path", "line", "severity", "title", "evidence", "recommendation"}:
            raise ValueError("Invalid finding object")
        if finding["path"] not in context["files"]:
            raise ValueError("Finding path is outside the reviewed diff")
        if type(finding["line"]) is not int or finding["line"] < 1:
            raise ValueError("Invalid finding line")
        if finding["severity"] not in ("low", "medium", "high", "critical"):
            raise ValueError("Invalid finding severity")
        if not all(isinstance(finding[k], str) and finding[k].strip() for k in ("path", "title", "evidence", "recommendation")):
            raise ValueError("Empty finding text")
    if len(json.dumps(report).encode()) > 24_000:
        raise ValueError("Review exceeds comment size budget")


def analyze(context_file, report_file, model, run=subprocess.run):
    context = json.loads(Path(context_file).read_text())
    with tempfile.TemporaryDirectory(prefix="codex-cr-") as folder:
        work = Path(folder)
        (work / "context.json").write_text(json.dumps(context))
        schema = Path(__file__).with_name("review.schema.json")
        prompt = Path(__file__).with_name("prompt.md").read_text()
        output = work / "review.json"
        # Explicit allowlist: Bitbucket/Jira credentials and checkout settings never reach Codex.
        child_env = {"PATH": required(os.environ, "PATH"), "LANG": "C.UTF-8",
                     "CODEX_HOME": str(work / "codex-home"),
                     "CODEX_API_KEY": required(os.environ, "CODEX_API_KEY")}
        run(["codex", "exec", "--ignore-user-config", "--ignore-rules", "--ephemeral",
             "--sandbox", "read-only", "--skip-git-repo-check", "--model", model,
             "--output-schema", str(schema.resolve()), "-o", str(output), "-"],
            cwd=work, env=child_env, input=prompt + "\n\nUNTRUSTED REVIEW CONTEXT:\n" + json.dumps(context),
            text=True, check=True, timeout=600, stdout=subprocess.DEVNULL)
        report = json.loads(output.read_text())
        validate_report(report, context)
        Path(report_file).write_text(json.dumps(report, indent=2) + "\n")


def render(context, report):
    lines = [MARKER, "## Codex code review", f"Source: `{context['head']}`; destination: `{context['base']}`",
             report["summary"], ""]
    for finding in report["findings"]:
        lines.extend([f"### {finding['severity'].upper()}: {finding['title']}",
                      f"`{finding['path']}:{finding['line']}`", finding["evidence"], finding["recommendation"], ""])
    if not report["findings"]:
        lines.append("No findings reported within the supplied diff and ticket context.")
    lines.extend(["### Limitations", "Diff and selected ticket fields only; repository tests were not executed."])
    lines.extend("- " + limitation for limitation in report["limitations"])
    return "\n".join(lines)


def publish(context, report, env, bb, jira):
    validate_report(report, context)
    path = pr_path(env)
    if (context["workspace"], context["repo"], context["pr_id"]) != (env["BITBUCKET_WORKSPACE"], env["BITBUCKET_REPO_SLUG"], env["BITBUCKET_PR_ID"]):
        raise ValueError("Artifact repository identity does not match this pipeline")
    bot_uuid = required(env, "BITBUCKET_BOT_UUID")
    key = context.get("issue_key")
    jira_bot = required(env, "JIRA_BOT_ACCOUNT_ID") if key else None
    if key and (jira is None or key.split("-")[0] not in allowed_projects(env)):
        raise ValueError("Jira publication requires an allowed project and API client")
    current = bb("GET", path)
    if revision(current) != (context["head"], context["base"]):
        raise ValueError("PR changed before publication; rerun")
    if issue_key(current, env) != key:
        raise ValueError("Artifact ticket does not match the current PR ticket")
    body = render(context, report)
    existing = next((comment for comment in bb_pages(bb, path + "/comments?pagelen=100")
                     if not comment.get("deleted") and comment.get("user", {}).get("uuid") == bot_uuid
                     and MARKER in comment.get("content", {}).get("raw", "").splitlines()), None)
    # Recheck after scanning comment history; APIs do not offer an atomic SHA-conditional write.
    if revision(bb("GET", path)) != (context["head"], context["base"]):
        raise ValueError("PR changed before comment write; rerun")
    bb("PUT" if existing else "POST", path + "/comments" + (f"/{existing['id']}" if existing else ""),
       {"content": {"raw": body}})
    if key:
        marker = f"codex-cr:{context['workspace']}/{context['repo']}#{context['pr_id']}"
        comment_path = f"/rest/api/3/issue/{key}/comment"
        start = 0
        existing = None
        for _ in range(100):
            page = jira("GET", f"{comment_path}?startAt={start}&maxResults=100")
            existing = next((c for c in page["comments"] if c.get("author", {}).get("accountId") == jira_bot
                             and marker in adf_text(c.get("body")).splitlines()), None)
            if existing or start + len(page["comments"]) >= page["total"]:
                break
            if not page["comments"]:
                raise ValueError("Incomplete Jira comment pagination")
            start += len(page["comments"])
        else:
            raise ValueError("Excessive Jira comment pagination")
        current = bb("GET", path)
        if revision(current) != (context["head"], context["base"]):
            raise ValueError("PR changed before Jira comment write; rerun")
        if issue_key(current, env) != key:
            raise ValueError("PR ticket changed before Jira comment write; rerun")
        text = marker + "\nhttps://bitbucket.org/" + context["workspace"] + "/" + context["repo"] + "/pull-requests/" + context["pr_id"] + "\n" + body
        adf = {"type": "doc", "version": 1, "content": [{"type": "paragraph", "content": [
            {"type": "text", "text": line}]} for line in text.splitlines() if line]}
        jira("PUT" if existing else "POST", comment_path + (f"/{existing['id']}" if existing else ""), {"body": adf})


def clients(env):
    bb = Api("https://api.bitbucket.org/2.0", "Bearer " + required(env, "BITBUCKET_ACCESS_TOKEN"))
    jira = None
    if env.get("JIRA_BASE_URL"):
        auth = base64.b64encode((required(env, "JIRA_EMAIL") + ":" + required(env, "JIRA_API_TOKEN")).encode()).decode()
        jira = Api(env["JIRA_BASE_URL"], "Basic " + auth)
    return bb, jira


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("collect", "analyze", "publish"))
    parser.add_argument("--directory", type=Path, default=Path("review-artifacts"))
    args = parser.parse_args()
    folder = args.directory
    folder.mkdir(parents=True, exist_ok=True)
    context_file, report_file = folder / "context.json", folder / "review.json"
    if args.mode == "analyze":
        analyze(context_file, report_file, required(os.environ, "CODEX_MODEL"))
    else:
        bb, jira = clients(os.environ)
        if args.mode == "collect":
            context_file.write_text(json.dumps(collect(os.environ, bb, jira), indent=2) + "\n")
        else:
            publish(json.loads(context_file.read_text()), json.loads(report_file.read_text()), os.environ, bb, jira)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, KeyError, OSError, subprocess.SubprocessError):
        print("Review stage failed; check configuration, API permissions, artifact validity and PR revision. No successful review is claimed.", file=sys.stderr)
        sys.exit(1)
