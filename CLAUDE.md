# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

The code for every ticket from T-001 to T-073 is written. Lint, typecheck, unit and integration tests, the Playwright E2E suite and the gateway tests all pass. What is **not** done needs people or infrastructure:

- The spikes have not run (T-002 Jira sandbox, T-003 Anthropic key, T-004 Windows/macOS test machines). Their scripts and result templates are in `tools/spike/`, `tools/eval/` and `docs/spike-*.md`. Until they run, section 14 assumptions are unverified, even though the code follows the spec.
- Signing, notarization and the update feed (T-053) need the certificates, Apple ID and runners (section 14, item 13).
- The T-062 word error rate needs the 50 recorded clips, and D-STT has to pick a speech service (`/v1/transcribe` answers 501 until then).
- D-AUTH: the gateway validates JWTs from `LAQTA_JWT_ISSUER_URI`, but the app does not send a token yet (`authHeader` returns null).

Contract additions made during the build are in spec sections 2.1, 3.1, 4.1, 8.1 and 11.1 and section 14 item 14. Planning material lives in `doc/`:

- `doc/Dev Spec (AI-ready).md`: **the binding build spec.** Read it before any work. Section numbers below (§N) refer to it.
- `doc/Product plan.md`: PM plan with the reasons behind the decisions, the risks and the open questions. It is background reading, not a contract.
- `doc/Laqta — UI Design (v0.1).html` and the `-png/` folder: the five design boards (1280×800) that are the visual source of truth for the UI (§9). Online copy: https://claude.ai/artifact/3QSPxbpnD3FJJz3JXshHHo

Laqta is an Electron tray app for Windows and macOS. It turns a screenshot plus one sentence into a reviewed Jira bug (Data Center, or Cloud since §8.2) with the screenshot attached. The AI writes a JSON draft, the user reviews it, and only the app's Jira client writes to Jira.

## How work is done here

- Work is split into tickets (T-001 … T-073, §13). Do **one ticket at a time** and only start one once everything in its "Needs" column is done. Use one commit per ticket, with the message `T-0xx: short description`.
- T-001 bootstraps the repo and copies §0 verbatim into `AGENTS.md`. Once that file exists, it holds the agent rules. Keep it and this file consistent.
- **Do not invent** endpoints, fields, library versions or behaviour. Anything in §14 (the spike checklist) is unverified until spike tickets T-002 to T-004 confirm it in `docs/spike-*.md`. If you run into an unknown, stop and ask.
- The contracts in §3 (IPC channels, state machine), §4 (types) and §8 (Jira calls, create body, wiki format) are binding. To change one, edit the spec first, then the code, and tell the user.
- Definition of done: the acceptance criteria are met, tests are added, `pnpm lint`, `pnpm typecheck` and `pnpm test` all pass, and there is no `TODO` without a ticket id.

## Commands

Node 26 LTS (`.nvmrc`), pnpm 12.18.0 (`packageManager` field; if pnpm is not installed, `npx pnpm@12.18.0 <cmd>` works). CI is GitLab (§11).

```
pnpm install --frozen-lockfile   # app postinstall runs `install-electron` (checksum-verified binary download)
pnpm lint            # ESLint (typed, strict) + Prettier check + tools/check-todos.js
pnpm typecheck       # tsc for main, renderer, gateway-contract and tools
pnpm test            # Vitest: unit + integration against the mock Jira server (app/test/mock-jira.ts)
pnpm test:e2e        # builds, then Playwright for Electron; LAQTA_E2E=1 swaps in the fake provider and mock Jira
pnpm dev             # electron-vite dev (macOS: as Laqta.app, see below)
                     # AI in dev: ANTHROPIC_API_KEY=... (direct API), or LAQTA_AI_PROVIDER=claude-code
                     # (your own Claude Code login via `claude -p`, no API key; LAQTA_CLAUDE_PATH overrides the CLI path) (set ANTHROPIC_API_KEY for real drafts; dev builds only)
pnpm build           # dev build (includes the direct provider)
pnpm build:release && pnpm check:release   # release build, proves no ANTHROPIC_API_KEY in the bundle
pnpm dist:win | pnpm dist:mac              # electron-builder (needs signing variables)
pnpm mock-jira       # standalone mock Jira on :4545 (token e2e-token)
pnpm eval            # T-033 eval over fixtures/ (needs ANTHROPIC_API_KEY)
pnpm spike:jira      # T-002 spike against a sandbox (JIRA_URL, JIRA_PAT, JIRA_PROJECT)
pnpm fixtures        # re-render the 20 synthetic fixture screenshots
pnpm icon            # re-render app/build/icon.png (electron-builder derives .icns/.ico from it)
pnpm wer             # T-062 word error rate (WER_CLIPS, GATEWAY_URL)
pnpm gateway:test    # mvn test for the Spring Boot gateway (JDK 17)
pnpm audit --prod
```

