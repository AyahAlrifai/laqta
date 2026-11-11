import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  id: string;
  /** Names the list of options; usually the same text as the field's <label>. */
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  /** Shown when the value matches no option. It is not an option itself. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-busy'?: boolean;
  'aria-required'?: boolean;
}

interface Place {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

const GAP = 4;
const MAX_LIST = 280;

/**
 * Laqta's one dropdown (WAI-ARIA select-only combobox), so every choice in the app looks and
 * behaves the same instead of taking each platform's native popup. Focus stays on the
 * trigger; the list follows with aria-activedescendant. The list is position: fixed so a
 * scrolling card never clips it, and it opens upwards when there is no room below.
 */
export default function Select({
  id,
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  className,
  ...aria
}: Props) {
  const listId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<Place | null>(null);
  const typed = useRef({ text: '', at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  // Closing on disable keeps a list from hanging over a field that went away.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const r = trigger.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom - GAP - 8;
      const above = r.top - GAP - 8;
      const up = below < Math.min(MAX_LIST, 160) && above > below;
      setPlace({
        left: r.left,
        width: r.width,
        maxHeight: Math.min(MAX_LIST, up ? above : below),
        ...(up ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || active < 0) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${String(active)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function show(at: number) {
    if (disabled || options.length === 0) return;
    setOpen(true);
    setActive(at);
  }

  function choose(index: number) {
    const option = options[index];
    setOpen(false);
    if (option !== undefined && option.value !== value) onChange(option.value);
  }

  /** Type-ahead: letters typed quickly together jump to the first option starting with them. */
  function typeAhead(char: string): number {
    const now = Date.now();
    typed.current.text = now - typed.current.at < 700 ? typed.current.text + char : char;
    typed.current.at = now;
    const q = typed.current.text.toLocaleLowerCase();
    const from = Math.max(active, 0);
    const order = [...options.keys()].map(
      (i) => (i + from + (q.length === 1 ? 1 : 0)) % options.length,
    );
    return order.find((i) => options[i]?.label.toLocaleLowerCase().startsWith(q)) ?? -1;
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const last = options.length - 1;
    const start = selectedIndex >= 0 ? selectedIndex : 0;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show(start);
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        show(e.key === 'Home' ? 0 : last);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const hit = typeAhead(e.key);
        if (hit >= 0) show(hit);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => Math.min(i + 1, last));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
      case 'PageUp':
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
      case 'PageDown':
        e.preventDefault();
        setActive(last);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(active);
        break;
      case 'Tab':
        choose(active);
        break;
      case 'Escape':
        // Only this list closes; the window's own Escape handling must not run as well.
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const hit = typeAhead(e.key);
          if (hit >= 0) setActive(hit);
        }
    }
  }

  const optionId = (i: number) => `${listId}-${String(i)}`;
  return (
    <div className={`dropdown ${className ?? ''}`}>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        className="select dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        data-value={value}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show(selectedIndex >= 0 ? selectedIndex : 0))}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        {...aria}
      >
        <span
          className={`dropdown-value ${selected === undefined ? 'dropdown-placeholder' : ''}`}
          dir="auto"
        >
          {selected?.label ?? placeholder ?? ''}
        </span>
        <svg
          className="dropdown-chevron"
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && place !== null && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={label}
          className="dropdown-list"
          style={{
            position: 'fixed',
            left: place.left,
            width: place.width,
            top: place.top,
            bottom: place.bottom,
            maxHeight: place.maxHeight,
          }}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={optionId(i)}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              className={`dropdown-option ${i === active ? 'dropdown-option-active' : ''}`}
              dir="auto"
              // mousedown, not click: the trigger's blur would close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(i);
              }}
              onMouseMove={() => setActive(i)}
            >
              <span className="dropdown-option-label">{o.label}</span>
              {o.value === value && (
                <svg
                  className="dropdown-check"
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 12.5 4.5 4.5L19 7" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
