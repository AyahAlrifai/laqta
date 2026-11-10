import { randomUUID } from 'node:crypto';
import { release } from 'node:os';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  Notification,
  safeStorage,
  screen,
  session,
  shell,
  systemPreferences,
  Tray,
  type IpcMainInvokeEvent,
} from 'electron';
import { join } from 'node:path';
import type { z } from 'zod';
import { HANDLED_FIELDS } from '../shared/fields';
import { IPC, IPC_EVENTS } from '../shared/ipc-channels';
import {
  ApprovedBugSchema,
  CaptureCompleteSchema,
  CaptureStartSchema,
  CheckDuplicatesSchema,
  CopyTextSchema,
  DraftRequestSchema,
  LoadCreateMetaSchema,
  JiraMyselfSchema,
  JiraProjectListSchema,
  OpenLinkSchema,
  PermissionKindSchema,
  PRIORITIES,
  ResolveAssigneeSchema,
  RetryAttachmentSchema,
  ReviewStateSchema,
  SearchAssigneesSchema,
  SetRedactedImageSchema,
  SettingsSchema,
  SettingsSchemaForE2e,
  SettingsSetRequestSchema,
  SettingsSetRequestSchemaForE2e,
  TestConnectionSchema,
  TestConnectionSchemaForE2e,
  VoiceTranscribeSchema,
} from '../shared/schemas';
import { format, t, type UiLanguage } from '../shared/strings';
import type {
  ApprovedBug,
  BugDraft,
  CaptureMode,
  CreateMeta,
  CreateResult,
  DraftResult,
  FlowState,
  OverlayFrame,
  PermissionStatus,
  Rect,
  ReviewState,
  Session,
  SessionImage,
  Settings,
  SettingsSetResult,
  SettingsView,
  TestConnectionResult,
  ToastData,
} from '../shared/types';
import { attachmentFileName } from '../shared/wiki';
import { requestDraft } from './ai/draft-service';
import { FakeDraftProvider } from './ai/fake-provider';
import { ClaudeCodeProvider, resolveClaudeCommand } from './ai/claude-code';
import { GatewayProvider } from './ai/gateway-provider';
import type { DraftProvider, FetchLike } from './ai/provider';
import { sanitizeLabels, sanitizeSummary } from './ai/sanitize';
import { readActiveWindow, type ActiveWindowInfo } from './capture/active-window';
import {
  grabFrames,
  microphonePermission,
  screenPermission,
  syntheticFrames,
  type FrozenFrame,
} from './capture/frames';
import { dipRectToPixels, screenRectToDisplay } from './capture/geometry';
import { aiCopy, cropToPng, fitAttachment, pngSize, shrinkOnce } from './capture/image';
import { LEFTOVER_MAX_AGE_MS, TempImages } from './capture/temp-files';
import { config } from './config';
import { appError, AppFailure, setErrorLanguage } from './errors';
import {
  displayAccelerator,
  registerHotkeys,
  unregisterHotkeys,
  type HotkeyBinding,
} from './hotkey';
import { guarded, type SenderInfo } from './ipc-guard';
import { resolveAssignee, searchAssignable } from './jira/assignee';
import { failureOf, JiraClient } from './jira/client';
import { createIssue, findByRequestLabel, attachAndFinish, requestLabel } from './jira/create-bug';
import { listProjects, loadCreateMeta } from './jira/create-meta';
import { testJiraConnection } from './jira/test-connection';
import { checkDuplicates } from './jira/duplicates';
import { JIRA } from './jira/endpoints';
import { isBelowVersion, KillSwitch } from './kill-switch';
import { isAllowedJiraLink, MAC_MICROPHONE_SETTINGS_URL, MAC_SCREEN_SETTINGS_URL } from './links';
import { log } from './log';
import {
  hasUnsavedWork,
  transition,
  type DraftRequest,
  type Effect,
  type FlowEvent,
} from './orchestrator';
import { OfflineDraftStore } from './settings/offline-draft';
import { EncryptionUnavailableError, TokenStore, type Crypter } from './settings/secrets';
import { SettingsStore } from './settings/store';
import { Telemetry } from './telemetry';
import { buildTrayTemplate, type ConnectionStatus, type RecentIssue } from './tray-menu';
import { trayIconFileName, resourcesDir } from './tray-icon';
import { startAutoUpdates } from './updater';
import { GatewayTranscriber, UnavailableTranscriber, type Transcriber } from './voice/transcriber';
import {
  createAppWindow,
  isOwnRendererUrl,
  openValidatedExternal,
  setVoicePermission,
  windowKindOf,
} from './windows';

// Composition root: owns the services, the session, the windows and the IPC handlers.
// Transitions come from the pure state machine in `orchestrator.ts`; this file is the
// effect runner.

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

interface SessionData {
  session: Session;
  startedAt: number;
  /** Unredacted crop. Zeroed and dropped as soon as the redacted export arrives. */
  originalPng: Buffer | null;
  redactedPng: Buffer | null;
  activeWindow: ActiveWindowInfo | null;
  draft: BugDraft | null;
  restored: ReviewState | null;
  approved: ApprovedBug | null;
  draftAbort: AbortController | null;
  pendingDraft: Deferred<DraftResult> | null;
  pendingCreate: Deferred<CreateResult> | null;
  issueKey: string | null;
}

/** E2E only (never in a packaged build): reversible "encryption" so tests avoid the keychain. */
const e2eCrypter: Crypter = {
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from(plain, 'utf8'),
  decryptString: (buf) => buf.toString('utf8'),
};

const fetchViaNet: FetchLike = (input, init) => net.fetch(input, init);

/**
 * A new in-memory session has its own empty socket pool, so the request goes out on a
 * fresh connection that Chromium will not silently resend. It still uses the system proxy
 * and certificate store.
 */
const fetchOnFreshConnection: FetchLike = (input, init) =>
  session.fromPartition(`laqta-create-${randomUUID()}`, { cache: false }).fetch(input, init);

export class LaqtaApp {
  private readonly settings: SettingsStore;
  private readonly tokens: TokenStore;
  private readonly offline: OfflineDraftStore;
  private readonly temp: TempImages;
  private readonly telemetry: Telemetry;
  private readonly killSwitch: KillSwitch;
  /** Fixed for the whole run: the E2E fake, a dev provider from the environment, or the gateway. */
  private readonly fixedProvider: DraftProvider | null;
  private readonly gatewayProvider: DraftProvider | null;
  private readonly transcriber: Transcriber;
  private readonly e2e: boolean;

