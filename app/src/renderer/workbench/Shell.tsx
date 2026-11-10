import type { ReactNode } from 'react';
import { useI18n } from '../shared/i18n';
import { AppMark, CloseIcon } from '../shared/icons';
import styles from './Workbench.module.css';

interface Props {
  title: string;
  badge?: string;
  /** Which step of the workbench this is: 1 Describe, 2 Review. */
  step: 1 | 2;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

export default function Shell({ title, badge, step, onClose, children, footer }: Props) {
  const { t } = useI18n();
  const steps = [t('workbench.stepDescribe'), t('workbench.stepReview')];
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <AppMark size={32} />
        <h1 className={styles.title}>{title}</h1>
        {badge !== undefined && <span className={styles.badge}>{badge}</span>}
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
                  {state === 'done' ? '✓' : n}
                </span>
                <span>{label}</span>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className={`btn btn-ghost ${styles.close}`}
          aria-label={t('editor.close')}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>{footer}</footer>
    </div>
  );
}
