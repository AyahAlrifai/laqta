import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { addLabels, MAX_EXTRA_LABELS, normalizeLabel } from '../../shared/labels';
import { useI18n } from '../shared/i18n';
import styles from './Review.module.css';

interface Props {
  id: string;
  labels: readonly string[];
  disabled: boolean;
  onChange: (labels: string[]) => void;
}

// Comma, space and Enter end a label, as in Jira: a Jira label cannot contain a space.
const SEPARATOR = /[,\s]+/;

/** The extra labels as removable chips, after the fixed `laqta` one. */
export default function LabelsField({ id, labels, disabled, onChange }: Props) {
  const { t, f } = useI18n();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const full = labels.length >= MAX_EXTRA_LABELS;
  const hintId = `${id}-hint`;

  const commit = (raws: readonly string[]) => {
    const next = addLabels(labels, raws);
    if (next.length !== labels.length) onChange(next);
    const invalid = raws.find((r) => r.trim() !== '' && normalizeLabel(r) === '');
    setError(invalid === undefined ? null : f('review.labelInvalid', { text: invalid.trim() }));
  };

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const parts = e.target.value.split(SEPARATOR);
    // The last part is still being typed; everything before a separator is a finished label.
    const rest = parts.pop() ?? '';
    if (parts.length > 0) commit(parts);
    setText(rest);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit([text]);
      setText('');
    } else if (e.key === 'Backspace' && text === '' && labels.length > 0) {
      onChange(labels.slice(0, -1));
    }
  };

  const remove = (label: string) => {
    onChange(labels.filter((l) => l !== label));
    setError(null);
    document.getElementById(id)?.focus();
  };

  return (
    <>
      <div className={`${styles.labelsBox} ${disabled ? styles.labelsDisabled : ''}`}>
        <span className={styles.labelChip} title={t('review.labelFixed')}>
          laqta
        </span>
        {labels.map((label) => (
          <span key={label} className={styles.labelChip}>
            {label}
            <button
              type="button"
              className={styles.labelRemove}
              aria-label={f('review.labelRemove', { name: label })}
              disabled={disabled}
              onClick={() => remove(label)}
            >
              ×
            </button>
          </span>
        ))}
        {!full && (
          <input
            id={id}
            className={styles.labelsInput}
            value={text}
            placeholder={t('review.labelsPlaceholder')}
            aria-describedby={hintId}
            aria-invalid={error !== null}
            autoComplete="off"
            spellCheck={false}
            dir="auto"
            disabled={disabled}
            onChange={onInput}
            onKeyDown={onKeyDown}
            onBlur={() => {
              if (text.trim() === '') return;
              commit([text]);
              setText('');
            }}
          />
        )}
      </div>
      <p
        id={hintId}
        className={`${styles.labelsHint} ${error !== null ? styles.labelsError : ''}`}
        aria-live="polite"
      >
        {error ??
          (full ? t('review.labelsFull') : f('review.labelsHint', { max: MAX_EXTRA_LABELS }))}
      </p>
    </>
  );
}