  private state: FlowState = 'idle';
  private data: SessionData | null = null;
  private frames = new Map<string, FrozenFrame>();
  private overlays = new Map<string, BrowserWindow>();
  private overlayDisplayByWc = new Map<number, string>();
  private initialMode: CaptureMode = 'area';
  private workbench: BrowserWindow | null = null;
  private toast: BrowserWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;
  private toastData: ToastData | null = null;
  private tray: Tray | null = null;
  private recent: RecentIssue[] = [];
  private connection: ConnectionStatus = 'not-configured';
  private windowModeAvailable = false;
  private createMetaCache = new Map<string, CreateMeta>();
  private closingProgrammatically = new Set<BrowserWindow>();

  constructor(private readonly devProviderFactory: (() => DraftProvider | null) | null) {
    this.e2e = config.e2e && !app.isPackaged;
    const userData = app.getPath('userData');
    const crypter: Crypter = this.e2e ? e2eCrypter : safeStorage;
    // E2E runs (never packaged) also accept the mock Jira's http://127.0.0.1 URL, so the
    // Settings page can be driven end to end; every other build keeps https only.
    this.settings = new SettingsStore(userData, this.e2e ? SettingsSchemaForE2e : SettingsSchema);
    this.tokens = new TokenStore(userData, crypter);
    this.offline = new OfflineDraftStore(userData, crypter, config.offlineDraftHours);
    this.temp = new TempImages(app.getPath('temp'));
    this.telemetry = new Telemetry(
      () => this.settings.get().telemetryEnabled,
      config.telemetryUrl,
      fetchViaNet,
    );
    this.killSwitch = new KillSwitch(
      userData,
      config.statusUrl,
      config.statusPublicKey,
      fetchViaNet,
    );
    this.gatewayProvider =
      config.gatewayUrl !== null
        ? new GatewayProvider({
            baseUrl: config.gatewayUrl,
            fetch: fetchViaNet,
            // D-AUTH (spec section 15) decides the header; none until then.
            authHeader: () => Promise.resolve(null),
          })
        : null;
    this.fixedProvider = this.e2e ? new FakeDraftProvider() : (this.devProviderFactory?.() ?? null);
    this.transcriber =
      config.gatewayUrl !== null
        ? new GatewayTranscriber(config.gatewayUrl, fetchViaNet, () => Promise.resolve(null))
        : new UnavailableTranscriber();
    if (this.e2e) this.applyE2eSettings();
  }

  /**
   * Read for every draft, so a change in Settings › AI applies without a restart (spec
   * section 7). The E2E fake and the dev environment switches win over the setting.
   */
  private provider(): DraftProvider | null {
    if (this.fixedProvider !== null) return this.fixedProvider;
    if (this.settings.get().aiProvider === 'claude-code') {
      return new ClaudeCodeProvider({
        command: resolveClaudeCommand(process.env.LAQTA_CLAUDE_PATH),
      });
    }
    return this.gatewayProvider;
  }

  private applyE2eSettings(): void {
    const url = process.env.LAQTA_E2E_JIRA_URL;
    if (url === undefined) return;
    this.tokens.set('e2e-token');
    const cloud = process.env.LAQTA_E2E_JIRA_DEPLOYMENT === 'cloud';
    this.settings.set({
      ...this.settings.get(),
      jiraBaseUrl: '',
      jiraDeployment: cloud ? 'cloud' : 'datacenter',
      jiraEmail: cloud ? 'tester@example.test' : '',
      defaultProjectKey: 'PROJ',
    });
  }

  private lang(): UiLanguage {
    return this.settings.get().uiLanguage;
  }

  // ---------------------------------------------------------------- start-up

  async start(): Promise<void> {
    setErrorLanguage(this.lang());
    setVoicePermission(this.settings.get().voiceEnabled);
    this.temp.cleanup(LEFTOVER_MAX_AGE_MS);
    this.offline.list();
    this.registerIpc();

    const status = await this.killSwitch.refresh();
    if (status.appDisabled) {
      await dialog.showMessageBox({
        type: 'error',
        message: format(this.lang(), 'error.appDisabled', { message: status.message ?? '' }),
        buttons: [t(this.lang(), 'dialog.ok')],
      });
      app.quit();
      return;
    }
    if (
      status.minimumVersion !== undefined &&
      isBelowVersion(app.getVersion(), status.minimumVersion)
    ) {
      void dialog.showMessageBox({
        type: 'warning',
        message: t(this.lang(), 'update.requiredTitle'),
        detail: t(this.lang(), 'update.requiredBody'),
        buttons: [t(this.lang(), 'dialog.ok')],
      });
    }

    this.windowModeAvailable = (await readActiveWindow()) !== null;
    this.createTray();
    this.applyHotkeys(true);
    startAutoUpdates(config.updateFeedUrl, app.isPackaged);
    void this.refreshConnection();
    setInterval(() => void this.refreshConnection(), 5 * 60_000).unref();
    setInterval(() => void this.telemetry.flush(), 15 * 60_000).unref();

    if (this.e2e) {
      // Playwright cannot press global hotkeys; E2E runs (never packaged builds) get a trigger.
      (globalThis as Record<string, unknown>).__laqtaE2E = {
        capture: (mode: CaptureMode) => this.dispatchCaptureStart(mode),
        state: () => this.state,
      };
    }
    if (!this.isJiraConfigured()) this.openSettings();
  }

  shutdown(): void {
    unregisterHotkeys();
    if (this.data) this.temp.delete(this.data.session.id);
    void this.telemetry.flush();
    this.tray?.destroy();
    this.tray = null;
  }

  /** A second instance was started: treat it like the tray click. */
  focusOrSettings(): void {
    if (this.state !== 'idle') this.focusSession();
    else this.openSettings();
  }

  // ---------------------------------------------------------------- jira

  private jiraBaseUrl(): string {
    if (this.e2e && process.env.LAQTA_E2E_JIRA_URL !== undefined)
      return process.env.LAQTA_E2E_JIRA_URL;
    return this.settings.get().jiraBaseUrl;
  }

  private isJiraConfigured(): boolean {
    return this.jiraBaseUrl() !== '' && this.tokens.has();
  }

