import { useEffect, useRef, useState } from 'react';
import type { ToastData } from '../../shared/types';
import { laqta } from '../shared/api';
import { useI18n } from '../shared/i18n';
import { CloseIcon, ErrorIcon, SuccessIcon } from '../shared/icons';
import styles from './Toast.module.css';

/** The result closes itself after this long, unless the pointer or focus is on it. */
export const AUTO_CLOSE_MS = 8000;

/** Board 4, cards 1 and 3: ResultToast and PartialFailureCard. */
export default function Toast() {
  const { t, f } = useI18n();
  const [data, setData] = useState<ToastData | null>(null);
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  // Hover or keyboard focus holds the toast open (WCAG 2.2.1); leaving restarts the full time.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void laqta.toastGet().then(setData);
    void laqta.sessionGet().then((s) => setRequestId(s?.id ?? null));
    // Main reuses this window after Retry upload and announces it with a session change.
    return laqta.onSessionChanged((s) => {
      if (s !== null) void laqta.toastGet().then(setData);
    });
  }, []);

  // Main fits the window to the card, whatever the text length, language or state.
  const hasData = data !== null;
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const report = () =>
      void laqta.toastResize({ height: Math.ceil(el.getBoundingClientRect().height) });
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasData]);

  // New content (first show, or the result of Retry upload) also restarts the time.
  useEffect(() => {
    if (data === null || hovered || focused || retrying) return;
    const timer = setTimeout(() => void laqta.toastClose(), AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [data, hovered, focused, retrying]);

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
    <div
      ref={card}
      className={`${styles.card} ${data.kind === 'partial' ? styles.failure : ''}`}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
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
