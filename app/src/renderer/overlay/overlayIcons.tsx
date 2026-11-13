// Decorative mode-bar icons. Every button also carries its text label.

import { iconBase } from '../shared/icons';

const common = { ...iconBase, width: 16, height: 16 } as const;

/** Area: a dashed selection with corner marks. */
export function AreaIcon() {
  return (
    <svg {...common}>
      <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
      <rect x="8" y="8" width="8" height="8" rx="1" strokeDasharray="2 2" />
    </svg>
  );
}

export function WindowIcon() {
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M6.5 6.5h.01M9 6.5h.01" />
    </svg>
  );
}

export function ScreenIcon() {
  return (
    <svg {...common}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function CancelIcon() {
  return (
    <svg {...common}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function ContinueIcon() {
  return (
    <svg {...common}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

/** Six dots: the drag handle. */
export function GripIcon() {
  return (
    <svg {...common} fill="currentColor" stroke="none">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}