  private jira(): JiraClient {
    const token = this.tokens.get();
    if (token === null || this.jiraBaseUrl() === '') throw new AppFailure(appError('AUTH_INVALID'));
    const settings = this.settings.get();
    return new JiraClient({
      baseUrl: this.jiraBaseUrl(),
      token,
      deployment: settings.jiraDeployment,
      email: settings.jiraEmail,
      fetch: fetchViaNet,
      freshFetch: fetchOnFreshConnection,
      allowHttpForTests: this.e2e,
    });
  }

  private jiraHost(): string | null {
    try {
      return new URL(this.jiraBaseUrl()).host.toLowerCase();
    } catch {
      return null;
    }
  }

  private async refreshConnection(): Promise<void> {
    if (!this.isJiraConfigured()) {
      this.setConnection('not-configured');
      return;
    }
    try {
      await this.jira().request('GET', JIRA.myself(), JiraMyselfSchema);
      this.setConnection('connected');
    } catch {
      this.setConnection('offline');
    }
  }

  private setConnection(status: ConnectionStatus): void {
    if (this.connection === status) return;
    this.connection = status;
    this.refreshTray();
  }

  /** Records the outcome of any Jira call for the tray status row. */
  private async withJira<T>(fn: (client: JiraClient) => Promise<T>): Promise<T> {
    try {
      const value = await fn(this.jira());
      this.setConnection('connected');
      return value;
    } catch (error) {
      const code = failureOf(error).code;
      if (code === 'NETWORK_UNREACHABLE' || code === 'TLS_ERROR') this.setConnection('offline');
      throw error;
    }
  }

  // ---------------------------------------------------------------- tray and hotkeys

  private createTray(): void {
    const dir = resourcesDir(app.isPackaged, app.getAppPath(), process.resourcesPath);
    const icon = nativeImage.createFromPath(join(dir, trayIconFileName(process.platform)));
    if (process.platform === 'darwin') icon.setTemplateImage(true);
    this.tray = new Tray(icon);
    this.tray.setToolTip(t(this.lang(), 'tray.tooltip'));
    this.refreshTray();
    // Where macOS put the icon helps when it is hidden behind the notch.
    const tray = this.tray;
    setTimeout(() => {
      const b = tray.getBounds();
      log('tray.ready', { x: b.x, y: b.y, width: b.width, empty: icon.isEmpty() });
    }, 1500);
  }

