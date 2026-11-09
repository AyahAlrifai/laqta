// T-062 word error rate on the voice clip set (spec section 6, quality gate).
//
//   WER_CLIPS=/path/to/clips GATEWAY_URL=https://gateway GATEWAY_TOKEN=<jwt> pnpm wer
//
// The clip folder holds pairs `<name>.webm` + `<name>.txt` (the reference transcript, typed
// by a person). Clips are company recordings and are never committed. The script prints WER
// per clip and overall; the pilot threshold is set with the product owner.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Normalised words: lower case, punctuation removed, Arabic letter variants unified. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w !== '');
}

/** Levenshtein distance over words divided by the reference length. */
export function wer(reference: string, hypothesis: string): number {
  const r = words(reference);
  const h = words(hypothesis);
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const row = [i];
    for (let j = 1; j <= h.length; j++) {
      const cost = r[i - 1] === h[j - 1] ? 0 : 1;
      row.push(Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost));
    }
    prev = row;
  }
  return (prev[h.length] ?? 0) / r.length;
}

async function main(): Promise<void> {
  const dir = process.env.WER_CLIPS ?? '';
  const gateway = process.env.GATEWAY_URL ?? '';
  if (dir === '' || gateway === '') {
    console.error('Set WER_CLIPS and GATEWAY_URL (and GATEWAY_TOKEN if the gateway needs it).');
    process.exit(2);
  }
  const clips = readdirSync(dir)
    .filter((f) => f.endsWith('.webm'))
    .sort();
  let totalErrors = 0;
  let totalWords = 0;
  console.log('| Clip | Words | WER |\n| --- | --- | --- |');
  for (const clip of clips) {
    const name = clip.replace(/\.webm$/, '');
    const reference = readFileSync(join(dir, `${name}.txt`), 'utf8');
    const form = new FormData();
    form.append(
      'audio',
      new Blob([new Uint8Array(readFileSync(join(dir, clip)))], { type: 'audio/webm' }),
      clip,
    );
    form.append('language', process.env.WER_LANGUAGE ?? 'ar-JO');
    const headers: Record<string, string> = {};
    if (process.env.GATEWAY_TOKEN) headers.Authorization = `Bearer ${process.env.GATEWAY_TOKEN}`;
    const res = await fetch(new URL('/v1/transcribe', gateway), {
      method: 'POST',
      body: form,
      headers,
    });
    const { text } = (await res.json()) as { text?: string };
    const score = wer(reference, text ?? '');
    const n = words(reference).length;
    totalErrors += score * n;
    totalWords += n;
    console.log(`| ${name} | ${String(n)} | ${(score * 100).toFixed(1)} % |`);
  }
  console.log(
    `\nOverall WER ${((totalErrors / Math.max(totalWords, 1)) * 100).toFixed(1)} % over ${String(clips.length)} clips.`,
  );
}

if (process.argv[1]?.endsWith('wer.ts')) void main();
