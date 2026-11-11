import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { AssigneeCandidate } from '../../shared/types';
import { useI18n } from '../shared/i18n';
import styles from './Review.module.css';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

/** What the AI's assignee hint resolved to, before the user has chosen. */
export type AssigneeSuggestion =
  | { kind: 'ambiguous'; name: string; candidates: AssigneeCandidate[] }
  | { kind: 'none'; name: string };

interface Props {
  value: AssigneeCandidate | null;
  /** Shown under the field when the AI's hint matched exactly one person. */
  matchedFrom: string | null;
  suggestion: AssigneeSuggestion | null;
  disabled: boolean;
  search: (query: string) => Promise<AssigneeCandidate[]>;
  onChange: (assignee: AssigneeCandidate | null) => void;
}

const SEARCH_DELAY_MS = 300;
const MIN_QUERY = 2;

type Status = 'idle' | 'searching' | 'empty' | 'error';

/**
 * One field for the assignee (WAI-ARIA combobox): type to search Jira, pick from the list,
 * or clear it. An ambiguous AI match opens the list with the candidates and nothing chosen:
 * the user must pick (spec section 1), which the Review step enforces through `confirmed`.
 */
export default function AssigneeField({
  value,
  matchedFrom,
  suggestion,
  disabled,
  search,
  onChange,
}: Props) {
  const { t, f } = useI18n();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(value?.displayName ?? suggestion?.name ?? '');
  const [options, setOptions] = useState<AssigneeCandidate[]>(
    suggestion?.kind === 'ambiguous' ? suggestion.candidates : [],
  );
  const [open, setOpen] = useState(suggestion !== null);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<Status>(suggestion?.kind === 'none' ? 'empty' : 'idle');
  const [hint, setHint] = useState<AssigneeSuggestion | null>(suggestion);
  const request = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  // The suggestion arrives after the field mounts (the resolve call is async).
  useEffect(() => {
    if (suggestion === null) return;
    setHint(suggestion);
    setText(suggestion.name);
    setOptions(suggestion.kind === 'ambiguous' ? suggestion.candidates : []);
    setStatus(suggestion.kind === 'none' ? 'empty' : 'idle');
    setOpen(true);
    setActive(-1);
    // The field is below the fold, and Create stays disabled until the user picks, so bring
    // the choice into view instead of leaving a greyed-out button unexplained.
    // Wait a frame so the list is rendered and the whole choice fits in view.
    requestAnimationFrame(() => rootRef.current?.scrollIntoView({ block: 'nearest' }));
  }, [suggestion]);

  // A choice made elsewhere (or the preselected match) shows as the field's text.
  useEffect(() => {
    if (value !== null) setText(value.displayName);
  }, [value]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Rows: each person, then "Leave unassigned" last.
  const rowCount = options.length + 1;

  function choose(candidate: AssigneeCandidate | null) {
    window.clearTimeout(timer.current);
    request.current += 1;
    onChange(candidate);
    setText(candidate?.displayName ?? '');
    setHint(null);
    setOpen(false);
    setActive(-1);
    setStatus('idle');
  }

  function runSearch(query: string) {
    const id = ++request.current;
    setStatus('searching');
    search(query)
      .then((found) => {
        if (id !== request.current) return;
        setOptions(found);
        setStatus(found.length === 0 ? 'empty' : 'idle');
        setActive(found.length > 0 ? 0 : -1);
      })
      .catch(() => {
        if (id !== request.current) return;
        setOptions([]);
        setStatus('error');
      });
  }

  function onInput(next: string) {
    setText(next);
    setHint(null);
    setOpen(true);
    window.clearTimeout(timer.current);
    const query = next.trim();
    if (query.length < MIN_QUERY) {
      request.current += 1;
      setOptions([]);
      setStatus('idle');
      setActive(-1);
      return;
    }
    timer.current = window.setTimeout(() => runSearch(query), SEARCH_DELAY_MS);
  }

  /** Leaving the field without choosing puts back what is actually assigned. */
  function restore() {
    if (hint !== null) return; // an unresolved AI match stays visible until the user picks
    setOpen(false);
    setActive(-1);
    setText(value?.displayName ?? '');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + rowCount) % rowCount);
    } else if (e.key === 'Enter' && open && active >= 0) {
      e.preventDefault();
      choose(active < options.length ? (options[active] ?? null) : null);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setHint(null);
      setOpen(false);
      setActive(-1);
      setText(value?.displayName ?? '');
    }
  }

  const optionId = (i: number) => `${listId}-opt-${String(i)}`;
  const message =
    hint?.kind === 'ambiguous'
      ? f('review.assigneeAmbiguous', { name: hint.name })
      : status === 'searching'
        ? t('review.assigneeSearching')
        : status === 'empty'
          ? f('review.noAssigneeMatch', { query: hint?.name ?? text.trim() })
          : status === 'error'
            ? t('review.assigneeSearchFailed')
            : null;

  return (
    <div ref={rootRef} className={styles.assigneeField}>
      <label className="label" htmlFor={`${listId}-input`}>
        {t('review.assignee')}
      </label>
      <div className={styles.comboBox}>
        <span className={`${styles.avatarSmall} ${styles.comboAvatar}`} aria-hidden="true">
          {value !== null ? initials(value.displayName) : '?'}
        </span>
        <input
          ref={inputRef}
          id={`${listId}-input`}
          className={`input ${styles.comboInput}`}
          dir="auto"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          aria-describedby={`${listId}-msg`}
          aria-invalid={hint !== null}
          placeholder={value === null ? t('review.assigneePlaceholder') : undefined}
          maxLength={100}
          value={text}
          disabled={disabled}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={restore}
        />
        {value !== null && (
          <button
            type="button"
            className={styles.comboClear}
            aria-label={t('review.assigneeClear')}
            disabled={disabled}
            onClick={() => {
              choose(null);
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className={`dropdown-list ${styles.comboList}`}
          aria-label={t('review.assignee')}
        >
          {options.map((c, i) => (
            <li
              key={c.username}
              id={optionId(i)}
              role="option"
              aria-selected={value?.username === c.username}
              className={`dropdown-option ${i === active ? 'dropdown-option-active' : ''}`}
              // mousedown, not click: the input's blur would close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(c);
              }}
            >
              <span className={styles.avatarSmall} aria-hidden="true">
                {initials(c.displayName)}
              </span>
              <span>
                <span className={styles.personName} dir="auto">
                  {c.displayName}
                </span>
                <span className={styles.personMeta} dir="auto">
                  {c.email ?? c.username}
                </span>
              </span>
            </li>
          ))}
          <li
            id={optionId(options.length)}
            role="option"
            aria-selected={value === null && hint === null}
            className={`dropdown-option ${styles.comboUnassigned} ${
              active === options.length ? 'dropdown-option-active' : ''
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              choose(null);
            }}
          >
            {t('picker.leaveUnassigned')}
          </li>
        </ul>
      )}
      <p id={`${listId}-msg`} className={styles.comboMessage} aria-live="polite">
        {message ??
          (value !== null && matchedFrom !== null ? (
            <span className={styles.matched} dir="auto">
              {f('review.matchedFrom', { query: matchedFrom })}
            </span>
          ) : null)}
      </p>
    </div>
  );
}
