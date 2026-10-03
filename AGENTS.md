# Repository Guidelines

## Project

This is a **course project** for the "AI dla programistów - od pomysłu do MVP" training organized by JSystems, 5 days (28.09-02.10.2026), remote on cloud VMs. The primary taught agent is OpenAI Codex CLI, with Claude Code and GitHub Copilot as covered alternatives. The app is a multimodal AI assistant built live during the course. The domain, tech stack, and architecture are decided by the group through a structured process: research → PRD → ADR → implementation with agents.

This is only the **base starting repository** for the course; concrete decisions are made live with the group.

All user-facing text in **Polish** on chat. Repo docummentation always in English.

**Key docs** (created during the course — load only when in doubt):
- `docs/PRD.md` — product requirements and acceptance criteria
- `docs/ADR/` — Architecture Decision Records
- `docs/design-guidelines.md` — design system and tokens

---

## Repository Layout

```
app/                 Application built during the course (start: empty scaffold)
assets/              Design tokens, logo, favicon
docs/                PRD, ADR, design system
course-materials/    Notes, scripts, examples, research
```

**Do not read `course-materials/` on your own.** It holds teaching examples from this and earlier courses: sample PRDs, ADRs, prompts and agent instructions. They are not requirements or conventions for this app. Do not browse, search or index it during normal work; open a file there only when the user names it or asks for course material.

---

## Agent Workflow

### When implementing new or refactoring functionality
1. Read the relevant PRD and ADR files for the affected area.
2. Define the expected behavior from the specification before writing or changing any code.

### TDD Rules
For every feature and bug fix:
1. Start from the specification, not the existing implementation.
2. Write or extend tests **before** production code.
3. Run the new tests and confirm they fail for the expected reason.
4. Implement the minimum code needed to make them pass.
5. Run the full verification suite for the changed scope.
6. Refactor only while tests stay green.
7. **Manually validate the running application** (see Manual QA below). Automated tests — especially E2E — can produce false passes; a task is not done until the real app has been exercised by hand.

If the area has no suitable test infrastructure yet, add it as part of the task — do not silently skip tests.

### Manual QA (required after every task that affects the running app)

Use **the Playwright CLI** to drive the real running app like a human tester:

1. Start the app (`npm run dev`) and open it in the browser.
2. Take a screenshot of every screen you touched.
3. Exercise the real flow end-to-end by hand: fill the form, upload the image, submit, follow the navigation to the chat, send a message — whatever the changed scope covers.
4. Verify the flow actually works: correct navigation, correct data displayed, no console errors, Polish UI text.
5. **Compare your screenshots against the brand reference** (`assets/homepage.png` + `docs/design-guidelines.md` tokens): colors, typography (Manrope), spacing, button styles, logo placement must match our brand look.
6. Report what you validated (steps + screenshots) in your task summary. If anything looks or behaves wrong, fix it before committing.

### Verification (required before every commit)

Verify only the scope relevant to your change. If the change affects runtime behavior, confirm the app starts correctly.

**Test Strategy:**
| Type | Mocks | Who |
|---|---|---|
| Unit | All deps | be/fe-dev |
| Integration | Only external LLM API | be-dev |
| E2E | NOTHING (real stack) | qa-engineer |

**Verification:** Always start the app before committing. Tests passing ≠ app working. Automated E2E results are not sufficient proof — always finish with the Manual QA step above.

**Env Vars:** See `.env.example` (OPENROUTER_API_KEY required)

### Commit Rules
- Commit only after verification passes and the changed scope is in a working state.
- Keep commits focused: one logical change per commit.
- Format: `Area: short summary` (e.g. `Backend:`, `Frontend:`, `Docs:`)
- Do **not** push to remote unless the user explicitly asks.

### Git Worktrees
Agents tend to create a new git worktree whenever they touch another branch, and then leave it behind. Each one is a second copy of the repository, usually with its own dependency install, so they fill the disk quickly.
- Work in this checkout and switch branches (`git switch <branch>`). Do not create a worktree by default.
- Create a worktree only when the user asks for one, or when another agent is working in this same checkout at the same time. Ask first.
- Remove a worktree as soon as its branch is pushed or merged, always with `git worktree remove <path>` (not by deleting the folder), then `git worktree prune`. Check `git worktree list` before you finish.

Claude Code enforces the "ask first" part: `permissions.ask` in [.claude/settings.json](.claude/settings.json) makes it stop for confirmation before `git worktree add` and before its built-in worktree tool. JSON has no comments, so the reason is written here. Other agents only have this instruction.

### Completion Criteria
A task is complete only when:
- Implementation matches the relevant PRD, ADR, and design guidance
- Tests were written first and pass honestly
- Verification for the changed scope passed with no errors or warnings
- Manual QA was performed on the running app (Playwright MCP/CLI, screenshots, flow exercised, brand visual check against the app's own brand reference)
- The commit message is focused and the repository is in a consistent, reviewable state
