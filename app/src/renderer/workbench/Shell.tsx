import type { ReactNode } from 'react';
import { useI18n } from '../shared/i18n';
import { AppMark, CheckSmallIcon } from '../shared/icons';
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

/**
 * No close button in the header: the window frame's own close and the footer's Cancel already
 * end the report (spec section 9), and a third control only repeated them.
 */
export default function Shell({ title, badge, status, step, children, footer }: Props) {
  const { t } = useI18n();
  const steps = [t('workbench.stepDescribe'), t('workbench.stepReview')];
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
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>{footer}</footer>
    </div>
  );
}
