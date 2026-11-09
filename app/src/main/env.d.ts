interface ImportMetaEnv {
  readonly MAIN_VITE_GATEWAY_URL?: string;
  readonly MAIN_VITE_UPDATE_URL?: string;
  readonly MAIN_VITE_STATUS_URL?: string;
  readonly MAIN_VITE_STATUS_PUBLIC_KEY?: string;
  readonly MAIN_VITE_TELEMETRY_URL?: string;
  readonly MAIN_VITE_MAX_ATTACHMENT_BYTES?: string;
  readonly MAIN_VITE_OFFLINE_DRAFT_HOURS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