  private refreshTray(): void {
    if (!this.tray) return;
    const s = this.settings.get();
    const status = this.killSwitch.current();
    const template = buildTrayTemplate(
      {
        lang: s.uiLanguage,
        status: this.connection,
        hotkeyArea: s.hotkeyArea,
        hotkeyWindow: s.hotkeyWindow,
        windowModeAvailable: this.windowModeAvailable,
        recent: this.recent,
        savedDrafts: this.offline.list(),
        aiDisabledMessage: status.aiDisabled ? (status.message ?? '') : null,
      },
      {
        capture: (mode) => this.dispatchCaptureStart(mode),
        openRecent: (issue) => void this.openLink(issue.browseUrl),
        resumeDraft: (id) => this.resumeDraft(id),
        openSettings: () => this.openSettings(),
        quit: () => app.quit(),
      },
    );
    this.tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  private applyHotkeys(notify: boolean): string[] {
    const s = this.settings.get();
    const bindings: HotkeyBinding[] = [{ accelerator: s.hotkeyArea, mode: 'area' }];
    if (this.windowModeAvailable) bindings.push({ accelerator: s.hotkeyWindow, mode: 'window' });
    const conflicts = registerHotkeys(bindings, (mode) => this.dispatchCaptureStart(mode));
    if (notify && conflicts.length > 0 && Notification.isSupported()) {
      for (const accelerator of conflicts) {
        new Notification({
          title: t(this.lang(), 'toast.title'),
          body: format(this.lang(), 'error.hotkeyConflict', {
            accelerator: displayAccelerator(accelerator, process.platform),
          }),
        }).show();
      }
    }
    return conflicts;
  }

  // ---------------------------------------------------------------- flow controller

  private dispatchCaptureStart(mode: CaptureMode): void {
    if (this.state === 'idle') this.data = this.newSessionData(mode);
    this.dispatch({ type: 'capture:start', mode });
  }

  private newSessionData(mode: CaptureMode, id: string = randomUUID()): SessionData {
    return {
      session: {
        id,
        state: 'idle',
        captureMode: mode,
        sourceApp: null,
        os: { platform: process.platform === 'win32' ? 'win32' : 'darwin', release: release() },
        imagePath: null,
        width: 0,
        height: 0,
        capturedAt: new Date().toISOString(),
      },
      startedAt: Date.now(),
      originalPng: null,
      redactedPng: null,
      activeWindow: null,
      draft: null,
      restored: null,
      approved: null,
      draftAbort: null,
      pendingDraft: null,
      pendingCreate: null,
      issueKey: null,
    };
  }

  /** Applies one event; effects run after the transition is recorded. */
  private dispatch(event: FlowEvent): boolean {
    const result = transition(this.state, event);
    if (result === null) {
      log('session.rejected', { from: this.state, trigger: event.type });
      return false;
    }
    const data = this.data;
    log('session.transition', { from: this.state, to: result.state, trigger: event.type });
    this.state = result.state;
    if (data) data.session.state = result.state;
    if (result.state === 'idle') this.data = null;
    for (const effect of result.effects) {
      void Promise.resolve()
        .then(() => this.runEffect(effect, data))
        .catch((error: unknown) => {
          log('app.error', {
            effect: effect.type,
            name: error instanceof Error ? error.name : 'unknown',
          });
        });
    }
    this.broadcastSession();
    return true;
  }

  private broadcastSession(): void {
    const snapshot = this.data ? { ...this.data.session } : null;
    for (const win of [this.workbench, this.toast]) {
      if (win && !win.isDestroyed()) win.webContents.send(IPC_EVENTS.sessionChanged, snapshot);
    }
  }

  private async runEffect(effect: Effect, data: SessionData | null): Promise<void> {
    switch (effect.type) {
      case 'beginCapture':
        return this.beginCapture(effect.mode, data);
      case 'focusSession': {
        this.focusSession();
        return;
      }
      case 'reportCaptureError':
        this.telemetry.record({ name: 'error', code: effect.error.code });
        return;
      case 'cropAndOpenWorkbench':
        this.cropAndOpenWorkbench(effect.displayId, effect.rect, data);
        return;
      case 'closeOverlays': {
        this.closeOverlays();
        return;
      }
      case 'callProvider':
        return this.callProvider(effect.request, data);
      case 'storeDraft':
        if (data) data.draft = effect.draft;
        return;
      case 'reportDraftError':
        this.telemetry.record({ name: 'error', code: effect.error.code });
        return;
      case 'abortDraft':
        data?.draftAbort?.abort();
        data?.pendingDraft?.resolve({ kind: 'failed', error: appError('CANCELLED') });
        return;
      case 'createIssue':
        return this.runCreate(effect.bug, data);
      case 'verifyByLabel':
        return this.runVerify(data);
      case 'uploadAttachment':
        return this.runUpload(effect.issueKey, data);
      case 'showResult': {
        this.showResult(effect.issueKey, effect.browseUrl, effect.attachmentError, data);
        return;
      }
      case 'reportCreateError':
        this.telemetry.record({ name: 'error', code: effect.error.code });
        data?.pendingCreate?.resolve({
          kind: 'failed',
          error: effect.error,
          retryable: effect.retryable,
        });
        return;
      case 'deleteImage': {
        this.deleteImage(data);
        return;
      }
      case 'closeWorkbench':
        this.closeWindow(this.workbench);
        return;
      case 'closeSessionWindows':
        this.closeWindow(this.workbench);
        this.closeWindow(this.toast);
        return;
      case 'openRestoredReview':
        this.openWorkbench();
        return;
    }
  }

  // ---------------------------------------------------------------- capture

  private async beginCapture(mode: CaptureMode, data: SessionData | null): Promise<void> {
    if (!data) return;
    log('capture.start', { mode });
    if (!this.e2e && screenPermission() !== 'granted') {
      this.openSettings();
      this.dispatch({ type: 'capture:failed', error: appError('PERMISSION_DENIED') });
      return;
    }
    // Read the foreground window before the overlays take focus.
    data.activeWindow = this.e2e ? null : await readActiveWindow();
    try {
      this.frames = this.e2e ? syntheticFrames() : await grabFrames();
    } catch {
      this.frames.clear();
    }
    if (this.frames.size === 0) {
      this.dispatch({
        type: 'capture:failed',
        error: appError('PERMISSION_DENIED', { detail: 'no frames' }),
      });
      return;
    }
    if (this.state !== 'capturing') return;
    this.initialMode = mode === 'window' && data.activeWindow === null ? 'area' : mode;
    for (const [displayId, frame] of this.frames) {
      const win = createAppWindow({
        kind: 'overlay',
        title: t(this.lang(), 'overlay.windowTitle'),
        bounds: frame.display.bounds,
      });
      this.overlays.set(displayId, win);
      this.overlayDisplayByWc.set(win.webContents.id, displayId);
      win.once('ready-to-show', () => {
        win.setBounds(frame.display.bounds);
        win.show();
        win.focus();
      });
    }
  }

  private overlayFrame(sender: SenderInfo): OverlayFrame {
    const displayId = this.overlayDisplayByWc.get(sender.webContentsId);
    const frame = displayId === undefined ? undefined : this.frames.get(displayId);
    if (displayId === undefined || frame === undefined) throw new AppFailure(appError('NOT_FOUND'));
    const bounds = frame.display.bounds;
    const active = this.data?.activeWindow ?? null;
    const windowRect = active ? screenRectToDisplay(active.bounds, bounds) : null;
    const cursor = screen.getCursorScreenPoint();
    const underCursor =
      cursor.x >= bounds.x &&
      cursor.x < bounds.x + bounds.width &&
      cursor.y >= bounds.y &&
      cursor.y < bounds.y + bounds.height;
    return {
      displayId,
      jpeg: frame.image.toJPEG(90),
      scaleFactor: frame.display.scaleFactor,
      widthDip: bounds.width,
      heightDip: bounds.height,
      // Full-screen mode uses the display under the cursor; other displays start in area mode.
      initialMode: this.initialMode === 'screen' && !underCursor ? 'area' : this.initialMode,
      windowModeAvailable: windowRect !== null,
      windowRect,
    };
  }

  private cropAndOpenWorkbench(displayId: string, rect: Rect, data: SessionData | null): void {
    const frame = this.frames.get(displayId);
    if (!data || !frame) {
      this.dispatch({ type: 'session:discard' });
      return;
    }
    const size = frame.image.getSize();
    const pixels = dipRectToPixels(rect, size.width / frame.display.bounds.width, size);
    if (pixels.width < 1 || pixels.height < 1) {
      this.dispatch({ type: 'session:discard' });
      return;
    }
    const png = cropToPng(frame.image, pixels);
    data.originalPng = png;
    data.session.imagePath = this.temp.write(data.session.id, png);
    data.session.width = pixels.width;
    data.session.height = pixels.height;
    data.session.sourceApp = data.activeWindow
      ? { name: data.activeWindow.appName, windowTitle: data.activeWindow.title }
      : null;
    log('capture.complete', {
      width: pixels.width,
      height: pixels.height,
      mode: data.session.captureMode,
    });
    this.closeOverlays();
    this.openWorkbench();
    this.broadcastSession();
  }

  private closeOverlays(): void {
    for (const win of this.overlays.values()) this.closeWindow(win);
    this.overlays.clear();
    this.overlayDisplayByWc.clear();
    // Drop the frozen frames of every display.
    this.frames.clear();
  }

  private deleteImage(data: SessionData | null): void {
    if (!data) return;
    data.originalPng?.fill(0);
    data.redactedPng?.fill(0);
    data.originalPng = null;
    data.redactedPng = null;
    this.temp.delete(data.session.id);
    data.session.imagePath = null;
  }

  // ---------------------------------------------------------------- windows

  private openWorkbench(): void {
    if (this.workbench && !this.workbench.isDestroyed()) {
      this.bringToFront(this.workbench);
      return;
    }
    const win = createAppWindow({
      kind: 'workbench',
      title: t(this.lang(), 'workbench.windowTitle'),
      width: 1200,
      height: 800,
    });
    win.once('ready-to-show', () => {
      this.bringToFront(win);
    });
    win.on('close', (event) => {
      if (this.closingProgrammatically.has(win)) return;
      if (this.state === 'submitting' || this.state === 'verifying') {
        event.preventDefault();
        return;
      }
      if (!hasUnsavedWork(this.state)) {
        if (this.state !== 'idle') this.dispatch({ type: 'session:discard' });
        return;
      }
      event.preventDefault();
      const lang = this.lang();
      void dialog
        .showMessageBox(win, {
          type: 'question',
          message: t(lang, 'confirm.discardTitle'),
          detail: t(lang, 'confirm.discardBody'),
          buttons: [t(lang, 'confirm.keepEditing'), t(lang, 'confirm.discard')],
          defaultId: 0,
          cancelId: 0,
        })
        .then(({ response }) => {
          if (response === 1) this.dispatch({ type: 'session:discard' });
        });
    });
    win.on('closed', () => {
      this.closingProgrammatically.delete(win);
      if (this.workbench === win) this.workbench = null;
    });
    this.workbench = win;
  }

  private focusSession(): void {
    if (this.workbench && !this.workbench.isDestroyed()) {
      this.bringToFront(this.workbench);
      return;
    }
    const overlay = this.overlays.values().next();
    if (overlay.done !== true) overlay.value.focus();
    else if (this.toast && !this.toast.isDestroyed()) this.toast.focus();
  }

  private closeWindow(win: BrowserWindow | null): void {
    if (!win || win.isDestroyed()) return;
    this.closingProgrammatically.add(win);
    win.close();
  }

  /**
   * Laqta has no Dock icon, so macOS does not activate it when a window opens and the window
   * lands behind the app in front. Activate the app explicitly, then raise the window.
   */
  private bringToFront(win: BrowserWindow): void {
    if (process.platform === 'darwin') app.focus({ steal: true });
    win.show();
    win.moveTop();
    win.focus();
  }

  openSettings(): void {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.bringToFront(this.settingsWindow);
      return;
    }
    const win = createAppWindow({
      kind: 'settings',
      title: t(this.lang(), 'settings.windowTitle'),
      width: 860,
      height: 680,
    });
    win.once('ready-to-show', () => this.bringToFront(win));
    win.on('closed', () => {
      if (this.settingsWindow === win) this.settingsWindow = null;
    });
    this.settingsWindow = win;
  }

