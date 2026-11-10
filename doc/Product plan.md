# Laqta — Product and Design Plan (PM Plan)

Nov 9, 2026 · @Ayah Refai

## Summary and recommendation

The idea is feasible and high-value: one screenshot plus one sentence (typed or spoken) becomes a complete Jira bug with description, assignee and the image attached. **Recommendation: a lightweight desktop app (system tray) for Windows and macOS.** The AI drafts a structured bug, the user reviews it with one click, and the app creates it in Jira Data Center and attaches the screenshot.

Three findings changed the original design:

1. **A Chrome extension alone is not enough.** It only sees the browser, while the goal includes VS Code and any other application. An extension becomes an optional add-on later (it can supply the page URL and console errors).
2. **The official Jira MCP does not fit.** It is Cloud-only, and the team runs Data Center. Even on Cloud it has no tool for uploading attachments, so a bug created through it would have no screenshot. The app must upload the image itself through the Jira REST API.
3. **The AI should draft, not execute.** The AI reads the image and the sentence and returns a JSON draft. The app validates it, shows a preview, and writes to Jira deterministically. This guarantees the right assignee, required fields and attachment, and it limits the damage from prompt injection hidden in a screenshot.

Decision needed from the meeting: approve this architecture and settle the open questions at the end (most importantly the Claude licensing and Security approval).

## Decisions made

Four decisions from the first discussion set the scope, and each directly affects the design.

| Decision | Choice                             | Impact on the design |
| --- |------------------------------------| --- |
| Jira type | Data Center / Server (self-hosted) | Official Rovo MCP is unsupported. Use REST API v2 with a Personal Access Token per user. Descriptions use wiki markup, not ADF |
| Operating systems | Windows + macOS                    | Cross-platform framework. macOS needs Screen Recording and Microphone permissions. Code signing on both |
| Users | All of QA (internal product)       | Signed installer, auto-update, central config, Security approval, usage and cost limits |
| Prompt input | Text + voice, Arabic + English     | Speech-to-text must handle Jordanian dialect mixed with English technical terms. Bug text defaults to English and is configurable per user |

## Architecture options and recommendation

There are three separate technical decisions, each with a recommended option.

**1) Shape of the application**

| Option | Covers | Verdict |
| --- | --- | --- |
| Chrome extension only | The browser only | Rejected: cannot capture VS Code or other apps |
| Desktop app (tray) | Any window or screen | **Recommended** as the foundation |
| Desktop app + optional extension | Everything, plus browser context (URL, console, network errors) | Phase 3, if the team wants it |

Framework: **Electron + TypeScript** for the MVP. TypeScript lets any company developer contribute, and capture and global-hotkey libraries are mature. The Agent SDK is only needed if we later want agentic behaviour; the MVP draft call does not need it. Tauri is lighter but needs Rust and has a steeper learning curve. Final call belongs to the seniors.

**2) AI layer**

| Option | Pros | Cons |
| --- | --- | --- |
| `claude -p` (headless) called by the app | Fastest proof of concept. The image is passed as a file path | Every employee must install Claude Code, sign in and hold a license. Weak central control |
| Agent SDK or API embedded in the app | No extra install. Central key, monitoring, cost control, structured output | Needs an internal gateway and approval for key management |

Recommendation: start with `claude -p` in the spike to prove quality within days. For the official internal release, move to the SDK/API behind a central gateway.

Spike constraints: run `claude -p` from an empty temporary directory with only the Read tool allowed, JSON output and a JSON schema for the draft, because headless mode loads project settings and hooks from its working directory. The documented bare mode requires an API key rather than employee sign-in, so the spike uses a shared test key. The release path should call the Messages API with the image through the gateway: one vision call needs no agent loop, so no tools exist at all and the injection surface is smaller.

**3) How the bug is written to Jira**

| Option | Problem |
| --- | --- |
| AI executes through MCP | Official server is Cloud-only with no attachment upload. Community servers (for example sooperset/mcp-atlassian) support Data Center but need a security review and an attachment-tool check. Results are also non-deterministic |
| **AI returns a JSON draft, app writes through REST** | **Recommended.** Field validation, preview, attachment upload, safe retry and audit |

MCP stays an option for read-only lookups (users, projects, duplicates) if we want it.

## End-to-end flow

&#91;embedded content: end-to-end flow · 8 steps, 1 approval gate\]

The user triggers a capture, adds a request, and reviews the AI draft once. Only the Create click writes to Jira. Cancel or edit at the review step discards the screenshot with nothing created.

## Backend and integration design

