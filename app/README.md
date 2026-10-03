# Hardware Service Decision Copilot

This is the course's agent-built proof of concept, not a production claims system. A Polish-language assistant helps an employee prepare a preliminary complaint or return assessment from a form and one device photo, then answer follow-up questions using the saved case context and applicable policy references. The employee must verify the result; the app never issues a final customer decision.

The application implementation was written by AI coding agents. The trainer resumed interrupted agent sessions, performed final hands-on testing and curated realistic device photographs. The [implementation branch](https://github.com/LucasMatuszewski/jsystems-ai-dla-programistow-2026-09/tree/ready/tested-initial-assessment-and-chat-backend) and [open PR #3](https://github.com/LucasMatuszewski/jsystems-ai-dla-programistow-2026-09/pull/3) remain separate from `main` so participants can inspect the code and review discussion.

## Run locally

1. Use Node.js 24 and run `npm ci` in this `app/` directory. The tracked `package-lock.json` is the dependency lockfile.
2. Copy `.env.example` to an ignored `.env.local` on your own machine and set `OPENROUTER_API_KEY`; keep `LLM_MODEL=openai/gpt-6-luna` or configure a compatible model. Never commit credentials.
3. Run `npm run dev` and open `http://127.0.0.1:3000/`. The development server binds loopback, not a public interface.

On the trainer's W365 machine, Tailscale Serve owns external HTTPS port 3000. Run the app on an unused internal loopback port with `npx next dev --hostname 127.0.0.1 --port 3001`; the tailnet-only proxy maps `https://w365.azules-panga.ts.net:3000/` to `http://127.0.0.1:3001/`. Serve persists across restarts, but this development server must be running separately. Other devices on the tailnet may reach the app according to its Tailscale access policy; never enter customer personal data or use a production key without appropriate controls.

## Try the core flow

1. Choose **Reklamacja** or **Zwrot**, complete the Polish form and upload one suitable device photograph. The five original example images are in `../assets/example-images/`; their visual condition must not be assumed from filenames.
2. Select **Dalej**. The app prepares the photo, asks the configured model for image observations and a preliminary policy-grounded assessment, then opens the case chat.
3. Ask a follow-up in **Wiadomość**. The app sends the complete saved case and eligible conversation history, streams the answer and marks incomplete replies honestly. **Zatrzymaj odpowiedź** followed by **Ponów odpowiedź** retries the same employee turn without duplicating it.
4. Refresh the page or revisit `/chat/<caseId>` in the same browser to restore a saved case. **Nowa sprawa** starts a separate local case after confirmation.

The UUID is generated when an empty form opens; on a first visit it is not stored until a change is checkpointed. Cases live in that browser's `localStorage`, not in a server database. An ID alone cannot recover a case in another browser or on another device. Do not enter identifying customer data in text or photographs.

## Verify

Run `npm run test:unit`, `npm run test:integration`, `npm run lint` and `npm run typecheck` from `app/`. Integration tests require a running local app and normally target port 3000; when the app is on another loopback port, set `TEST_APP_ORIGIN=http://127.0.0.1:3001` for the integration command. This variable changes only the test HTTP target, never the application's public address. The repository's full E2E harness has Windows-specific runner checks; use the documented manual browser flow on other hosts. One trace-privacy unit test also requires native `pwsh` on Linux.

The recorded core browser smoke and screenshots are in the local ignored `verification-output/2026-10-03-core-smoke/`. Representative screenshots tracked for the PR are [empty form](../docs/screenshots/course-app-empty-form.png) and [completed chat](../docs/screenshots/course-app-completed-chat.png). [PRD](../docs/PRD.md), [ADRs](../docs/ADR/) and [implementation ledger](../docs/implementation/LEDGER.md) document requirements, decisions, verification and uncompleted formal acceptance gates.
