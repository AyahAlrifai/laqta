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

export function AppMark() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 28,
        height: 28,
        borderRadius: 8,
        background: '#2F5BEA',
      }}
    />
  );
}