The app owns every write to Jira; the AI only produces a draft. This section is for the backend seniors.

**Components:** capture module, draft service (AI call), Jira client (REST), central config, audit log. The draft service is the only part that talks to Claude.

**Draft contract.** The AI must return JSON matching a fixed schema; anything else is rejected and retried once.

| Field | Notes |
| --- | --- |
| summary | One line, under 120 characters, English |
| description | Sections: Environment, Steps to reproduce, Actual result, Expected result. Only what is visible in the image or said by the user; unknown parts marked "not provided" |
| issueType, priority | From the project's allowed values only |
| projectKey | From the user's default or the spoken request, validated against an allowlist |
| assigneeQuery | The name as spoken (Arabic or English). Resolved by the app, never trusted as an account |
| labels | Always includes `laqta` for adoption tracking |
| missingInfo | Questions the AI could not answer from the inputs, shown in the preview |

**Jira Data Center calls** (verify each against our exact DC version in the spike):

| Step | Endpoint |
| --- | --- |
| Auth | Personal Access Token as Bearer header, one per user, so the real user is the reporter. PATs need a recent Data Center release (reported as 8.14 or later, confirm), expire, and can be revoked, so onboarding needs token-creation steps, an expiry warning and a re-entry flow |
| Find valid assignee | `Assignable-user search for the project (/rest/api/2/user/assignable/search, parameters to confirm on our version). The app tries the spoken name as given, then an AI-supplied English transliteration, then the first-name fragment. Assign with the Data Center username field. Always list candidates when there is more than one` |
| Required fields | Per-project issue types, then the fields for one type (required, custom, allowed values), using the createmeta endpoints under /rest/api/2/issue/createmeta/{projectIdOrKey}/issuetypes. The legacy un-scoped createmeta endpoint is removed in Jira 9 and later and must not be used. Paginate. |
| Duplicate check | JQL search on recent open bugs with similar summary, shown as a warning in the preview |
| Create | `POST /rest/api/2/issue` |
| Attach screenshot | `POST /rest/api/2/issue/{key}/attachments` with header `X-Atlassian-Token: no-check`, multipart field named file. Check our Jira attachment size limit and downscale large PNGs; sanitize filenames |

**Rules that make it reliable**

- Ambiguous assignee (two matches) or no match: the preview asks the user to pick. The app never guesses.
- The app puts a reference to a deterministic filename in the description at creation time and uploads the screenshot under that name right after, so no update call is needed. Each create carries a unique label; after a timeout or unknown result the app searches Jira for that label before any retry, so a bug is never created twice. If only the attachment fails, retry the attachment only. The Create button is disabled while a request is in flight. The AI description is treated as untrusted text: the app strips wiki-markup macros, remote image embeds and non-allowlisted URLs, and inserts the only image reference itself.
- Required custom fields come from create-metadata. If one cannot be inferred, the preview asks for it.
- The model prompt treats any text inside the screenshot as data, never as instructions.
- Quality gate before pilot: an evaluation set of about 50 real screenshots with expected bugs, scored on summary accuracy, correct fields and zero invented facts.

## Frontend and UX design

The interaction must take seconds and never feel risky. The principle: fast to capture, one deliberate review, then done.

1. **Trigger:** a global hotkey (configurable, for example Ctrl/Cmd+Shift+J) or the tray icon. Capture only starts on an explicit action, with a visible indicator.
2. **Capture:** drag to select a region, or one key for the active window or the full screen. Must handle multi-monitor and high-DPI scaling on both OSes.
3. **Annotate:** rectangle, arrow, text, and **blur/redact**. Redacting sensitive data is one click, because screenshots of internal systems often contain customer data.
4. **Prompt:** a small box beside the screenshot. Type, or hold a key to speak. Quick chips for common intents (UI bug, backend error, duplicate of last bug). Arabic input is right-to-left aware.
5. **Preview card:** editable summary, description, project, type, priority, assignee (with avatar), labels, thumbnail, and any duplicate warning or missing-info question. Buttons: Create, Edit, Cancel.
6. **Result:** a toast with the issue key, an Open in Jira link, and a copy-link button. Failures say exactly what failed and offer retry.

**Context captured automatically** (shown in the preview so the user can remove it): active application name, window title, OS and version, timestamp. The page URL needs the optional browser extension.

**Voice.** The browser Web Speech API is not dependable inside a desktop shell, so use a dedicated speech-to-text service or a local model. Accuracy on Jordanian Arabic mixed with English technical terms must be tested on real recordings before we commit. If audio must stay on-premise, a local model is the fallback.

