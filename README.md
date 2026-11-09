# Laqta

A tray app for Windows and macOS that turns a screenshot and one sentence into a reviewed Jira
Data Center bug, with the screenshot attached. The AI writes a draft; the reporter reviews every
field; only the app's Jira client writes to Jira, and only after **Create bug**.

- Spec: `doc/Dev Spec (AI-ready).md` (binding). Design boards: `doc/Laqta — UI Design (v0.1)-png/`.
- Agent rules: `AGENTS.md`. Developer guide and commands: `CLAUDE.md`.

## Try it locally (no Jira or AI needed)

```
npm i -g pnpm@12.18.0        # or prefix commands with: npx pnpm@12.18.0
pnpm install
pnpm test                    # unit + integration
pnpm test:e2e                # full flow against the mock Jira and the fake draft provider
```

To click through the real app against the mock Jira:

```
pnpm mock-jira               # terminal 1, http://127.0.0.1:4545
pnpm build && LAQTA_E2E=1 LAQTA_E2E_JIRA_URL=http://127.0.0.1:4545 \
  npx pnpm@12.18.0 --filter @laqta/app exec electron .   # terminal 2
```

Press `Ctrl+Shift+J` (`⌘⇧J` on macOS) or use the tray menu. In this mode drafts come from the fake provider and Jira is the mock. Use project `PROJ`, or `REQ` to see a required custom field. Type "assign Sara" to see the assignee picker.

## Against a real Jira and Claude (development build)

```
ANTHROPIC_API_KEY=... pnpm dev
```

Open Settings from the tray, enter the https Jira address and a personal access token, then click **Test connection** and **Save**. The direct Anthropic provider exists only in development builds. Release builds (`pnpm build:release`) use the gateway (`MAIN_VITE_GATEWAY_URL`).

## Gateway

`gateway/` is a Spring Boot 4 service (JDK 17): `POST /v1/draft` and `POST /v1/transcribe`, JWT
auth (`LAQTA_JWT_ISSUER_URI`), per-user rate limits and monthly cost caps. Run its tests with `pnpm gateway:test`. Run it locally with
`ANTHROPIC_API_KEY=... mvn -f gateway/pom.xml spring-boot:run -Dspring-boot.run.profiles=dev`.
