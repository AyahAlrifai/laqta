import type { ReactNode } from 'react';
import styles from './BusyOverlay.module.css';

export interface BusyStep {
  label: string;
  state: 'done' | 'current' | 'next';
}

interface Props {
  title: string;
  detail?: string;
  steps?: readonly BusyStep[];
  action?: ReactNode;
}

/**
 * A window-wide "working" card for the long waits (drafting, creating the bug): it covers the
 * form so nothing is clicked twice, names what is happening, and shows which step it is on.
 */
export default function BusyOverlay({ title, detail, steps, action }: Props) {
  return (
    <div className={styles.backdrop}>
      <div className={styles.card} role="status" aria-live="polite">
        <span className={styles.spinner} aria-hidden="true">
          <span className={styles.ring} />
        </span>
        <p className={styles.title}>{title}</p>
        {detail !== undefined && <p className={styles.detail}>{detail}</p>}
        <span className={styles.bar} aria-hidden="true">
          <span className={styles.barFill} />
        </span>
        {steps !== undefined && steps.length > 0 && (
          <ol className={styles.steps}>
            {steps.map((step) => (
              <li key={step.label} className={styles.step} data-state={step.state}>
                <span className={styles.stepMark} aria-hidden="true">
                  {step.state === 'done' ? '✓' : ''}
                </span>
                <span>{step.label}</span>
              </li>
            ))}
          </ol>
        )}
        {action}
      </div>
    </div>
  );
}
