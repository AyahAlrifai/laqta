// T-033 evaluation harness (spec section 12). Runs the provider over fixtures/ and prints,
// per fixture: schema validity, issue type, mustMention, mustNotMention (invented facts),
// language, latency and token usage. Exits non-zero below EVAL_THRESHOLD.
//
//   ANTHROPIC_API_KEY=... pnpm eval

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { DirectAnthropicProvider } from '../../app/src/main/ai/direct-anthropic';
import { requestDraft } from '../../app/src/main/ai/draft-service';
import { BugLanguageSchema } from '../../app/src/shared/schemas';
import type { BugDraft } from '../../app/src/shared/types';

const FixtureSchema = z.object({
  prompt: z.string(),
  bugLanguage: BugLanguageSchema,
  allowed: z.object({ issueTypes: z.array(z.string()), priorities: z.array(z.string()) }),
  mustMention: z.array(z.string()),
  mustNotMention: z.array(z.string()),
  expectedIssueType: z.string(),
  context: z
    .object({ appName: z.string().nullable(), windowTitle: z.string().nullable(), os: z.string() })
    .optional(),
});

const dir = join(__dirname, '..', '..', 'fixtures');
const threshold = Number(process.env.EVAL_THRESHOLD ?? 0.8);
const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
if (apiKey === '') {
  console.error('Set ANTHROPIC_API_KEY (development key only).');
  process.exit(2);
}

function draftText(d: BugDraft): string {
  return [d.summary, d.environment, ...d.stepsToReproduce, d.actualResult, d.expectedResult]
    .join('\n')
    .toLowerCase();
}

function isArabic(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  const arabic = text.match(/\p{Script=Arabic}/gu) ?? [];
  return letters.length > 0 && arabic.length / letters.length > 0.5;
}

async function main(): Promise<void> {
  const provider = new DirectAnthropicProvider({
    apiKey,
    model: process.env.LAQTA_AI_MODEL,
    fetch: (u, i) => fetch(u, i),
  });
  const names = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
  const rows: string[] = [];
  let passed = 0;
  let totalMs = 0;
  for (const name of names) {
    const fixture = FixtureSchema.parse(
      JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')),
    );
    const image = new Uint8Array(readFileSync(join(dir, `${name}.png`)));
    const started = Date.now();
    let draft: BugDraft | null = null;
    let error = '';
    try {
      draft = await requestDraft(
        provider,
        {
          imagePng: image,
          prompt: fixture.prompt,
          context: fixture.context ?? { appName: null, windowTitle: null, os: 'win32 10' },
          bugLanguage: fixture.bugLanguage,
          allowed: fixture.allowed,
        },
        AbortSignal.timeout(60_000),
        null,
      );
    } catch (e) {
      error = e instanceof Error ? e.message : 'error';
    }
    const ms = Date.now() - started;
    totalMs += ms;
    const text = draft ? draftText(draft) : '';
    const checks = {
      schema: draft !== null,
      type: draft?.issueType === fixture.expectedIssueType,
      mention: fixture.mustMention.every((m) => text.includes(m.toLowerCase())),
      invented: !fixture.mustNotMention.some((m) => text.includes(m.toLowerCase())),
      language: draft !== null && (fixture.bugLanguage === 'ar') === isArabic(draft.summary),
    };
    const ok = Object.values(checks).every(Boolean);
    if (ok) passed++;
    const mark = (b: boolean) => (b ? 'yes' : 'NO');
    rows.push(
      `| ${name} | ${mark(checks.schema)} | ${mark(checks.type)} | ${mark(checks.mention)} | ${mark(checks.invented)} | ${mark(checks.language)} | ${String(ms)} | ${error} |`,
    );
  }
  const score = names.length === 0 ? 0 : passed / names.length;
  console.log('| Fixture | Schema | Type | Mentions | No invention | Language | ms | Error |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) console.log(r);
  console.log(
    `\nPassed ${String(passed)}/${String(names.length)} (${(score * 100).toFixed(0)} %), average ${String(Math.round(totalMs / Math.max(names.length, 1)))} ms. Threshold ${String(threshold * 100)} %.`,
  );
  process.exit(score >= threshold ? 0 : 1);
}

void main();
