import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '../shared/i18n';
import { AppMark, CheckSmallIcon, KeyboardIcon } from '../shared/icons';
import ShortcutsDialog from './ShortcutsDialog';
import styles from './Workbench.module.css';

interface Props {
  title: string;
  badge?: string;
  /** Something that needs attention in this step, shown after the badge (T-084). */
  status?: ReactNode;
  /** Which step of the workbench this is: 1 Describe, 2 Review. */
  step: 1 | 2;
  children: ReactNode;
  footer: ReactNode;
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable);

/**
 * No close button in the header: the window frame's own close and the footer's Cancel already
 * end the report (spec section 9), and a third control only repeated them. The keyboard
 * button opens the shortcuts list (T-089), as does ? anywhere outside a text field.
 */
export default function Shell({ title, badge, status, step, children, footer }: Props) {
  const { t } = useI18n();
  const [shortcuts, setShortcuts] = useState(false);
  const steps = [t('workbench.stepDescribe'), t('workbench.stepReview')];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target)) return;
      event.preventDefault();
      setShortcuts(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <AppMark size={32} />
        <h1 className={styles.title}>{title}</h1>
        {badge !== undefined && <span className={styles.badge}>{badge}</span>}
        {status}
        <span className={styles.spacer} />
        <ol className={styles.steps} aria-label={t('workbench.progress')}>
          {steps.map((label, i) => {
            const n = i + 1;
            const state = n < step ? 'done' : n === step ? 'current' : 'next';
            return (
              <li
                key={label}
                className={styles.step}
                data-state={state}
                aria-current={state === 'current' ? 'step' : undefined}
              >
                <span className={styles.stepNumber} aria-hidden="true">
                  {state === 'done' ? <CheckSmallIcon /> : n}
                </span>
                <span>{label}</span>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className={`btn btn-ghost ${styles.headerIcon}`}
          aria-label={t('shortcuts.open')}
          title={`${t('shortcuts.open')} (?)`}
          aria-keyshortcuts="Shift+Slash"
          onClick={() => setShortcuts(true)}
        >
          <KeyboardIcon />
        </button>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>{footer}</footer>
      {shortcuts && <ShortcutsDialog onClose={() => setShortcuts(false)} />}
    </div>
  );
}