**Settings:** hotkey, default project, default language, microphone, Jira URL and token (stored in the OS keychain), privacy toggles.

**Accessibility:** target WCAG 2.1 AA: full keyboard flow with visible focus and a logical tab order, focus trap in dialogs, screen-reader announcements for draft ready and errors, mixed Arabic and English text handled with automatic text direction, 4.5:1 text contrast, controls at least 44 px, and no meaning by colour alone.

## Security, privacy and governance

This is an internal product for the whole company that sends screen content to an external AI service, so Security approval is a gate, not a formality.

| Risk area | Control |
| --- | --- |
| Sensitive data in screenshots (secrets, personal data, customer data) | Mandatory review step, one-click redaction using an opaque fill or coarse pixelation applied to the pixels before upload (the original is never sent or stored, metadata is stripped), a clear notice and a confirm if nothing was redacted, and a later automatic check for tokens, keys and card-like numbers |
| Data sent to the AI provider | Confirm the plan, data-retention terms and region with Security and Legal before the pilot. Send only the cropped image and the user's sentence |
| Local storage | Screenshots live in a temporary folder and are deleted after upload or cancel. No history by default |
| Credentials | Personal Access Token stored in Windows Credential Manager or macOS Keychain, never in plain files or logs. The AI key lives on the gateway, not on laptops |
| Prompt injection from the image | The AI has no tools in draft mode. The app validates every field against allowlists (projects, issue types, real users), and a human confirms |
| Permissions | Each bug is created with the user's own token, so Jira permissions and the reporter field stay correct |
| Auditability | Log metadata only (user, project, issue key, time, model version), not image content |
| Abuse and cost | Per-user rate limits and a monthly cost cap, set at the gateway |
| Supply chain | Code-signed Windows installer, notarized macOS build, signed auto-updates, central kill switch |

Ownership: Security owns the approval, DevOps owns distribution and the gateway, and a named product owner owns roadmap and support.

**Additional controls to specify before the pilot**

- **Legal:** confirm with Legal whether personal data of employees, customers or partners in screenshots falls under Jordan's personal data protection rules or any customer or sector contracts. Record the retention and training-use terms of the chosen Claude plan, and require zero retention if offered.
- **Desktop hardening:** context isolation on, Node integration off, strict content security policy, no remote content, tokens in the OS keychain, signed auto-updates with staged rollout, rollback and a minimum-version check against central config.
- **Telemetry:** counts and timings only, never content, with the opt-out documented. Retention period to be set with Security.
- **Cost:** measure tokens and cost per request in the spike before any cap is set.

## Requirements and acceptance criteria

Targets below are proposals to validate in the pilot, not measured facts.

| ID | Requirement | Acceptance criterion |
| --- | --- | --- |
| FR1 | Capture a region, window or full screen by global hotkey on Windows and macOS | Works on multi-monitor and high-DPI setups on both OSes |
| FR2 | Annotate and blur before sending | Redacted areas are opaque or coarsely pixelated in the uploaded file, and the original pixels are never sent |
| FR3 | Prompt by text or voice, Arabic or English | Voice transcript is shown and editable before the AI call |
| FR4 | AI returns a schema-valid draft | Invalid output is rejected and retried once, then the user is told |
| FR5 | Preview and edit every field before creation | Nothing is written to Jira without an explicit Create click |
| FR6 | Resolve assignee against assignable users | Ambiguous or missing match forces a user choice |
| FR7 | Create the bug and attach the screenshot | Issue key returned; attachment retry never creates a duplicate bug |
| FR8 | Duplicate warning | Similar open bugs listed in the preview as a warning only (fuzzy text match) |
| NFR1 | Speed | Proposed: hotkey to created bug in under 30 seconds at the median |
| NFR2 | Draft quality | Proposed: at least 80% of drafts need no or only trivial edits on the 50-screenshot evaluation set, with zero invented facts |
| NFR3 | Security | Security sign-off, signed builds, no plain-text secrets |
| NFR4 | Reliability | Clear errors and retry on network, VPN or Jira failures |