Single test: `pnpm --filter @laqta/app exec vitest run <path> -t "<name>"`. E2E screenshots of every step: `LAQTA_SHOTS=<dir> pnpm test:e2e`.

Version notes: TypeScript is pinned to 6.0.x because typescript-eslint supports `<6.1`. pnpm enforces a minimum release age, so pin versions that are at least a few days old instead of adding `minimumReleaseAgeExclude` entries. Only `get-windows` may run an install script (`allowBuilds`).

## Running the app locally (macOS)

- Start the built app: `pnpm start` (builds, then runs). On macOS, `pnpm dev` and `pnpm start` go through `tools/dev-bundle.cjs`, which runs a renamed copy of Electron.app (`app/.dev/Laqta.app`, git-ignored) so the Dock, the app menu and Cmd+Tab show "Laqta" with its icon. Development runs keep the Dock icon (clicking it acts like the tray click); release builds are menu-bar only (`LSUIElement`).
- Single instance: launching again makes the running copy show Settings (or focus the active session), then the new copy exits. Settings also opens at start-up while Jira is not configured.
- On notched Macs the tray icon is often hidden when the active app has long menus. Use the hotkey or relaunch instead.
- Default capture hotkeys are `Control+Shift+J` and `Control+Shift+W` (⌘⇧J is Notion AI's global shortcut and does not show up as a registration conflict).
- Stop it with `pkill -f "\.app/Contents/MacOS/Electron"`. That matches both the Laqta dev copy and the stock Electron.app, whose pnpm store path contains a version suffix, so narrower patterns can miss the process. A stale process keeps old main-process code while renderers load the new build, which crashes pages.
- Logs: `~/Library/Application Support/Laqta/logs/laqta.log` (metadata only). Settings: `settings.json` in the same folder.
- E2E mode (never in packaged builds): `LAQTA_E2E=1` uses the fake provider and synthetic frames; `LAQTA_E2E_JIRA_URL` points at the mock, `LAQTA_E2E_JIRA_DEPLOYMENT=cloud` switches it to Cloud, and `LAQTA_E2E_USER_DATA` isolates settings. Playwright triggers captures through `globalThis.__laqtaE2E.capture(mode)`, because it cannot press global hotkeys. `app.close()` hangs while a session is editing, because of the discard confirm.

## Architecture (big picture)

Layout, §2 and §2.1: workspace packages `app` and `gateway-contract`, plus `gateway/` (Spring Boot 4, Maven). `app/src/main/app.ts` is the composition root and effect runner; renderers are `overlay/`, `workbench/` (hosting `editor/` and `review/`), `toast/` and `settings/`.

- **The main process owns all I/O**: capture, network (`net.fetch`, so the system proxy and corporate certificates work), disk and secrets (`safeStorage`). Renderers never touch the network or the disk. Their CSP sets `connect-src 'none'`.
- **The preload script** exposes only `window.laqta`, a typed wrapper over the IPC channels in `src/shared/ipc-channels.ts`. `main/ipc-guard.ts` (pure, tested) checks the sender frame and validates every payload with Zod; the handlers are registered in `registerIpc()` in `main/app.ts`. Every handler answers `{ ok, value | error }`; the preload passes that envelope through and `renderer/shared/api.ts` unwraps it, because errors thrown across `contextBridge` lose their fields.
- **Orchestrator** (`main/orchestrator.ts`): a pure function `(state, event) => { state, effects }` plus an effect runner. States are idle → capturing → editing → drafting → reviewing → submitting → (verifying | partial | done). Every row of the §3 table needs a unit test, and none of those tests may need Electron. Only one session is active at a time.
- **Windows**: one overlay per display showing a frozen frame, one Workbench window (Annotate & Ask, then Review, in the same window so the draft stays in memory), plus small Toast and Settings windows. All of them come from the hardened factory in `windows.ts` (§10).
- **AI** (`main/ai/`): the `DraftProvider` interface. `DirectAnthropicProvider` and `ClaudeCodeProvider` (runs the local `claude -p` with the developer's login; no tools, MCP or hooks; image passed on stdin) are dev-only, chosen in `ai/dev-provider.ts`. `DirectAnthropicProvider` is dev-only (key in `ANTHROPIC_API_KEY`, forced `submit_bug_draft` tool used as a structured-output channel, Zod validation, one retry) and must never ship in release builds. CI fails if the bundle contains `ANTHROPIC_API_KEY`. `GatewayProvider` is the release path. Every model text field goes through `sanitize.ts`, which neutralises Jira wiki markup.
- **Jira** (`main/jira/`): REST API v2 with wiki markup (not ADF). Data Center uses a Bearer PAT; Jira Cloud (§8.2, `Settings.jiraDeployment`) uses Basic email:apiToken, `accountId` assignees and `/rest/api/3/search/jql`. The mock server has both modes. The create POST goes out on a fresh session partition because Chromium resends POSTs on reset reused sockets (§8.1). The app builds the description from the approved fields in `wiki.ts`. It never takes the description from the model as one string. `create-bug.ts` makes the create idempotent by adding a `laqta-<requestId>` label, never retries the create automatically, searches for that label in a `verifying` step when the outcome is unknown, and on an attachment-only failure returns `partial` with a retry that only re-uploads the image.
- **Effects run after the transition**: `dispatch()` in `app.ts` applies the pure transition, then runs each effect in a microtask. IPC handlers that need a result (`draft:request`, `jira:createBug`, `jira:retryAttachment`) create a deferred on the session before dispatching, and the effect resolves it.
- `strings.ts`, `wiki.ts` (description builder, re-exported by `main/jira/wiki.ts`) and `fields.ts` live in `src/shared/` because main and renderers both use them.
- Shared types and Zod schemas live in `src/shared/` (`types.ts`, `schemas.ts`) and are the single source of truth for every external payload.

## Non-negotiable invariants (each one maps to a test)

- Nothing is written to Jira without the user's **Create bug** click, and the AI never writes to Jira.
- Redaction is destructive: `renderFinalPng()` overwrites the pixels inside each redaction rectangle and then discards the original bytes. Unredacted pixels are never sent or stored. With zero redactions, a confirm dialog appears first, unless the user turned it off with "Don't ask me again" (`Settings.confirmNoBlur`, default true, §5).
- A failed attachment upload never creates a second bug. An ambiguous assignee always forces the user to pick.
- Never log tokens, image bytes, prompts, summaries or descriptions. `log.ts` rejects them. The PAT never reaches the renderer or the gateway. If `safeStorage` is unavailable, refuse to store the token rather than falling back to plain text.
- Text inside screenshots, model output and Jira responses is untrusted data. Validate it with the Zod schemas before use.
- Never disable `contextIsolation`/`sandbox`, never enable `nodeIntegration`, never load remote content, never use `eval` or `innerHTML` on untrusted text, and never call `shell.openExternal` on unvalidated URLs.

## Code conventions (§0, §9)

- TypeScript strict. No `any` unless a comment justifies it. No default exports except React components. Small pure functions. Comments explain _why_.
- React with plain CSS modules (no UI kit) and Zustand for UI-only state. Colour and spacing tokens live in `shared/styles/tokens.css`.
- Every UI string goes in `strings.ts` under a stable key. Never build sentences by concatenation.
- Accessibility is part of done: real buttons, inputs and links, a visible 3 px accent focus ring, controls at least 44 px tall, labels on everything, and `dir="auto"` on text that can mix Arabic and English. When `uiLanguage` is Arabic, the whole UI switches to RTL.
- Pin versions, commit the lockfile, and don't upgrade a major version inside a ticket. Never commit secrets, `.env` files or real screenshots. Fixtures must be synthetic or fully redacted.
