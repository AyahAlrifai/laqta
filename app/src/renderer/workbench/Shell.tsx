import type { ReactNode } from 'react';
import { useI18n } from '../shared/i18n';
import { AppMark, CloseIcon } from '../shared/icons';
import styles from './Workbench.module.css';

interface Props {
  title: string;
  badge?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

export default function Shell({ title, badge, onClose, children, footer }: Props) {
  const { t } = useI18n();
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <AppMark />
        <h1 className={styles.title}>{title}</h1>
        {badge !== undefined && <span className={styles.badge}>{badge}</span>}
        <span className={styles.spacer} />
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
