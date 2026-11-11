// Channel names from spec section 3 (and the additions in section 3.1). Every payload is
// validated with the matching schema in `main/ipc.ts` before use.

export const IPC = {
  captureStart: 'capture:start',
  captureComplete: 'capture:complete',
  captureCancel: 'capture:cancel',
  sessionGet: 'session:get',
  sessionSetRedactedImage: 'session:setRedactedImage',
  draftRequest: 'draft:request',
  draftCancel: 'draft:cancel',
  voiceTranscribe: 'voice:transcribe',
  jiraSearchAssignees: 'jira:searchAssignees',
  jiraCheckDuplicates: 'jira:checkDuplicates',
  jiraLoadCreateMeta: 'jira:loadCreateMeta',
  jiraCreateBug: 'jira:createBug',
  jiraRetryAttachment: 'jira:retryAttachment',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsTestConnection: 'settings:testConnection',
  sessionDiscard: 'session:discard',

  // section 3.1 additions
  overlayGetFrame: 'overlay:getFrame',
  sessionGetImage: 'session:getImage',
  sessionBack: 'session:back',
  sessionGetReview: 'session:getReview',
  jiraResolveAssignee: 'jira:resolveAssignee',
  jiraListProjects: 'jira:listProjects',
  draftKeepForLater: 'draft:keepForLater',
  toastGet: 'toast:get',
  toastClose: 'toast:close',
  appOpenLink: 'app:openLink',
  appCopyText: 'app:copyText',
  appOpenSettings: 'app:openSettings',
  appRelaunch: 'app:relaunch',
  permissionsGet: 'permissions:get',
  permissionsOpenSystemSettings: 'permissions:openSystemSettings',
  permissionsRequestMicrophone: 'permissions:requestMicrophone',
  windowClose: 'window:close',
} as const;

/** Main to renderer push events. */
export const IPC_EVENTS = {
  sessionChanged: 'session:changed',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
