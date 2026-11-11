import { useEffect, useState } from 'react';
import { MAX_PROMPT_CHARS } from '../../shared/schemas';
import type { StringKey } from '../../shared/strings';
import { unescapeWiki } from '../../shared/wiki';
import type { BugDraft } from '../../shared/types';
import { laqta, LaqtaIpcError } from '../shared/api';
import Banner from '../shared/Banner';
import BusyOverlay from '../shared/BusyOverlay';
import Dialog from '../shared/Dialog';
import { useI18n } from '../shared/i18n';
import { CheckSmallIcon, LockSmallIcon, PlusIcon, ShieldSmallIcon } from '../shared/icons';
import Select from '../shared/Select';
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

/**
 * What a senior tester would add next to a screenshot, ordered by how much each one helps the
 * AI write a reproducible bug: steps and expected result first (the draft's weakest fields
 * without them), then the facts a developer asks for before starting (error text, how often,
 * where, which build, which data, whether it is a regression). Each inserts a labelled line,
 * which the model reads far more reliably than free prose.
 */
const DETAILS: { label: StringKey; text: StringKey; question: StringKey }[] = [
  { label: 'editor.qSteps', text: 'editor.qStepsText', question: 'editor.qStepsAsk' },
  { label: 'editor.qExpected', text: 'editor.qExpectedText', question: 'editor.qExpectedAsk' },
  { label: 'editor.qError', text: 'editor.qErrorText', question: 'editor.qErrorAsk' },
  { label: 'editor.qFrequency', text: 'editor.qFrequencyText', question: 'editor.qFrequencyAsk' },
  { label: 'editor.qWhere', text: 'editor.qWhereText', question: 'editor.qWhereAsk' },
  { label: 'editor.qEnv', text: 'editor.qEnvText', question: 'editor.qEnvAsk' },
  { label: 'editor.qData', text: 'editor.qDataText', question: 'editor.qDataAsk' },
  {
    label: 'editor.qRegression',
    text: 'editor.qRegressionText',
    question: 'editor.qRegressionAsk',
  },
];

/** The line's label, up to its colon: how a detail already in the prompt is recognised. */
const detailKey = (text: string) => text.slice(0, text.indexOf(':') + 1).trim();

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

  /** Adds the detail's line, or jumps to it when it is already there. */
  const insertDetail = (text: string) => {
    const el = document.getElementById('prompt');
    const key = detailKey(text);
    const at = key === '' ? -1 : s.prompt.indexOf(key);
    let caret: number;
    if (at >= 0) {
      const end = s.prompt.indexOf('\n', at);
      caret = end < 0 ? s.prompt.length : end;
    } else {
      const sep = s.prompt.trim() === '' ? '' : s.prompt.endsWith('\n') ? '' : '\n';
      const next = `${s.prompt.trim() === '' ? '' : s.prompt}${sep}${text}`.slice(
        0,
        MAX_PROMPT_CHARS,
      );
      caret = next.length;
      s.set({ prompt: next });
    }
    // After React has written the new value, put the caret where the user types next.
    requestAnimationFrame(() => {
      if (el instanceof HTMLTextAreaElement) {
        el.focus();
        el.setSelectionRange(caret, caret);
      }
    });
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
                {t('editor.helpAi')}
              </p>
              <p className={styles.chipsHint}>{t('editor.helpAiHint')}</p>
              <div className={styles.chips} role="group" aria-labelledby="chips-label">
                {DETAILS.map((d) => {
                  const added = s.prompt.includes(detailKey(t(d.text)));
                  return (
                    <button
                      key={d.label}
                      type="button"
                      className={`${styles.chip} ${added ? styles.chipAdded : ''}`}
                      title={t(d.question)}
                      onClick={() => insertDetail(t(d.text))}
                    >
                      {added ? <CheckSmallIcon /> : <PlusIcon />}
                      {t(d.label)}
                      {added && <span className="visually-hidden">{t('editor.detailAdded')}</span>}
                    </button>
                  );
                })}
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
              <Select
                id="project"
                label={t('editor.project')}
                value={s.projectKey}
                placeholder={t('editor.projectPlaceholder')}
                onChange={(projectKey) => s.set({ projectKey })}
                options={[
                  ...s.projects.map((p) => ({ value: p.key, label: `${p.key} · ${p.name}` })),
                  ...(s.projectKey !== '' && !s.projects.some((p) => p.key === s.projectKey)
                    ? [{ value: s.projectKey, label: s.projectKey }]
                    : []),
                ]}
              />
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
        <BusyOverlay
          title={t('editor.drafting')}
          detail={t('editor.draftingDetail')}
          steps={[
            { label: t('editor.stepPrepare'), state: drafting ? 'done' : 'current' },
            { label: t('editor.stepRead'), state: drafting ? 'current' : 'next' },
            { label: t('editor.stepReview'), state: 'next' },
          ]}
          action={
            drafting ? (
              <button type="button" className="btn" onClick={() => void laqta.draftCancel()}>
                {t('editor.cancelDraft')}
              </button>
            ) : undefined
          }
        />
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
