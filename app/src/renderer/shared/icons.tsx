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
      <circle cx="14" cy="14" r="14" fill="#C2362B" />
      <path d="M14 7v9M14 20v1" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function SuccessIcon() {
  return (
    <svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="14" fill="#14683D" />
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
      <rect x="9" y="3" width="6" height="11" rx="3" fill="#2F5BEA" />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke="#2F5BEA"
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

/** The app mark: the tray viewfinder on the accent tile, as in the app icon. */
export function AppMark({ size = 28 }: { size?: number }) {
  // Unique per instance: two marks on one page must not share a gradient id.
  const gradient = `laqta-mark-${useId().replace(/:/g, '')}`;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 36 36">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a72f0" />
          <stop offset="1" stopColor="#1d3fb8" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="9" fill={`url(#${gradient})`} />
      <g fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 14v-3a1 1 0 0 1 1-1h3M22 10h3a1 1 0 0 1 1 1v3M26 22v3a1 1 0 0 1-1 1h-3M14 26h-3a1 1 0 0 1-1-1v-3" />
      </g>
      <circle cx="18" cy="18" r="2.8" fill="#fff" />
    </svg>
  );
}

const line = {
  'aria-hidden': true,
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function SparkleIcon() {
  return (
    <svg {...line}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
    </svg>
  );
}

export function LockSmallIcon() {
  return (
    <svg {...line} width={16} height={16}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function ShieldSmallIcon() {
  return (
    <svg {...line} width={16} height={16}>
      <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg {...line} width={16} height={16}>
      <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg {...line} width={14} height={14} strokeWidth={2.4}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
