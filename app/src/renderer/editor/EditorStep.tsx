import { useEffect, useState } from 'react';
import { MAX_PROMPT_CHARS } from '../../shared/schemas';
import type { StringKey } from '../../shared/strings';
import { unescapeWiki } from '../../shared/wiki';
import type { BugDraft } from '../../shared/types';
import { laqta, LaqtaIpcError } from '../shared/api';
import Banner from '../shared/Banner';
import Dialog from '../shared/Dialog';
import { useI18n } from '../shared/i18n';
import { LockSmallIcon, PlusIcon, ShieldSmallIcon } from '../shared/icons';
import Shell from '../workbench/Shell';
import { useWorkbench } from '../workbench/store';
import AnnotationCanvas from './AnnotationCanvas';
import { handleEditorKey } from './keyboard';
import MicButton from './MicButton';
import { counts, emptyHistory } from './model';
import { renderFinalPng } from './render';
import Toolbar from './Toolbar';
import styles from './Editor.module.css';

interface Props {
  base: ImageBitmap;
  onImageReplaced: (png: Uint8Array) => Promise<void>;
  onDiscard: () => void;
}

const CHIPS: { label: StringKey; text: StringKey }[] = [
  { label: 'editor.chipUi', text: 'editor.chipUiText' },
  { label: 'editor.chipBackend', text: 'editor.chipBackendText' },
  { label: 'editor.chipData', text: 'editor.chipDataText' },
];

function forDisplay(d: BugDraft): BugDraft {
  return {
    ...d,
    environment: unescapeWiki(d.environment),
    stepsToReproduce: d.stepsToReproduce.map(unescapeWiki),
    actualResult: unescapeWiki(d.actualResult),
    expectedResult: unescapeWiki(d.expectedResult),
    missingInfo: d.missingInfo.map(unescapeWiki),
  };
}

