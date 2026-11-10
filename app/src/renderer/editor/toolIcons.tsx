// Decorative toolbar icons. Every button also carries its text or an aria-label.

const common = {
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

export function SelectIcon() {
  return (
    <svg {...common}>
      <path d="M5 3l14 7-6 2-2 6L5 3Z" />
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
