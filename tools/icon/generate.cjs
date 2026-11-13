// Renders every Laqta icon from one drawing (the "caught bug": the viewfinder from the logo
// framing a bug, so the icon says "screenshot to bug"):
//   app/build/icon.png               1024 px app icon; electron-builder derives .icns and .ico
//   app/resources/tray.png           32 px Windows tray icon, on the accent tile
//   app/resources/trayTemplate.png   16 px macOS menu-bar template (black on transparent)
//   app/resources/trayTemplate@2x.png 32 px, same
// The in-app mark (AppMark in app/src/renderer/shared/icons.tsx) uses the same paths.
//   pnpm icon
const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const SIZE = 1024;
const ROOT = join(__dirname, '..', '..', 'app');

// All glyphs are drawn on a 36-unit grid, the same as AppMark.
const CORNERS =
  'M8 13v-3a2 2 0 0 1 2-2h3M23 8h3a2 2 0 0 1 2 2v3M28 23v3a2 2 0 0 1-2 2h-3M13 28h-3a2 2 0 0 1-2-2v-3';
const LEGS =
  'M16.6 11.7l-1.3-1.7M19.4 11.7l1.3-1.7M12.9 17.6h-2.3M23.1 17.6h2.3M12.7 21.2h-2.5M23.3 21.2h2.5M13.4 24.4l-2 1.6M22.6 24.4l2 1.6';

/** Full detail, for the app icon: corners, antennae and legs, head, body and the wing line. */
const detailed = (ink, tile) => `
  <path d="${CORNERS}" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>
  <path d="${LEGS}" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/>
  <circle cx="18" cy="13.7" r="2.5" fill="${ink}"/>
  <ellipse cx="18" cy="20.4" rx="5.2" ry="6" fill="${ink}"/>
  <path d="M18 16.2v9.6" stroke="${tile}" stroke-width="1.2" stroke-linecap="round"/>`;

/** Tray sizes (16 to 32 px): thicker corners and a plain body, so it stays crisp. */
const simple = (ink) => `
  <path d="${CORNERS}" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="18" cy="18.5" rx="5.2" ry="6" fill="${ink}"/>`;

const TILE_TOP = '#5b78ff';
const TILE_BOTTOM = '#2a45e0';
const tile = (x, y, w, rx, filter = '') => `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${TILE_TOP}"/><stop offset="1" stop-color="${TILE_BOTTOM}"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="125%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect x="${x}" y="${y}" width="${w}" height="${w}" rx="${rx}" fill="url(#bg)" ${filter}/>`;

const wrap = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 1024 1024">${body}</svg>`;

const IMAGES = [
  {
    // The macOS grid: an 824 px rounded square centred on the canvas, room for the shadow.
    out: join(ROOT, 'build', 'icon.png'),
    size: 1024,
    svg: wrap(
      tile(100, 100, 824, 185, 'filter="url(#shadow)"') +
        `<svg x="100" y="100" width="824" height="824" viewBox="0 0 36 36">${detailed('#fff', TILE_BOTTOM)}</svg>`,
    ),
  },
  {
    // Windows tray: the tile fills the image; it reads on light and dark taskbars.
    out: join(ROOT, 'resources', 'tray.png'),
    size: 32,
    svg: wrap(
      tile(0, 0, 1024, 230) +
        `<svg width="1024" height="1024" viewBox="0 0 36 36">${simple('#fff')}</svg>`,
    ),
  },
  ...[16, 32].map((size) => ({
    // macOS template: only the alpha counts; the menu bar tints it for light and dark.
    out: join(ROOT, 'resources', size === 16 ? 'trayTemplate.png' : 'trayTemplate@2x.png'),
    size,
    svg: wrap(`<svg width="1024" height="1024" viewBox="2 2 32 32">${simple('#000')}</svg>`),
  })),
];

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
  for (const image of IMAGES) {
    const html = `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${image.svg}`;
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise((r) => setTimeout(r, 300));
    const shot = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
    // Drawn at 1024 and scaled down, so small sizes get smooth edges.
    writeFileSync(
      image.out,
      shot.resize({ width: image.size, height: image.size, quality: 'best' }).toPNG(),
    );
    console.log(`wrote ${image.out}`);
  }
  app.quit();
});