/** Board 2: Annotate and ask (workbench step 1). */
export default function EditorStep({ base, onImageReplaced, onDiscard }: Props) {
  const { t, f } = useI18n();
  const s = useWorkbench();
  const [confirmNoBlur, setConfirmNoBlur] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const drafting = s.session?.state === 'drafting';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (busy || drafting) return;
      if (handleEditorKey(event, useWorkbench.getState(), base)) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [base, busy, drafting]);

  const blurCount = counts(s.history.present).blurs;
  const session = s.session;
  const osName = session?.os.platform === 'win32' ? 'Windows' : 'macOS';
  const caption = session?.sourceApp
    ? f('editor.captured', {
        width: base.width,
        height: base.height,
        app: session.sourceApp.name,
        os: osName,
      })
    : f('editor.capturedNoApp', { width: base.width, height: base.height, os: osName });

  async function generate(skipConfirm: boolean) {
    setValidation(null);
    if (s.prompt.trim() === '') {
      setValidation(t('editor.promptRequired'));
      document.getElementById('prompt')?.focus();
      return;
    }
    if (s.projectKey === '') {
      setValidation(t('editor.projectRequired'));
      document.getElementById('project')?.focus();
      return;
    }
    // Spec section 5: with zero redactions, confirm before anything leaves the machine,
    // unless the user chose "Don't ask me again" (Settings.confirmNoBlur, default true).
    const askNoBlur = s.settingsView?.settings.confirmNoBlur !== false;
    if (!skipConfirm && blurCount === 0 && askNoBlur) {
      setDontAskAgain(false);
      setConfirmNoBlur(true);
      return;
    }
    setBusy(true);
    s.set({ draftError: null });
    try {
      const png = await renderFinalPng(base, s.history.present);
      await laqta.sessionSetRedactedImage({ png, width: base.width, height: base.height });
      // The original is gone in main; the flattened image becomes the new base.
      await onImageReplaced(png);
      s.set({ history: emptyHistory(), selectedId: null });
      const result = await laqta.draftRequest({
        prompt: s.prompt,
        projectKey: s.projectKey,
        bugLanguage: s.bugLanguage,
      });
      if (result.kind === 'ok') {
        s.resetReview();
        s.set({ aiDraft: result.draft, draft: forDisplay(result.draft) });
      } else if (result.error.code !== 'CANCELLED') {
        s.set({ draftError: result.error });
      }
    } catch (error) {
      s.set({
        draftError:
          error instanceof LaqtaIpcError
            ? error.error
            : { code: 'UNKNOWN', userMessage: t('error.UNKNOWN') },
      });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Saves confirmNoBlur = false. Read fresh settings first so a change made meanwhile in the
   * Settings window is not overwritten. A failure only means the dialog shows again next time.
   */
  async function stopAskingNoBlur() {
    try {
      const view = await laqta.settingsGet();
      const saved = await laqta.settingsSet({
        settings: { ...view.settings, confirmNoBlur: false },
      });
      s.set({ settingsView: saved });
    } catch {
      // Keep asking: safer than silently dropping the user's choice the other way.
    }
  }

  const insertChip = (text: string) => {
    const next = s.prompt.trim() === '' ? text : `${s.prompt}\n${text}`;
    s.set({ prompt: next.slice(0, MAX_PROMPT_CHARS) });
    document.getElementById('prompt')?.focus();
  };

  const voiceEnabled = s.settingsView?.settings.voiceEnabled === true;

  return (
    <Shell
      title={t('editor.title')}
      step={1}
      onClose={onDiscard}
      footer={
        <>
          <p className={styles.footerNote}>
            <ShieldSmallIcon />
            <span>{t('editor.footerWarning')}</span>
          </p>
          <button type="button" className="btn" onClick={onDiscard}>
            {t('editor.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void generate(false)}
            disabled={busy || drafting}
          >
            {t('editor.generate')}
          </button>
        </>
      }
    >
      <div className={styles.columns}>
        <section className={styles.left}>
          <Toolbar />
          <div className={styles.canvasWrap}>
            <div className={styles.stage}>
              <AnnotationCanvas base={base} />
            </div>
          </div>
          <p className={styles.caption} dir="auto">
            {caption}
          </p>
        </section>
        <section className={styles.right}>
          {s.settingsView?.aiDisabledMessage != null && (
            <Banner kind="warning" lead={t('error.lead')}>
              {f('editor.aiOff', { message: s.settingsView.aiDisabledMessage })}
            </Banner>
          )}
          <div className={styles.card}>
            <label id="prompt-label" htmlFor="prompt" className={styles.cardTitle}>
              {t('editor.whatIsWrong')}
            </label>
            <div className={styles.promptBox}>
              <textarea
                id="prompt"
                className={`textarea ${styles.prompt}`}
                dir="auto"
                maxLength={MAX_PROMPT_CHARS}
                placeholder={t('editor.promptPlaceholder')}
                value={s.prompt}
                onChange={(e) => s.set({ prompt: e.target.value })}
                aria-describedby={validation ? 'editor-validation' : 'prompt-count'}
              />
              <span id="prompt-count" className={styles.count}>
                {f('editor.charCount', { count: s.prompt.length, max: MAX_PROMPT_CHARS })}
              </span>
            </div>
            {voiceEnabled && (
              <MicButton
                language={s.voiceLanguage}
                onLanguage={(voiceLanguage) => s.set({ voiceLanguage })}
                onTranscript={(text) =>
                  s.set({
                    prompt: (s.prompt.trim() === '' ? text : `${s.prompt} ${text}`).slice(
                      0,
                      MAX_PROMPT_CHARS,
                    ),
                  })
                }
              />
            )}
            <div className={styles.quickStart}>
              <p className={styles.subLabel} id="chips-label">
                {t('editor.quickStart')}
              </p>
              <div className={styles.chips} role="group" aria-labelledby="chips-label">
                {CHIPS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    className={styles.chip}
                    onClick={() => insertChip(t(c.text))}
                  >
                    <PlusIcon />
                    {t(c.label)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <section className={styles.card} aria-labelledby="details-title">
            <h2 id="details-title" className={styles.cardTitle}>
              {t('editor.details')}
            </h2>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="project">
                {t('editor.project')}
              </label>
              <select
                id="project"
                className="select"
                value={s.projectKey}
                onChange={(e) => s.set({ projectKey: e.target.value })}
              >
                <option value="">{t('editor.projectPlaceholder')}</option>
                {s.projects.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.key} · {p.name}
                  </option>
                ))}
                {s.projectKey !== '' && !s.projects.some((p) => p.key === s.projectKey) && (
                  <option value={s.projectKey}>{s.projectKey}</option>
                )}
              </select>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel} id="bug-language-label">
                {t('editor.bugLanguage')}
              </span>
              <div
                className={`${styles.segmented} ${styles.segmentedFull}`}
                role="radiogroup"
                aria-labelledby="bug-language-label"
              >
                {(['en', 'ar'] as const).map((lang) => (
                  <span key={lang} className={styles.segment}>
                    <input
                      id={`bug-language-${lang}`}
                      type="radio"
                      name="bug-language"
                      checked={s.bugLanguage === lang}
                      onChange={() => s.set({ bugLanguage: lang })}
                    />
                    <label htmlFor={`bug-language-${lang}`} lang={lang}>
                      {lang === 'en' ? t('lang.nativeEn') : t('lang.nativeAr')}
                    </label>
                  </span>
                ))}
              </div>
            </div>
          </section>

          {validation !== null && (
            <div id="editor-validation">
              <Banner kind="error" lead={t('error.lead')}>
                {validation}
              </Banner>
            </div>
          )}
          {s.draftError !== null && (
            <Banner
              kind="error"
              lead={t('error.lead')}
              action={
                <button type="button" className="btn" onClick={() => void generate(true)}>
                  {t('editor.tryAgain')}
                </button>
              }
            >
              {s.draftError.userMessage}
            </Banner>
          )}
          <p className={styles.privacy}>
            <LockSmallIcon />
            <span>{t('editor.privacy')}</span>
          </p>
        </section>
      </div>

      {(drafting || busy) && (
        <div className={styles.drafting} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <p>{t('editor.drafting')}</p>
          {drafting && (
            <button type="button" className="btn" onClick={() => void laqta.draftCancel()}>
              {t('editor.cancelDraft')}
            </button>
          )}
        </div>
      )}

      {confirmNoBlur && (
        <Dialog
          role="alertdialog"
          title={t('confirm.noBlurTitle')}
          onCancel={() => setConfirmNoBlur(false)}
          actions={
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setConfirmNoBlur(false);
                  s.set({ tool: 'redact' });
                }}
              >
                {t('confirm.noBlurBack')}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setConfirmNoBlur(false);
                  if (dontAskAgain) void stopAskingNoBlur();
                  void generate(true);
                }}
              >
                {t('confirm.noBlurSend')}
              </button>
            </>
          }
        >
          <p>{t('confirm.noBlurBody')}</p>
          <label className={styles.dontAsk}>
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
            />
            {t('confirm.noBlurDontAsk')}
          </label>
        </Dialog>
      )}
    </Shell>
  );
}