  private openToast(): void {
    if (this.toast && !this.toast.isDestroyed()) {
      // Reuse the window (Retry upload): the page refetches on the session change.
      this.toast.show();
      this.broadcastSession();
      return;
    }
    const area = screen.getPrimaryDisplay().workArea;
    const width = 460;
    const height = 260;
    const win = createAppWindow({
      kind: 'toast',
      title: t(this.lang(), 'toast.title'),
      bounds: {
        x: area.x + area.width - width - 24,
        y: area.y + area.height - height - 24,
        width,
        height,
      },
    });
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => {
      const programmatic = this.closingProgrammatically.delete(win);
      if (this.toast === win) this.toast = null;
      // The user closed the result: the session ends. Closing it ourselves does not.
      if (!programmatic && (this.state === 'done' || this.state === 'partial')) {
        this.dispatch({ type: 'session:discard' });
      }
    });
    this.toast = win;
  }

  private async openLink(url: string): Promise<void> {
    if (!isAllowedJiraLink(url, this.jiraBaseUrl())) {
      // E2E runs Jira on http://127.0.0.1 and never opens a browser.
      log('ipc.rejected', { channel: IPC.appOpenLink, reason: 'url' });
      throw new AppFailure(appError('FORBIDDEN', { detail: 'link not allowed' }));
    }
    await openValidatedExternal(url);
  }

  // ---------------------------------------------------------------- drafting

  private async allowedFor(
    projectKey: string,
  ): Promise<{ issueTypes: string[]; priorities: string[] }> {
    let meta = this.createMetaCache.get(projectKey);
    if (!meta) {
      try {
        meta = await this.withJira((c) => loadCreateMeta(c, projectKey));
        this.createMetaCache.set(projectKey, meta);
      } catch {
        meta = undefined;
      }
    }
    if (!meta || meta.issueTypes.length === 0)
      return { issueTypes: ['Bug'], priorities: [...PRIORITIES] };
    return { issueTypes: meta.issueTypes.map((i) => i.name), priorities: meta.priorities };
  }

  private async callProvider(request: DraftRequest, data: SessionData | null): Promise<void> {
    if (!data) return;
    const finish = (event: FlowEvent, result: DraftResult) => {
      if (this.data === data && this.state === 'drafting') this.dispatch(event);
      data.pendingDraft?.resolve(result);
      data.draftAbort = null;
    };
    const status = this.killSwitch.current();
    const provider = this.provider();
    if (provider === null || status.aiDisabled || data.redactedPng === null) {
      const error = appError('AI_UNAVAILABLE', {
        detail: data.redactedPng === null ? 'no redacted image' : 'no provider',
      });
      if (status.aiDisabled && status.message)
        error.userMessage = format(this.lang(), 'editor.aiOff', { message: status.message });
      finish({ type: 'draft:failure', error }, { kind: 'failed', error });
      return;
    }
    const abort = new AbortController();
    data.draftAbort = abort;
    log('draft.request', { bugLanguage: request.bugLanguage });
    const started = Date.now();
    try {
      const allowed = await this.allowedFor(request.projectKey);
      const draft = await requestDraft(
        provider,
        {
          imagePng: aiCopy(data.redactedPng, config.aiMaxEdge),
          prompt: request.prompt,
          context: {
            appName: data.session.sourceApp?.name ?? null,
            windowTitle: data.session.sourceApp?.windowTitle ?? null,
            os: `${data.session.os.platform} ${data.session.os.release}`,
          },
          bugLanguage: request.bugLanguage,
          allowed,
        },
        abort.signal,
        this.jiraHost(),
      );
      log('draft.success', { ms: Date.now() - started });
      finish({ type: 'draft:success', draft }, { kind: 'ok', draft });
    } catch (error) {
      const appErr = failureOf(error);
      log('draft.failure', { code: appErr.code, ms: Date.now() - started });
      if (appErr.code === 'CANCELLED') {
        data.pendingDraft?.resolve({ kind: 'failed', error: appErr });
        return;
      }
      finish({ type: 'draft:failure', error: appErr }, { kind: 'failed', error: appErr });
    }
  }

  // ---------------------------------------------------------------- creating

  /** Re-checks everything the renderer sent; the renderer is not trusted with the labels. */
  private normaliseApproved(bug: ApprovedBug, data: SessionData): ApprovedBug {
    const id = data.session.id;
    if (bug.requestId !== id)
      throw new AppFailure(appError('UNKNOWN', { detail: 'request id mismatch' }));
    for (const key of Object.keys(bug.extraFields)) {
      if (HANDLED_FIELDS.has(key))
        throw new AppFailure(appError('UNKNOWN', { detail: 'reserved extra field' }));
    }
    const summary = sanitizeSummary(bug.summary, this.jiraHost());
    if (summary === '')
      throw new AppFailure(appError('FIELD_ERROR', { fieldErrors: { summary: 'required' } }));
    return {
      ...bug,
      summary,
      labels: ['laqta', requestLabel(id), ...sanitizeLabels(bug.labels)],
      attachmentFileName: attachmentFileName(id),
    };
  }

  private attachmentPng(data: SessionData): Buffer {
    if (data.redactedPng === null)
      throw new AppFailure(appError('UNKNOWN', { detail: 'no image' }));
    return fitAttachment(data.redactedPng, config.maxAttachmentBytes);
  }

  private async runCreate(bug: ApprovedBug, data: SessionData | null): Promise<void> {
    if (!data) return;
    let outcome;
    try {
      outcome = await this.withJira((c) => createIssue(c, bug));
    } catch (error) {
      this.dispatch({ type: 'create:failed', error: failureOf(error), retryable: true });
      return;
    }
    log('jira.create', { outcome: outcome.kind });
    if (outcome.kind === 'failed') {
      if (outcome.error.code === 'NETWORK_UNREACHABLE' || outcome.error.code === 'TLS_ERROR')
        this.setConnection('offline');
      this.dispatch({ type: 'create:failed', error: outcome.error, retryable: outcome.retryable });
      return;
    }
    if (outcome.kind === 'unknown') {
      this.dispatch({ type: 'create:unknown' });
      return;
    }
    data.issueKey = outcome.issueKey;
    await this.runUpload(outcome.issueKey, data);
  }

  private async runVerify(data: SessionData | null): Promise<void> {
    if (!data) return;
    let found: string | null;
    try {
      found = await this.withJira((c) => findByRequestLabel(c, data.session.id));
    } catch {
      found = null;
    }
    if (found !== null) {
      data.issueKey = found;
      this.dispatch({ type: 'verify:found', issueKey: found });
      return;
    }
    this.dispatch({ type: 'verify:notFound' });
    // Spec section 8: not found means Create may be clicked again.
    data.pendingCreate?.resolve({
      kind: 'failed',
      error: { code: 'UNKNOWN', userMessage: t(this.lang(), 'error.CREATE_UNKNOWN') },
      retryable: true,
    });
  }

  private async runUpload(issueKey: string, data: SessionData | null): Promise<void> {
    if (!data) return;
    let result: CreateResult;
    try {
      const png = this.attachmentPng(data);
      result = await this.withJira((c) =>
        attachAndFinish(c, issueKey, {
          png,
          fileName: attachmentFileName(data.session.id),
          downscale: (p) => shrinkOnce(p),
        }),
      );
    } catch (error) {
      const browseUrl = `${this.jiraBaseUrl().replace(/\/+$/, '')}/browse/${encodeURIComponent(issueKey)}`;
      result = { kind: 'partial', issueKey, browseUrl, attachmentError: failureOf(error) };
    }
    if (result.kind === 'ok') {
      this.dispatch({ type: 'create:ok', issueKey: result.issueKey, browseUrl: result.browseUrl });
    } else if (result.kind === 'partial') {
      this.dispatch({
        type: 'create:partial',
        issueKey: result.issueKey,
        browseUrl: result.browseUrl,
        error: result.attachmentError,
      });
    }
    data.pendingCreate?.resolve(result);
  }

  private showResult(
    issueKey: string,
    browseUrl: string,
    attachmentError: ReturnType<typeof appError> | null,
    data: SessionData | null,
  ): void {
    if (data) {
      this.offline.delete(data.session.id);
      if (attachmentError === null) {
        this.telemetry.record({
          name: 'hotkey_to_created',
          ms: Math.min(Date.now() - data.startedAt, 86_400_000),
        });
      }
      const summary = data.approved?.summary ?? '';
      this.recent = [
        { key: issueKey, summary, browseUrl },
        ...this.recent.filter((r) => r.key !== issueKey),
      ].slice(0, 5);
      this.refreshTray();
    }
    this.toastData =
      attachmentError === null
        ? {
            kind: 'ok',
            issueKey,
            browseUrl,
            assigneeName: data?.approved?.assigneeUsername ?? null,
          }
        : { kind: 'partial', issueKey, browseUrl, attachmentError };
    this.openToast();
  }

  // ---------------------------------------------------------------- offline drafts

  private resumeDraft(requestId: string): void {
    if (this.state !== 'idle') {
      this.focusSession();
      return;
    }
    const saved = this.offline.load(requestId);
    if (saved === null) {
      this.refreshTray();
      return;
    }
    const data = this.newSessionData('area', saved.requestId);
    const png = Buffer.from(saved.imagePngBase64, 'base64');
    data.redactedPng = png;
    data.session.imagePath = this.temp.write(data.session.id, png);
    data.session.width = saved.width;
    data.session.height = saved.height;
    data.session.sourceApp =
      saved.sourceAppName === null ? null : { name: saved.sourceAppName, windowTitle: '' };
    data.draft = saved.review.draft;
    data.restored = saved.review;
    this.data = data;
    this.dispatch({ type: 'draft:restore', review: saved.review });
  }

  // ---------------------------------------------------------------- settings

  private settingsView(): SettingsView {
    const status = this.killSwitch.current();
    return {
      settings: this.settings.get(),
      hasToken: this.tokens.has(),
      encryptionAvailable: this.tokens.available(),
      appVersion: app.getVersion(),
      aiDisabledMessage: status.aiDisabled ? (status.message ?? '') : null,
      allowHttpJira: this.e2e,
      gatewayConfigured: config.gatewayUrl !== null,
    };
  }

  private async testConnection(p: {
    baseUrl: string;
    token?: string | undefined;
    deployment: 'datacenter' | 'cloud';
    email?: string | undefined;
  }): Promise<TestConnectionResult> {
    const useToken = p.token !== undefined && p.token !== '' ? p.token : this.tokens.get();
    if (useToken === null) return { ok: false, error: appError('AUTH_INVALID') };
    try {
      const client = new JiraClient({
        baseUrl: p.baseUrl,
        token: useToken,
        deployment: p.deployment,
        email: p.email,
        fetch: fetchViaNet,
        allowHttpForTests: this.e2e,
      });
      return await testJiraConnection(client);
    } catch (error) {
      return { ok: false, error: failureOf(error) };
    }
  }

  private saveSettings(next: Settings, token: string | undefined): SettingsSetResult {
    if (token !== undefined) {
      try {
        this.tokens.set(token);
      } catch (error) {
        if (error instanceof EncryptionUnavailableError)
          throw new AppFailure(appError('UNKNOWN', { detail: 'encryption unavailable' }));
        throw error;
      }
    }
    const before = this.settings.get();
    const saved = this.settings.set(next);
    setErrorLanguage(saved.uiLanguage);
    setVoicePermission(saved.voiceEnabled);
    if (
      before.jiraBaseUrl !== saved.jiraBaseUrl ||
      before.jiraDeployment !== saved.jiraDeployment
    ) {
      this.createMetaCache.clear();
    }
    const conflicts = this.applyHotkeys(false);
    if (saved.uiLanguage !== before.uiLanguage)
      this.tray?.setToolTip(t(saved.uiLanguage, 'tray.tooltip'));
    this.refreshTray();
    void this.refreshConnection();
    return { ...this.settingsView(), hotkeyConflicts: conflicts };
  }

  // ---------------------------------------------------------------- IPC

  private requireSession(): SessionData {
    if (!this.data)
      throw new AppFailure({ code: 'NOT_FOUND', userMessage: t(this.lang(), 'error.noSession') });
    return this.data;
  }

  private registerIpc(): void {
    const deps = {
      isOwnWindow: (id: number) => windowKindOf(id) !== undefined,
      isOwnUrl: (url: string) => isOwnRendererUrl(url),
    };
    const handle = <P, R>(
      channel: string,
      schema: z.ZodType<P> | null,
      handler: (payload: P, sender: SenderInfo) => Promise<R> | R,
    ) => {
      const run = guarded(channel, schema, handler, deps);
      ipcMain.handle(channel, (event: IpcMainInvokeEvent, raw: unknown) => {
        const frame = event.senderFrame;
        const sender: SenderInfo = {
          webContentsId: event.sender.id,
          frameUrl: frame?.url ?? null,
          isMainFrame: frame !== null && frame === event.sender.mainFrame,
        };
        return run(sender, raw);
      });
    };
    const onlyKind = (sender: SenderInfo, kinds: readonly string[]) => {
      const kind = windowKindOf(sender.webContentsId);
      if (kind === undefined || !kinds.includes(kind))
        throw new AppFailure(appError('FORBIDDEN', { detail: 'wrong window' }));
    };

    handle(IPC.captureStart, CaptureStartSchema, ({ mode }) => this.dispatchCaptureStart(mode));
    handle(IPC.captureComplete, CaptureCompleteSchema, (p, sender) => {
      onlyKind(sender, ['overlay']);
      if (this.overlayDisplayByWc.get(sender.webContentsId) !== p.displayId) {
        throw new AppFailure(appError('FORBIDDEN', { detail: 'display mismatch' }));
      }
      if (this.data) this.data.session.captureMode = p.mode;
      this.dispatch({
        type: 'capture:complete',
        displayId: p.displayId,
        rect: p.rect,
        mode: p.mode,
      });
    });
    handle(IPC.captureCancel, null, (_p, sender) => {
      onlyKind(sender, ['overlay']);
      log('capture.cancel', {});
      this.dispatch({ type: 'capture:cancel' });
    });
    handle(IPC.overlayGetFrame, null, (_p, sender) => {
      onlyKind(sender, ['overlay']);
      return this.overlayFrame(sender);
    });
    handle(IPC.sessionGet, null, () => (this.data ? { ...this.data.session } : null));
    handle(IPC.sessionGetImage, null, (_p, sender): SessionImage => {
      onlyKind(sender, ['workbench']);
      const data = this.requireSession();
      const png = data.redactedPng ?? data.originalPng;
      if (png === null) throw new AppFailure(appError('NOT_FOUND'));
      return { png: new Uint8Array(png), width: data.session.width, height: data.session.height };
    });
    handle(IPC.sessionSetRedactedImage, SetRedactedImageSchema, (p, sender) => {
      onlyKind(sender, ['workbench']);
      const data = this.requireSession();
      if (this.state !== 'editing')
        throw new AppFailure(appError('UNKNOWN', { detail: 'not editing' }));
      const size = pngSize(p.png);
      if (size.width !== p.width || size.height !== p.height || size.width === 0) {
        throw new AppFailure(appError('UNKNOWN', { detail: 'bad png' }));
      }
      // Spec section 5: replace the temp file, then zero and discard the original bytes.
      const redacted = Buffer.from(p.png);
      this.temp.write(data.session.id, redacted);
      data.originalPng?.fill(0);
      data.originalPng = null;
      data.redactedPng?.fill(0);
      data.redactedPng = redacted;
      data.session.width = size.width;
      data.session.height = size.height;
    });
    handle(IPC.sessionBack, null, (_p, sender) => {
      onlyKind(sender, ['workbench']);
      this.dispatch({ type: 'back' });
    });
    handle(IPC.sessionDiscard, null, () => {
      if (this.state !== 'idle') this.dispatch({ type: 'session:discard' });
    });
    handle(IPC.sessionGetReview, null, (_p, sender) => {
      onlyKind(sender, ['workbench']);
      return this.data?.restored ?? null;
    });
    handle(IPC.draftRequest, DraftRequestSchema, async (p, sender): Promise<DraftResult> => {
      onlyKind(sender, ['workbench']);
      const data = this.requireSession();
      if (data.redactedPng === null)
        throw new AppFailure(appError('UNKNOWN', { detail: 'image not exported' }));
      const pending = deferred<DraftResult>();
      data.pendingDraft = pending;
      if (!this.dispatch({ type: 'draft:request', request: p })) {
        throw new AppFailure(appError('UNKNOWN', { detail: 'not editing' }));
      }
      return pending.promise;
    });
    handle(IPC.draftCancel, null, (_p, sender) => {
      onlyKind(sender, ['workbench']);
      this.dispatch({ type: 'draft:cancel' });
    });
    handle(IPC.draftKeepForLater, ReviewStateSchema, (review, sender) => {
      onlyKind(sender, ['workbench']);
      const data = this.requireSession();
      if (data.redactedPng === null) return { saved: false };
      try {
        this.offline.save({
          requestId: data.session.id,
          review,
          png: data.redactedPng,
          sourceAppName: data.session.sourceApp?.name ?? null,
          width: data.session.width,
          height: data.session.height,
        });
      } catch (error) {
        if (error instanceof EncryptionUnavailableError) return { saved: false };
        throw error;
      }
      this.dispatch({ type: 'session:discard' });
      this.refreshTray();
      return { saved: true };
    });
    handle(IPC.voiceTranscribe, VoiceTranscribeSchema, async (p, sender) => {
      onlyKind(sender, ['workbench']);
      if (!this.settings.get().voiceEnabled) throw new AppFailure(appError('PERMISSION_DENIED'));
      log('voice.transcribe', { bytes: p.audio.byteLength });
      const text = await this.transcriber.transcribe(
        p.audio,
        p.mime,
        p.language,
        AbortSignal.timeout(60_000),
      );
      p.audio.fill(0);
      return { text };
    });
    handle(IPC.jiraSearchAssignees, SearchAssigneesSchema, (p) =>
      this.withJira((c) => searchAssignable(c, p.projectKey, p.query)),
    );
    handle(IPC.jiraResolveAssignee, ResolveAssigneeSchema, (p) =>
      this.withJira((c) => resolveAssignee(c, p.projectKey, p.query, p.transliteration)),
    );
    handle(IPC.jiraCheckDuplicates, CheckDuplicatesSchema, (p) =>
      this.withJira((c) => checkDuplicates(c, p.projectKey, p.summary)),
    );
    handle(IPC.jiraLoadCreateMeta, LoadCreateMetaSchema, async (p) => {
      const meta = await this.withJira((c) => loadCreateMeta(c, p.projectKey, p.issueTypeName));
      if (p.issueTypeName === undefined) this.createMetaCache.set(p.projectKey, meta);
      return meta;
    });
    handle(IPC.jiraListProjects, null, () =>
      this.withJira(async (c) => {
        const list = await listProjects(c);
        return JiraProjectListSchema.parse(list);
      }),
    );
    handle(IPC.jiraCreateBug, ApprovedBugSchema, (bug, sender): Promise<CreateResult> => {
      // Spec section 1: nothing is written to Jira without the user's Create bug click.
      // This channel is only reachable from the Review step's Create button.
      onlyKind(sender, ['workbench']);
      const data = this.requireSession();
      if (this.state !== 'reviewing')
        throw new AppFailure(appError('UNKNOWN', { detail: 'not reviewing' }));
      const approved = this.normaliseApproved(bug, data);
      if (data.redactedPng === null)
        throw new AppFailure(appError('UNKNOWN', { detail: 'no image' }));
      data.approved = approved;
      if (data.draft) {
        this.telemetry.record({
          name: 'draft_accepted',
          edited: approved.summary !== data.draft.summary,
        });
      }
      const pending = deferred<CreateResult>();
      data.pendingCreate = pending;
      this.dispatch({ type: 'jira:createBug', bug: approved });
      return pending.promise;
    });
    handle(IPC.jiraRetryAttachment, RetryAttachmentSchema, (p, sender): Promise<CreateResult> => {
      onlyKind(sender, ['toast', 'workbench']);
      const data = this.requireSession();
      if (p.requestId !== data.session.id || p.issueKey !== data.issueKey) {
        throw new AppFailure(appError('UNKNOWN', { detail: 'retry mismatch' }));
      }
      const pending = deferred<CreateResult>();
      data.pendingCreate = pending;
      if (!this.dispatch({ type: 'jira:retryAttachment', issueKey: p.issueKey })) {
        throw new AppFailure(appError('UNKNOWN', { detail: 'not partial' }));
      }
      return pending.promise;
    });
    handle(IPC.settingsGet, null, () => this.settingsView());
    const settingsSetSchema = this.e2e ? SettingsSetRequestSchemaForE2e : SettingsSetRequestSchema;
    const testConnectionSchema = this.e2e ? TestConnectionSchemaForE2e : TestConnectionSchema;
    handle(IPC.settingsSet, settingsSetSchema, (req, sender) => {
      onlyKind(sender, ['settings', 'workbench']);
      return this.saveSettings(req.settings, req.token);
    });
    handle(IPC.settingsTestConnection, testConnectionSchema, (p, sender) => {
      onlyKind(sender, ['settings']);
      return this.testConnection(p);
    });
    handle(IPC.toastGet, null, (_p, sender) => {
      onlyKind(sender, ['toast']);
      return this.toastData;
    });
    handle(IPC.toastClose, null, (_p, sender) => {
      onlyKind(sender, ['toast']);
      // Same as the user closing the window: ends the session.
      this.toast?.close();
    });
    handle(IPC.appOpenLink, OpenLinkSchema, (p) => this.openLink(p.url));
    handle(IPC.appCopyText, CopyTextSchema, async (p) => {
      await Promise.resolve(clipboard.writeText(p.text));
    });
    handle(IPC.appOpenSettings, null, () => this.openSettings());
    handle(IPC.permissionsGet, null, (): PermissionStatus => ({
      platform: process.platform,
      screen: this.e2e ? 'granted' : screenPermission(),
      microphone: microphonePermission(),
    }));
    handle(IPC.permissionsOpenSystemSettings, PermissionKindSchema, (p) => {
      if (process.platform !== 'darwin') return;
      return shell.openExternal(
        p.kind === 'screen' ? MAC_SCREEN_SETTINGS_URL : MAC_MICROPHONE_SETTINGS_URL,
      );
    });
    handle(IPC.permissionsRequestMicrophone, null, async () => {
      if (process.platform !== 'darwin') return true;
      return systemPreferences.askForMediaAccess('microphone');
    });
    handle(IPC.windowClose, null, (_p, sender) => {
      const win = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.id === sender.webContentsId,
      );
      win?.close();
    });
  }
}
