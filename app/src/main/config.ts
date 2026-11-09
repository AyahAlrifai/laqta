// Build-time configuration (electron-vite exposes MAIN_VITE_* variables to the main
// process). Central config is Phase 3; until then these come from the build environment.

function str(value: string | undefined): string | null {
  return value === undefined || value.trim() === '' ? null : value.trim();
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  e2e: process.env.LAQTA_E2E === '1',
  gatewayUrl: str(import.meta.env.MAIN_VITE_GATEWAY_URL),
  updateFeedUrl: str(import.meta.env.MAIN_VITE_UPDATE_URL),
  statusUrl: str(import.meta.env.MAIN_VITE_STATUS_URL),
  statusPublicKey: str(import.meta.env.MAIN_VITE_STATUS_PUBLIC_KEY),
  telemetryUrl: str(import.meta.env.MAIN_VITE_TELEMETRY_URL),
  /** Spec section 5: default 8,000,000, to be set from the real Jira limit (T-002). */
  maxAttachmentBytes: num(import.meta.env.MAIN_VITE_MAX_ATTACHMENT_BYTES, 8_000_000),
  offlineDraftHours: num(import.meta.env.MAIN_VITE_OFFLINE_DRAFT_HOURS, 24),
  /** Spec section 5: long edge of the AI copy, to confirm against the vision docs (T-003). */
  aiMaxEdge: 1568,
} as const;
