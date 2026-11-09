import type { MenuItemConstructorOptions } from 'electron';
import { format, t, type UiLanguage } from '../shared/strings';
import type { CaptureMode, SavedDraftInfo } from '../shared/types';

// Design board 4, card 4. Built as a plain template so it can be unit tested.

export type ConnectionStatus = 'connected' | 'offline' | 'not-configured';

export interface RecentIssue {
  key: string;
  summary: string;
  browseUrl: string;
}

export interface TrayModel {
  lang: UiLanguage;
  status: ConnectionStatus;
  hotkeyArea: string;
  hotkeyWindow: string;
  windowModeAvailable: boolean;
  recent: readonly RecentIssue[];
  savedDrafts: readonly SavedDraftInfo[];
  aiDisabledMessage: string | null;
}

export interface TrayActions {
  capture: (mode: CaptureMode) => void;
  openRecent: (issue: RecentIssue) => void;
  resumeDraft: (requestId: string) => void;
  openSettings: () => void;
  quit: () => void;
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function buildTrayTemplate(m: TrayModel, a: TrayActions): MenuItemConstructorOptions[] {
  const statusKey =
    m.status === 'connected'
      ? 'tray.connected'
      : m.status === 'offline'
        ? 'tray.offline'
        : 'tray.notConfigured';
  const items: MenuItemConstructorOptions[] = [
    { label: t(m.lang, statusKey), enabled: false, id: 'status' },
  ];
  if (m.aiDisabledMessage !== null) {
    items.push({
      label: format(m.lang, 'tray.aiDisabled', { message: m.aiDisabledMessage }),
      enabled: false,
    });
  }
  items.push(
    { type: 'separator' },
    {
      label: t(m.lang, 'tray.captureArea'),
      accelerator: m.hotkeyArea || undefined,
      registerAccelerator: false,
      click: () => a.capture('area'),
      id: 'capture-area',
    },
  );
  if (m.windowModeAvailable) {
    items.push({
      label: t(m.lang, 'tray.captureWindow'),
      accelerator: m.hotkeyWindow || undefined,
      registerAccelerator: false,
      click: () => a.capture('window'),
      id: 'capture-window',
    });
  }
  items.push({
    label: t(m.lang, 'tray.captureScreen'),
    click: () => a.capture('screen'),
    id: 'capture-screen',
  });

  if (m.savedDrafts.length > 0) {
    items.push({ type: 'separator' });
    for (const d of m.savedDrafts) {
      items.push({
        label: format(m.lang, 'tray.savedDraft', { summary: truncate(d.summary, 40) }),
        click: () => a.resumeDraft(d.requestId),
      });
    }
  }
  if (m.recent.length > 0) {
    items.push({ type: 'separator' }, { label: t(m.lang, 'tray.recent'), enabled: false });
    for (const r of m.recent) {
      items.push({
        label: format(m.lang, 'tray.recentItem', { key: r.key, summary: truncate(r.summary, 40) }),
        click: () => a.openRecent(r),
      });
    }
  }
  items.push(
    { type: 'separator' },
    { label: t(m.lang, 'tray.settings'), click: a.openSettings, id: 'settings' },
    { label: t(m.lang, 'tray.quit'), click: a.quit, id: 'quit' },
  );
  return items;
}
