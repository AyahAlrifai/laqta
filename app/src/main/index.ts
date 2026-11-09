import { join } from 'node:path';
import { app, Menu, nativeImage, Tray } from 'electron';
import { resourcesDir, trayIconFileName } from './tray-icon';

// Held at module level: a Tray that is garbage collected disappears from the menu bar.
let tray: Tray | null = null;

function createTray(): Tray {
  const dir = resourcesDir(app.isPackaged, app.getAppPath(), process.resourcesPath);
  const icon = nativeImage.createFromPath(join(dir, trayIconFileName(process.platform)));
  if (process.platform === 'darwin') icon.setTemplateImage(true);

  const created = new Tray(icon);
  created.setToolTip(app.getName());
  // role 'quit' gives an OS-localised label; the full tray menu arrives in T-010.
  created.setContextMenu(Menu.buildFromTemplate([{ role: 'quit' }]));
  return created;
}

// Laqta lives in the tray, so closing its windows must not quit the app.
app.on('window-all-closed', () => undefined);

void app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide();
  tray = createTray();
});

app.on('before-quit', () => {
  tray?.destroy();
  tray = null;
});
