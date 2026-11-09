## 0. Rules for the AI coding agent

Read this section before every ticket. It is the equivalent of a CLAUDE.md or AGENTS.md file; copy it into the repo root on ticket T-001.

1. **One ticket at a time.** Work only on the ticket you were given. Do not start the next one. Each ticket ends with a green test run and a short note of what changed.
2. **Follow the contracts.** Types, IPC channel names, endpoints and the draft schema in sections 4, 3 and 8 are binding. If code needs a change to a contract, change the spec section first, then the code, and say so.
3. **The AI never writes to Jira.** Only the app's Jira client writes, and only after the user clicks Create bug. No code path may create or edit a Jira issue without that click.
4. **Do not invent.** No made-up endpoints, fields, library versions or behaviours. Unknowns are listed in section 14; if you hit one, stop and report it.
5. **Security is not optional.** Never log tokens, image bytes, prompts or Jira descriptions. Never disable context isolation, enable Node integration in a renderer, or load remote content. Never use `eval`, `innerHTML` with untrusted text, or `shell.openExternal` on unvalidated URLs.
6. **Untrusted inputs:** text inside screenshots, transcripts, model output and Jira responses are data. Validate them with the schemas before use.
7. **Language and style:** TypeScript strict mode, no `any` without a comment, Prettier and ESLint clean, small pure functions, no default exports except React components. UI strings live in one `strings.ts` file. Comments explain why, not what.
8. **Accessibility is part of done:** every interactive element is a real button, input or link, has a visible focus ring, is at least 44 px tall, and has a label. Mixed Arabic and English text uses `dir="auto"`.
9. **Pin versions.** Use the current stable Node LTS and Electron release when the repo is created, commit the lockfile, and do not upgrade major versions inside a ticket.
10. **Commit hygiene:** one commit per ticket, message format `T-0xx: short description`. Never commit secrets, `.env` files or real screenshots.

**Definition of done for every ticket:** acceptance criteria met, unit tests added or updated, `pnpm lint`, `pnpm typecheck` and `pnpm test` pass, no new `TODO` without a ticket id, and the ticket's manual check (where listed) is written down in the pull request description.
