import { useI18n } from '../shared/i18n';
import { StateArt } from '../shared/icons';
import styles from './Review.module.css';

interface Props {
  onTryAgain: () => void;
  onKeep: () => void;
  message: string | null;
}

/** Board 5, card 3: Jira unreachable. */
export default function OfflineCard({ onTryAgain, onKeep, message }: Props) {
  const { t } = useI18n();
  return (
    <div className={styles.errorCard} role="alert">
      <div className={styles.errorHead}>
        <StateArt kind="offline" />
        <h2>{t('offline.title')}</h2>
      </div>
      <p>{t('offline.body')}</p>
      {message !== null && <p>{message}</p>}
      <div className={styles.row}>
        <button type="button" className="btn btn-primary" onClick={onTryAgain}>
          {t('offline.tryAgain')}
        </button>
        <button type="button" className="btn" onClick={onKeep}>
          {t('offline.keep')}
        </button>
      </div>
    </div>
  );
}
