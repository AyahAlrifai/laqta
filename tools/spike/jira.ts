// T-002 Jira spike (spec section 14, items 1 to 6). Run against a SANDBOX project only:
//
//   JIRA_URL=https://jira.example.com JIRA_PAT=... JIRA_PROJECT=SANDBOX \
//   JIRA_ASSIGNEE_QUERY=sara pnpm --filter @laqta/app exec tsx ../tools/spike/jira.ts
//
// It calls every endpoint of spec section 8, creates ONE test issue with an attachment, and
// writes the real response shapes (values redacted, token never printed) to
// docs/spike-jira.md. Item 5 (net.fetch with FormData) and item 6 (the image renders in the
// description) still need a manual check in the app and in the Jira UI.

import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const base = (process.env.JIRA_URL ?? '').replace(/\/+$/, '');
const token = process.env.JIRA_PAT ?? '';
const project = process.env.JIRA_PROJECT ?? '';
const assigneeQuery = process.env.JIRA_ASSIGNEE_QUERY ?? 'a';
if (!base.startsWith('https://') || token === '' || project === '') {
  console.error('Set JIRA_URL (https), JIRA_PAT and JIRA_PROJECT (a sandbox project).');
  process.exit(1);
}

interface Row {
  item: string;
  call: string;
  status: number | string;
  verdict: 'confirmed' | 'different' | 'failed';
  shape: string;
}
const rows: Row[] = [];

/** Keeps keys and types, replaces values, so the doc shows shapes without real data. */
function shape(value: unknown, depth = 0): unknown {
  if (depth > 4) return '…';
  if (Array.isArray(value)) return value.length === 0 ? [] : [shape(value[0], depth + 1)];
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 25)
        .map(([k, v]) => [k, shape(v, depth + 1)]),
    );
  }
  return typeof value;
}

async function call(
  item: string,
  method: string,
  path: string,
  init: RequestInit = {},
  expect = 200,
): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');
  try {
    const res = await fetch(`${base}${path}`, { ...init, method, headers });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text === '' ? null : JSON.parse(text);
    } catch {
      body = text.slice(0, 80);
    }
    rows.push({
      item,
      call: `${method} ${path.replace(/\?.*/, '?…')}`,
      status: res.status,
      verdict: res.status === expect ? 'confirmed' : 'different',
      shape: JSON.stringify(shape(body)).slice(0, 600),
    });
    return body;
  } catch (error) {
    rows.push({
      item,
      call: `${method} ${path}`,
      status: String(error).slice(0, 80),
      verdict: 'failed',
      shape: '',
    });
    return null;
  }
}

function png(width: number, height: number): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height, 0x80);
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = ~0;
    for (const x of b) c = (crcTable[(c ^ x) & 255] ?? 0) ^ (c >>> 8);
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function main(): Promise<void> {
  const enc = encodeURIComponent;
  await call('1 PAT as Bearer', 'GET', '/rest/api/2/myself');
  await call('-', 'GET', '/rest/api/2/project');
  const types = (await call(
    '2 scoped createmeta',
    'GET',
    `/rest/api/2/issue/createmeta/${enc(project)}/issuetypes?startAt=0&maxResults=50`,
  )) as { values?: { id: string; name: string }[] } | null;
  const bug = types?.values?.find((t) => t.name === 'Bug') ?? types?.values?.[0];
  if (bug)
    await call(
      '2 scoped createmeta fields',
      'GET',
      `/rest/api/2/issue/createmeta/${enc(project)}/issuetypes/${enc(bug.id)}?startAt=0&maxResults=100`,
    );
  await call('-', 'GET', '/rest/api/2/priority');
  await call(
    '3 assignable search',
    'GET',
    `/rest/api/2/user/assignable/search?project=${enc(project)}&username=${enc(assigneeQuery)}&maxResults=10`,
  );
  await call('-', 'POST', '/rest/api/2/search', {
    body: JSON.stringify({
      jql: `project = "${project}" ORDER BY created DESC`,
      fields: ['summary', 'status'],
      maxResults: 1,
    }),
    headers: { 'Content-Type': 'application/json' },
  });

  const requestId = randomUUID();
  const fileName = `laqta-${requestId}.png`;
  const created = (await call(
    '-',
    'POST',
    '/rest/api/2/issue',
    {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          project: { key: project },
          issuetype: { name: bug?.name ?? 'Bug' },
          summary: 'Laqta spike test issue (safe to delete)',
          description: `h3. Screenshot\n!${fileName}!\n----\n_Created by the Laqta Jira spike._`,
          labels: ['laqta', `laqta-${requestId}`],
        },
      }),
    },
    201,
  )) as { key?: string } | null;

  if (created?.key !== undefined) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(png(64, 64))], { type: 'image/png' }), fileName);
    await call('4 attachment upload', 'POST', `/rest/api/2/issue/${enc(created.key)}/attachments`, {
      body: form,
      headers: { 'X-Atlassian-Token': 'no-check' },
    });
    const big = new FormData();
    big.append(
      'file',
      new Blob([new Uint8Array(png(3000, 3000))], { type: 'image/png' }),
      'laqta-large.png',
    );
    await call(
      '4 large attachment (find the limit)',
      'POST',
      `/rest/api/2/issue/${enc(created.key)}/attachments`,
      { body: big, headers: { 'X-Atlassian-Token': 'no-check' } },
    );
    await call('-', 'POST', '/rest/api/2/search', {
      body: JSON.stringify({
        jql: `labels = "laqta-${requestId}"`,
        fields: ['summary'],
        maxResults: 1,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    console.log(
      `Created ${created.key}. Open ${base}/browse/${created.key} and check that the image renders in the description (item 6), then delete the issue.`,
    );
  }

  const lines = [
    '# Jira spike results (T-002)',
    '',
    `Run on ${new Date().toISOString().slice(0, 10)} against project \`${project}\`. Values are replaced by their types; the token is never written.`,
    '',
    '| Spec 14 item | Call | Status | Verdict | Response shape |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(
      (r) =>
        `| ${r.item} | \`${r.call}\` | ${String(r.status)} | ${r.verdict} | \`${r.shape.replace(/\|/g, '\\|')}\` |`,
    ),
    '',
    'Manual checks still to record here:',
    '',
    '- Item 5: create a bug through the app itself (net.fetch + FormData) and confirm the attachment arrives.',
    '- Item 6: the `!laqta-<id>.png!` reference renders once the attachment exists.',
    '- Item 12: repeat the run on the company network and on VPN (proxy and root certificate).',
    '- Item 14: confirm creates are not resent by the network stack behind the corporate proxy.',
  ];
  writeFileSync(join(__dirname, '..', '..', 'docs', 'spike-jira.md'), lines.join('\n') + '\n');
  console.log('Wrote docs/spike-jira.md');
}

void main();
