# AI spike results (T-003)

**Status: not run yet.** This needs a developer `ANTHROPIC_API_KEY` (spec section 7: never committed, never in a release build).

```
ANTHROPIC_API_KEY=... pnpm eval            # all fixtures
ANTHROPIC_API_KEY=... LAQTA_AI_MODEL=<model id> pnpm eval
```

`tools/eval/run.ts` prints a table per fixture (schema valid, issue type, mustMention,
mustNotMention, language, latency, tokens) and exits non-zero below `EVAL_THRESHOLD`
(default 0.8, to be set by the product owner). Paste the table here with the average latency,
cost per request (from the token counts and the current price list) and the chosen model.

Also confirm item 10: the 1568 px long-edge limit against the current vision documentation.
