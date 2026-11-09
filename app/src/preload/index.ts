import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { IpcResult, LaqtaBridge } from '../shared/ipc-api';
import { IPC, IPC_EVENTS, type IpcChannel } from '../shared/ipc-channels';
import type { Session } from '../shared/types';

// Spec section 3: the preload exposes one object, `window.laqta`, with typed wrappers for
// the IPC channels and nothing else. Payloads are validated again in main.

function call<T>(channel: IpcChannel, payload?: unknown): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, payload) as Promise<IpcResult<T>>;
}

const api: LaqtaBridge = {
  platform: process.platform,
  captureStart: (p) => call(IPC.captureStart, p),
  captureComplete: (p) => call(IPC.captureComplete, p),
  captureCancel: () => call(IPC.captureCancel),
  overlayGetFrame: () => call(IPC.overlayGetFrame),
  sessionGet: () => call(IPC.sessionGet),
  sessionGetImage: () => call(IPC.sessionGetImage),
  sessionSetRedactedImage: (p) => call(IPC.sessionSetRedactedImage, p),
  sessionBack: () => call(IPC.sessionBack),
  sessionDiscard: () => call(IPC.sessionDiscard),
  sessionGetReview: () => call(IPC.sessionGetReview),
  draftRequest: (p) => call(IPC.draftRequest, p),
  draftCancel: () => call(IPC.draftCancel),
  draftKeepForLater: (review) => call(IPC.draftKeepForLater, review),
  voiceTranscribe: (p) => call(IPC.voiceTranscribe, p),
  jiraSearchAssignees: (p) => call(IPC.jiraSearchAssignees, p),
  jiraResolveAssignee: (p) => call(IPC.jiraResolveAssignee, p),
  jiraCheckDuplicates: (p) => call(IPC.jiraCheckDuplicates, p),
  jiraLoadCreateMeta: (p) => call(IPC.jiraLoadCreateMeta, p),
  jiraListProjects: () => call(IPC.jiraListProjects),
  jiraCreateBug: (bug) => call(IPC.jiraCreateBug, bug),
  jiraRetryAttachment: (p) => call(IPC.jiraRetryAttachment, p),
  settingsGet: () => call(IPC.settingsGet),
  settingsSet: (req) => call(IPC.settingsSet, req),
  settingsTestConnection: (p) => call(IPC.settingsTestConnection, p),
  toastGet: () => call(IPC.toastGet),
  toastClose: () => call(IPC.toastClose),
  appOpenLink: (p) => call(IPC.appOpenLink, p),
  appCopyText: (p) => call(IPC.appCopyText, p),
  appOpenSettings: () => call(IPC.appOpenSettings),
  permissionsGet: () => call(IPC.permissionsGet),
  permissionsOpenSystemSettings: (p) => call(IPC.permissionsOpenSystemSettings, p),
  permissionsRequestMicrophone: () => call(IPC.permissionsRequestMicrophone),
  windowClose: () => call(IPC.windowClose),
  onSessionChanged(listener) {
    const wrapped = (_event: IpcRendererEvent, session: Session | null) => listener(session);
    ipcRenderer.on(IPC_EVENTS.sessionChanged, wrapped);
    return () => ipcRenderer.removeListener(IPC_EVENTS.sessionChanged, wrapped);
  },
};

contextBridge.exposeInMainWorld('laqta', Object.freeze(api));
