import { useEffect, useState } from 'react';
import { laqta } from '../shared/api';
import { useI18n } from '../shared/i18n';
import { SparkleIcon } from '../shared/icons';
import Shell from './Shell';
import styles from './Workbench.module.css';

/**
 * While the AI writes the draft (T-083): the Review layout in outline, so people see what
 * comes next, with an elapsed timer and Cancel. It shows no progress stages: the provider does
 * not report any, and invented ones would be untrue.
 */
export default function DraftingStep() {
  const { t, f } = useI18n();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const line = (width: string, height = 14) => (
    <span className="skeleton" style={{ width, height }} aria-hidden="true" />
  );

  return (
    <Shell
      title={t('editor.drafting')}
      step={2}
      footer={
        <>
          <p className={styles.draftingNote}>{t('editor.draftingDetail')}</p>
          <button type="button" className="btn" onClick={() => void laqta.draftCancel()}>
            {t('editor.cancelDraft')}
          </button>
        </>
      }
    >
      <div className={styles.drafting}>
        <aside className={styles.draftingSide} aria-hidden="true">
          {line('40%', 10)}
          <span className={`skeleton ${styles.draftingThumb}`} />
          {line('70%')}
          {line('30%', 10)}
          <span className={styles.draftingGap} />
          {line('50%', 10)}
          {line('100%', 40)}
          {line('100%', 40)}
          {line('100%', 40)}
        </aside>
        <section className={styles.draftingMain}>
          <div className={styles.draftingStatus} role="status" aria-live="polite">
            <span className={styles.draftingSpark} aria-hidden="true">
              <SparkleIcon />
            </span>
            <span className={styles.draftingTitle}>{t('drafting.title')}</span>
            <span className={styles.draftingTime} aria-hidden="true">
              {f('drafting.elapsed', { seconds })}
            </span>
          </div>
          <div className={styles.draftingDoc} aria-hidden="true">
            {line('85%', 26)}
            {line('55%', 26)}
            <span className={styles.draftingGap} />
            {line('22%', 10)}
            {line('92%')}
            {line('78%')}
            <span className={styles.draftingGap} />
            {line('22%', 10)}
            {line('88%')}
            {line('64%')}
            <span className={styles.draftingGap} />
            {line('22%', 10)}
            {line('70%')}
          </div>
        </section>
      </div>
    </Shell>
  );
}
