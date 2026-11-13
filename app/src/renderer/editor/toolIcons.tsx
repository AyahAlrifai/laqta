// Decorative toolbar icons. Every button also carries its text or an aria-label.

import { iconBase } from '../shared/icons';

const common = { ...iconBase, width: 16, height: 16 } as const;

/** A hand: select and move what is already on the image. */
export function SelectIcon() {
  return (
    <svg {...common}>
      <path d="M18 11V6a2 2 0 0 0-4 0v0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15" />
    </svg>
  );
}

export function BoxIcon() {
  return (
    <svg {...common}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
    </svg>
  );
}

export function ArrowIcon() {
  return (
    <svg {...common} className="flip">
      <path d="M5 19 19 5M10 5h9v9" />
    </svg>
  );
}

export function TextIcon() {
  return (
    <svg {...common}>
      <path d="M5 6V4h14v2M12 4v16M9 20h6" />
    </svg>
  );
}

export function BlurIcon() {
  return (
    <svg {...common}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 12h16M12 4v16" strokeDasharray="2 3" />
    </svg>
  );
}

export function UndoIcon() {
  return (
    <svg {...common} className="flip">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </svg>
  );
}

export function RedoIcon() {
  return (
    <svg {...common} className="flip">
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9a5 5 0 0 0 0 10h3" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg {...common}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  );
}
