Inspect this repository and propose a concise repo-level instruction file for the coding agent that the course actually uses. Define only rules justified by **this** scaffold; do not assume a language, test runner, package manager, user-level settings path, or agent syntax from a different course.


If this repository contains `course-materials/`, treat it as an inert teaching library. Application agents must not search or read it unless the user explicitly names a course material for this task. Example PRDs and ADRs there are not current product requirements or decisions. Put this boundary in the root agent instructions (and any tool-specific active instruction file), while allowing explicit user-directed course-material work.

First report the real repository structure and commands you verified. State which files contain the product brief, architecture decision, policies, tests and synthetic fixtures. Identify generated directories, secrets and data files that must stay out of Git. If a command cannot run in this environment, quote the exact failure and do not present it as verified.

Create a short root instruction file that tells an agent:

1. What this project is for, which source documents decide behavior, and which directories contain code versus exercises.
2. How to run the fast test, full test, lint/type check and application (using observed commands only).
3. How to scope work: inspect relevant code, state a small plan, keep changes tied to one acceptance criterion, and review the diff before a commit. Define an explicit pre-commit quality gate using only verified repository commands: required fast tests and lint/type checks must pass, the diff must contain only intended files, and failures block the commit.
4. How to test: write or update a behavior-focused test first where appropriate, observe its failure for the intended reason, implement the smallest change, rerun tests, and document any manual UI/API check.
5. How to handle model calls: use deterministic fixtures for repeatable tests, mark the optional live check, and avoid secrets or real participant/customer data in prompts and logs.
6. What blocks completion: failing required tests, unreviewed diff, an unverified claim, accidental generated/private files, or a change outside the agreed scope.

If frontend and backend truly have different commands or conventions, propose small nested instruction files. Keep shared rules in the root file and local rules near the relevant code. If this tool requires a different filename or import mechanism than another agent, explain that difference rather than copying a symlink recipe blindly. Show the complete proposed file(s), the observed commands/results, and one example of a task that would invoke the quality gate. Do not modify global configuration or install tools unless this exercise explicitly asks for it.
