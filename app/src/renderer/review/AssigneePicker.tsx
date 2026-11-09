import { useId, useState } from 'react';
import type { AssigneeCandidate } from '../../shared/types';
import Dialog from '../shared/Dialog';
import { useI18n } from '../shared/i18n';
import styles from './Review.module.css';

interface Props {
  name: string | null;
  candidates: readonly AssigneeCandidate[];
  onPick: (c: AssigneeCandidate | null) => void;
  onCancel: () => void;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

/** Board 4, card 2: radio group, nothing preselected, confirm disabled until a choice. */
export default function AssigneePicker({ name, candidates, onPick, onCancel }: Props) {
  const { t, f } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const group = useId();
  const choice = candidates.find((c) => c.username === selected) ?? null;
  return (
    <Dialog
      title={name !== null ? f('picker.title', { name }) : t('picker.titleGeneric')}
      onCancel={onCancel}
      actions={
        <>
          <p className={styles.pickHint}>{t('picker.pickOne')}</p>
          <button type="button" className="btn" onClick={() => onPick(null)}>
            {t('picker.leaveUnassigned')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={choice === null}
            onClick={() => onPick(choice)}
          >
            {t('picker.useSelected')}
          </button>
        </>
      }
    >
      <div
        role="radiogroup"
        aria-label={name !== null ? f('picker.title', { name }) : t('picker.titleGeneric')}
        className={styles.radioList}
      >
        {candidates.map((c) => {
          const id = `${group}-${c.username}`;
          return (
            <label
              key={c.username}
              htmlFor={id}
              className={`${styles.radioRow} ${selected === c.username ? styles.radioRowSelected : ''}`}
            >
              <input
                id={id}
                type="radio"
                name={group}
                value={c.username}
                checked={selected === c.username}
                onChange={() => setSelected(c.username)}
              />
              <span className={styles.avatar} aria-hidden="true">
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
            </label>
          );
        })}
      </div>
    </Dialog>
  );
}
