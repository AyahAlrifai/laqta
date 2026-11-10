// Renders the app icon to app/build/icon.png (1024 px). electron-builder derives the macOS
// .icns and Windows .ico from it, and tools/dev-bundle.cjs uses it for development runs.
// The glyph matches the tray icon (a viewfinder) on the accent colour from tokens.css.
//   pnpm icon
const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const SIZE = 1024;
// The macOS grid: an 824 px rounded square centred on a 1024 canvas, leaving room for the shadow.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4a72f0"/>
      <stop offset="1" stop-color="#1d3fb8"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="125%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg)" filter="url(#shadow)"/>
  <g fill="none" stroke="#fff" stroke-width="56" stroke-linecap="round" stroke-linejoin="round">
    <path d="M300 410 V330 Q300 300 330 300 H410"/>
    <path d="M614 300 H694 Q724 300 724 330 V410"/>
    <path d="M724 614 V694 Q724 724 694 724 H614"/>
    <path d="M410 724 H330 Q300 724 300 694 V614"/>
  </g>
  <circle cx="512" cy="512" r="78" fill="#fff"/>
</svg>`;

app.disableHardwareAcceleration();
void app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, javascript: false },
  });
  win.webContents.setZoomFactor(1);
  const html = `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  const out = join(__dirname, '..', '..', 'app', 'build', 'icon.png');
  writeFileSync(out, image.resize({ width: SIZE, height: SIZE }).toPNG());
  console.log(`wrote ${out}`);
  app.quit();
});