- **NFR5, connectivity:** if Jira is unreachable, the draft is kept encrypted locally for a short, configurable period and the app offers Retry. The app honours system proxies and the corporate root certificate, retries 429 and 5xx responses with backoff, and shows Jira rate limits to the user.
- **NFR6, accessibility:** WCAG 2.1 AA on every screen, including keyboard-only use and right-to-left text.
- **Evaluation set:** the 50-screenshot set needs a named owner who labels the expected bugs and a named reviewer who scores the drafts.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Jira MCP cannot attach images | Bugs created without the screenshot | App uploads through REST; MCP not used for writes |
| Wrong assignee or project | Bug lands with the wrong person | Assignable-user lookup, allowlist, mandatory preview |
| AI invents details not in the image | Misleading bug reports | Strict prompt, "not provided" for unknowns, evaluation set, human review |
| Sensitive data leaves the company | Privacy and compliance incident | Blur tool, notice, Security approval, data-retention terms confirmed first |
| Prompt injection via text in screenshots | Unwanted actions | No tools for the AI, field validation, human confirmation |
| Arabic voice accuracy | Frustrating dictation | Test on real recordings early; typed input always available |
| Claude licensing and cost for all staff | Budget or access blocker | Decide gateway/API model early; per-user caps |
| Data Center version differences | Endpoints behave differently | Verify every endpoint in the spike on our exact version |
| Cross-platform capture edge cases | Wrong crop or black screen | Early test matrix: OS versions, monitors, scaling, protected windows. macOS: Screen Recording and Microphone permission guide, restart after granting, hardened runtime and notarization. Windows: protected windows capture black and need a clear message. Test hotkey conflicts and the Arabic keyboard layout |
| Required custom fields per project | Create fails | Read create-metadata and ask in the preview |
| No owner after launch | Tool rots | Name a product owner and support channel before rollout |

## Success metrics

Measured from the `laqta` label and app logs, reviewed after the pilot.

| Metric | What it tells us |
| --- | --- |
| Median time from hotkey to created bug | Whether it beats manual bug filing |
| Share of drafts created without edits | Draft quality |
| Bugs with screenshot attached | Attachment path works end to end |
| Weekly active users per team | Adoption |
| Bugs reopened or rejected for missing info | Whether the bug quality is actually better |
| Cost per created bug | Whether the AI spend is sustainable |

## Roadmap

&#91;embedded content: roadmap · 4 phases, 3 gates\]

Phases are equal bands, not drawn to scale. Durations are rough PM estimates for the seniors to challenge, and no phase starts until its gate is passed.

## Open questions for the seniors, DevOps and Security

- [ ] Blocks pilot: which exact Jira Data Center version do we run, and are Personal Access Tokens enabled?
- [ ] Blocks pilot: is the Jira REST API reachable from every laptop (VPN, network rules)?
- [ ] Blocks pilot: Claude licensing: will the company provide an API key or enterprise plan, and what are the data-retention and region terms? Security and Legal must approve before the pilot.
- [ ] Blocks pilot: may we run an internal AI gateway, and who owns it?
- [ ] Which projects go first, and what required fields or workflows does each have?
- [ ] What language should bug text be written in? Proposed: English, with Arabic input accepted.
- [ ] Speech-to-text: is a cloud service acceptable for audio, or must it run locally?
- [ ] Blocks pilot: do we have code-signing certificates and an MDM or software-distribution channel for Windows and macOS?
- [ ] Who is the product owner, and which channel handles support?
- [ ] Do we need the optional browser extension (URL and console errors), and when?
- [ ] Should duplicate detection block creation or only warn?
- [ ] Electron or Tauri: which does the frontend senior prefer?

## Sources

- [Atlassian community: Rovo MCP has no attachment upload](https://community.atlassian.com/forums/Atlassian-Remote-MCP-Server/Allow-image-attachments-when-creating-Jira-issues-via-MCP/m-p/3241214)
- [Atlassian developer community: no attachment tool in Rovo MCP](https://community.developer.atlassian.com/t/rovo-mcp-server-no-attachment-upload-tool-and-description-drops-adf-media-nodes-on-edit/101278)
- [Atlassian Rovo MCP supported tools](https://support.atlassian.com/atlassian-rovo-mcp-server/docs/supported-tools/)
- [Jira MCP explained (official server is Cloud-only)](https://community.atlassian.com/forums/App-Central-articles/Jira-MCP-Explained-What-It-Does-What-It-Doesn-t-and-How-to-Use/ba-p/3241874)
- [Community MCP servers with Data Center support](https://dev.to/grove_chatforest/atlassian-mcp-server-jira-and-confluence-access-for-ai-agents-2158)
- [Claude Code headless mode](https://docs.claude.com/en/docs/claude-code/headless)

Also: [Claude Code headless mode](https://code.claude.com/docs/en/headless) and the Atlassian page on the removal of the legacy createmeta endpoint (link to be added).

The Jira REST endpoint details in the backend section come from general knowledge of the Data Center API and must be verified on our version.
