import { useEffect, useState } from 'react';
import type { ToastData } from '../../shared/types';
import { laqta } from '../shared/api';
import { useI18n } from '../shared/i18n';
import { CloseIcon, ErrorIcon, SuccessIcon } from '../shared/icons';
import styles from './Toast.module.css';

/** Board 4, cards 1 and 3: ResultToast and PartialFailureCard. */
export default function Toast() {
  const { t, f } = useI18n();
  const [data, setData] = useState<ToastData | null>(null);
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    void laqta.toastGet().then(setData);
    void laqta.sessionGet().then((s) => setRequestId(s?.id ?? null));
    // Main reuses this window after Retry upload and announces it with a session change.
    return laqta.onSessionChanged((s) => {
      if (s !== null) void laqta.toastGet().then(setData);
    });
  }, []);

  if (data === null) return null;

  const open = () => void laqta.appOpenLink({ url: data.browseUrl });
  const close = () => void laqta.toastClose();
  const copy = async () => {
    await laqta.appCopyText({ text: data.browseUrl });
    setCopied(true);
  };
  const retry = async () => {
    if (requestId === null) return;
    setRetrying(true);
    try {
      const result = await laqta.jiraRetryAttachment({ issueKey: data.issueKey, requestId });
      if (result.kind === 'ok')
        setData({
          kind: 'ok',
          issueKey: result.issueKey,
          browseUrl: result.browseUrl,
          assigneeName: null,
        });
      else if (result.kind === 'partial')
        setData({ ...data, kind: 'partial', attachmentError: result.attachmentError });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className={`${styles.card} ${data.kind === 'partial' ? styles.failure : ''}`}>
      <button
        type="button"
        className={`btn btn-ghost ${styles.close}`}
        aria-label={t('result.close')}
        onClick={close}
      >
        <CloseIcon />
      </button>
      {data.kind === 'ok' ? (
        <div role="status" aria-live="polite">
          <h1 className={styles.title}>
            <SuccessIcon />
            {f('result.created', { key: data.issueKey })}
          </h1>
          <p dir="auto">
            {data.assigneeName !== null
              ? f('result.assignedAttached', { name: data.assigneeName })
              : t('result.unassignedAttached')}
          </p>
          <div className={styles.actions}>
            <button type="button" className="btn btn-primary" onClick={open}>
              {t('result.openInJira')}
            </button>
            <button type="button" className="btn" onClick={() => void copy()}>
              {t('result.copyLink')}
            </button>
            <span className={styles.copied} aria-live="polite">
              {copied ? t('result.copied') : ''}
            </span>
          </div>
        </div>
      ) : (
        <div role="alert">
          <h1 className={styles.title}>
            <ErrorIcon />
            {t('result.partialTitle')}
          </h1>
          <p>{f('result.partialBody', { key: data.issueKey })}</p>
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void retry()}
              disabled={retrying}
            >
              {t('result.retryUpload')}
            </button>
            <button type="button" className="btn" onClick={open}>
              {t('result.openBug')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
