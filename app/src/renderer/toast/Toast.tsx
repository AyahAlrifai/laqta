import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ToastData } from '../../shared/types';
import { acceleratorKeycaps } from '../settings/accelerator';
import { laqta } from '../shared/api';
import { useI18n } from '../shared/i18n';
import { CloseIcon, CopyIcon, ExternalIcon, RetryIcon } from '../shared/icons';
import { playCueIfEnabled } from '../shared/sounds-setting';
import styles from './Toast.module.css';

/** The result closes itself after this long, unless the pointer or focus is on it. */
export const AUTO_CLOSE_MS = 8000;

/** Drawn once when the toast appears (T-085); reduced motion shows it already drawn. */
function ResultMark({ kind }: { kind: 'ok' | 'partial' }) {
  return (
    <span className={`${styles.mark} ${kind === 'ok' ? styles.markOk : styles.markWarn}`}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none">
        {kind === 'ok' ? (
          <path
            className={styles.markPath}
            d="m5 12.5 4.5 4.5L19 7"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M12 6v8M12 18v.5"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        )}
      </svg>
    </span>
  );
}

/** Board 4, cards 1 and 3: ResultToast and PartialFailureCard, one layout for both (T-085). */
export default function Toast() {
  const { t, f } = useI18n();
  const [data, setData] = useState<ToastData | null>(null);
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [hotkey, setHotkey] = useState<string[] | null>(null);
  // Hover or keyboard focus holds the toast open (WCAG 2.2.1); leaving restarts the full time.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(0);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void laqta.toastGet().then(setData);
    void laqta.sessionGet().then((s) => setRequestId(s?.id ?? null));
    // The capture shortcut, so the next bug is one key press away (T-085).
    void laqta
      .settingsGet()
      .then((view) =>
        setHotkey(
          acceleratorKeycaps(view.settings.hotkeyArea, navigator.userAgent.includes('Mac')),
        ),
      )
      .catch(() => undefined);
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

  // End of step 2 (spec section 9, sounds): each new result, including one from Retry upload,
  // gets its cue. A partial result needs the user, so it sounds different from success.
  useEffect(() => {
    if (data === null) return;
    playCueIfEnabled(data.kind === 'partial' ? 'needsAction' : 'bugCreated');
  }, [data]);

  // New content (first show, or the result of Retry upload) also restarts the time.
  const paused = hovered || focused || retrying;
  useEffect(() => {
    if (data === null || paused) return;
    setShown((n) => n + 1);
    const timer = setTimeout(() => void laqta.toastClose(), AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [data, paused]);

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

  const ok = data.kind === 'ok';

  return (
    <div
      ref={card}
      className={`${styles.card} ${ok ? '' : styles.partial}`}
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
      <div
        className={styles.body}
        role={ok ? 'status' : 'alert'}
        aria-live={ok ? 'polite' : undefined}
      >
        <ResultMark kind={data.kind} />
        <div className={styles.content}>
          <h1 className={styles.title}>
            {ok ? f('result.created', { key: data.issueKey }) : t('result.partialTitle')}
          </h1>
          <p className={styles.text} dir="auto">
            {ok
              ? data.assigneeName !== null
                ? f('result.assignedAttached', { name: data.assigneeName })
                : t('result.unassignedAttached')
              : f('result.partialBody', { key: data.issueKey })}
          </p>
          <div className={styles.actions}>
            {ok ? (
              <>
                <button type="button" className="btn btn-primary" onClick={open}>
                  <ExternalIcon />
                  {t('result.openInJira')}
                </button>
                <button type="button" className="btn" onClick={() => void copy()}>
                  <CopyIcon />
                  {t('result.copyLink')}
                </button>
                <span className={styles.copied} aria-live="polite">
                  {copied ? t('result.copied') : ''}
                </span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void retry()}
                  disabled={retrying}
                >
                  <RetryIcon />
                  {t('result.retryUpload')}
                </button>
                <button type="button" className="btn" onClick={open}>
                  {t('result.openBug')}
                </button>
              </>
            )}
          </div>
          {ok && hotkey !== null && (
            <p className={styles.next}>
              <span>{t('result.nextBug')}</span>
              <span className={styles.keys} aria-hidden="true">
                {hotkey.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </span>
              <span className="visually-hidden">{hotkey.join(' ')}</span>
            </p>
          )}
        </div>
      </div>
      {/* Time left before the toast closes itself; it stops while hovered or focused. */}
      <span
        key={shown}
        className={`${styles.timer} ${paused ? styles.timerPaused : ''}`}
        style={{ '--toast-ms': `${String(AUTO_CLOSE_MS)}ms` } as CSSProperties}
        aria-hidden="true"
      />
    </div>
  );
}
