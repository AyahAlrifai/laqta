import type { ReactNode } from 'react';
import { ErrorIcon, WarningIcon } from './icons';
import styles from './Banner.module.css';

interface BannerProps {
  kind: 'warning' | 'error' | 'info';
  lead?: string;
  children: ReactNode;
  action?: ReactNode;
}

/** Warnings and errors always carry an icon and a text lead-in, never colour alone. */
export default function Banner({ kind, lead, children, action }: BannerProps) {
  return (
    <div
      className={`${styles.banner} ${styles[kind]}`}
      role={kind === 'error' ? 'alert' : undefined}
    >
      {kind === 'warning' && <WarningIcon />}
      {kind === 'error' && <ErrorIcon />}
      <p className={styles.text}>
        {lead !== undefined && <strong>{lead} </strong>}
        {children}
      </p>
      {action}
    </div>
  );
}
