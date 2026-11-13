import { useId } from 'react';
// Decorative icons are aria-hidden; the text next to them carries the meaning, so
// information is never shown by colour or icon alone (spec section 9).

export function WarningIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 3 2 21h20L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 10v5M12 18v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ErrorIcon() {
  return (
    <svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="14" style={{ fill: 'var(--danger)' }} />
      <path d="M14 7v9M14 20v1" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function SuccessIcon() {
  return (
    <svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="14" style={{ fill: 'var(--success-fill)' }} />
      <path
        d="m8 14.5 4 4 8-9"
        stroke="#fff"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
      <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function MicIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BackArrowIcon() {
  return (
    <svg aria-hidden="true" className="flip" width="18" height="18" viewBox="0 0 20 20">
      <path
        d="M16 10H4m5-5-5 5 5 5"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The app mark, as in the app icon: the viewfinder framing a bug (screenshot to bug). Same
 * paths as tools/icon/generate.cjs; below 24 px the legs drop out so it stays crisp.
 */
export function AppMark({ size = 28 }: { size?: number }) {
  // Unique per instance: two marks on one page must not share a gradient id.
  const gradient = `laqta-mark-${useId().replace(/:/g, '')}`;
  const small = size < 24;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 36 36">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b78ff" />
          <stop offset="1" stopColor="#2a45e0" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="9" fill={`url(#${gradient})`} />
      <path
        d="M8 13v-3a2 2 0 0 1 2-2h3M23 8h3a2 2 0 0 1 2 2v3M28 23v3a2 2 0 0 1-2 2h-3M13 28h-3a2 2 0 0 1-2-2v-3"
        fill="none"
        stroke="#fff"
        strokeWidth={small ? 3 : 2.2}
        strokeLinecap="round"
      />
      {small ? (
        <ellipse cx="18" cy="18.5" rx="5.2" ry="6" fill="#fff" />
      ) : (
        <>
          <path
            d="M16.6 11.7l-1.3-1.7M19.4 11.7l1.3-1.7M12.9 17.6h-2.3M23.1 17.6h2.3M12.7 21.2h-2.5M23.3 21.2h2.5M13.4 24.4l-2 1.6M22.6 24.4l2 1.6"
            fill="none"
            stroke="#fff"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="18" cy="13.7" r="2.5" fill="#fff" />
          <ellipse cx="18" cy="20.4" rx="5.2" ry="6" fill="#fff" />
          <path d="M18 16.2v9.6" stroke="#2a45e0" strokeWidth="1.2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** One icon language (T-080): 24 px grid, 1.75 stroke, round caps and joins. */
export const iconBase = {
  'aria-hidden': true,
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function SparkleIcon() {
  return (
    <svg {...iconBase}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
    </svg>
  );
}

export function LockSmallIcon() {
  return (
    <svg {...iconBase} width={16} height={16}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function ShieldSmallIcon() {
  return (
    <svg {...iconBase} width={16} height={16}>
      <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg {...iconBase} width={16} height={16}>
      <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...iconBase} width={14} height={14} strokeWidth={2.4}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CheckSmallIcon() {
  return (
    <svg {...iconBase} width={14} height={14} strokeWidth={2.6}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

/** A magnifier over the screenshot thumbnail: it opens the full-size view. */
export function ZoomImageIcon() {
  return (
    <svg {...iconBase} width={16} height={16}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5M11 8.5v5M8.5 11h5" />
    </svg>
  );
}

const PRIORITY_LOOK: Record<string, { path: string; color: string }> = {
  Highest: { path: 'M6 13l6-6 6 6M6 19l6-6 6 6', color: 'var(--danger-text)' },
  High: { path: 'M6 15l6-6 6 6', color: 'var(--danger-text)' },
  Medium: { path: 'M6 10h12M6 15h12', color: 'var(--warning-icon)' },
  Low: { path: 'M6 9l6 6 6-6', color: 'var(--accent)' },
  Lowest: { path: 'M6 5l6 6 6-6M6 11l6 6 6-6', color: 'var(--accent)' },
};

/** Jira-style priority mark, so the value is recognised at a glance; the text stays next to it. */
export function PriorityIcon({ priority }: { priority: string | null }) {
  const look = priority === null ? undefined : PRIORITY_LOOK[priority];
  if (look === undefined) return null;
  return (
    <svg {...iconBase} width={16} height={16} strokeWidth={2.25} style={{ color: look.color }}>
      <path d={look.path} />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg {...iconBase}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

/** Opens outside Laqta (Jira in the browser). Mirrors in RTL. */
export function ExternalIcon() {
  return (
    <svg {...iconBase} className="flip">
      <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

export function RetryIcon() {
  return (
    <svg {...iconBase}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
    </svg>
  );
}

export function KeyboardIcon() {
  return (
    <svg {...iconBase}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9" />
    </svg>
  );
}

/**
 * Empty and error states (T-089): the viewfinder from the logo around a symbol for what
 * happened. Decorative; the heading next to it says it in words.
 */
export function StateArt({ kind }: { kind: 'offline' | 'error' }) {
  return (
    <svg aria-hidden="true" width="72" height="72" viewBox="0 0 72 72" fill="none">
      <rect x="8" y="8" width="56" height="56" rx="16" style={{ fill: 'var(--surface-sunken)' }} />
      <g
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: 'var(--accent)' }}
      >
        <path d="M18 28v-6a4 4 0 0 1 4-4h6M44 18h6a4 4 0 0 1 4 4v6M54 44v6a4 4 0 0 1-4 4h-6M28 54h-6a4 4 0 0 1-4-4v-6" />
      </g>
      {kind === 'offline' ? (
        <g strokeWidth="2.5" strokeLinecap="round" style={{ stroke: 'var(--danger-text)' }}>
          <path d="M27 33a13 13 0 0 1 18 0M31 38a7 7 0 0 1 10 0" />
          <circle cx="36" cy="43" r="1.6" style={{ fill: 'var(--danger-text)' }} />
          <path d="M26 26l20 20" />
        </g>
      ) : (
        <g strokeWidth="2.6" strokeLinecap="round" style={{ stroke: 'var(--danger-text)' }}>
          <path d="M36 28v9M36 43v.5" />
        </g>
      )}
    </svg>
  );
}
