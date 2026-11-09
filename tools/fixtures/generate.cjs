// Renders the synthetic fixture screens in tools/fixtures/cases.json to fixtures/<name>.png
// and writes fixtures/<name>.json (spec section 12). All content is made up.
//   pnpm --filter @laqta/app exec electron ../tools/fixtures/generate.cjs
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const cases = JSON.parse(readFileSync(join(__dirname, 'cases.json'), 'utf8'));
const out = join(__dirname, '..', '..', 'fixtures');
const css = `body{font:16px -apple-system,'Segoe UI','Noto Sans Arabic',sans-serif;margin:0;color:#14171f;background:#f3f4f7}
header{background:#fff;padding:14px 24px;border-bottom:1px solid #dde1e8;font-weight:600}
main{padding:24px}table{background:#fff;border-collapse:collapse;min-width:420px}td,th{padding:8px 16px;text-align:left}
.err{background:#fdecea;color:#7a1d16;padding:12px;border-radius:8px}button{padding:8px 16px}`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 800,
    height: 450,
    show: false,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, javascript: false },
  });
  for (const c of cases) {
    const html = `<!doctype html><meta charset="utf-8"><style>${css}</style><header>${c.title}</header><main>${c.body}</main>`;
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise((r) => setTimeout(r, 150));
    const image = await win.webContents.capturePage();
    writeFileSync(join(out, `${c.name}.png`), image.toPNG());
    const fixture = {
      prompt: c.prompt,
      bugLanguage: c.bugLanguage,
      allowed: {
        issueTypes: ['Bug', 'Task'],
        priorities: ['Highest', 'High', 'Medium', 'Low', 'Lowest'],
      },
      mustMention: c.mustMention,
      mustNotMention: c.mustNotMention,
      expectedIssueType: c.expectedIssueType,
      context: { appName: c.title, windowTitle: c.title, os: 'win32 10.0.22631' },
    };
    writeFileSync(join(out, `${c.name}.json`), JSON.stringify(fixture, null, 2) + '\n');
  }
  console.log(`wrote ${cases.length} fixtures`);
  app.quit();
});
