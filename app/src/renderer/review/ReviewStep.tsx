import { useEffect, useRef, useState } from 'react';
import type { AppError, BugDraft, Priority, ReviewState } from '../../shared/types';
import { fieldInputKind } from '../../shared/fields';
import type { StringKey } from '../../shared/strings';
import { laqta, LaqtaIpcError } from '../shared/api';
import Banner from '../shared/Banner';
import Dialog from '../shared/Dialog';
import { useI18n } from '../shared/i18n';
import BusyOverlay from '../shared/BusyOverlay';
import {
  BackArrowIcon,
  PencilIcon,
  PriorityIcon,
  SparkleIcon,
  WarningIcon,
  ZoomImageIcon,
} from '../shared/icons';
import Select from '../shared/Select';
import Shell from '../workbench/Shell';
import { useWorkbench } from '../workbench/store';
import AssigneeField, { type AssigneeSuggestion } from './AssigneeField';
import LabelsField from './LabelsField';
import { buildApproved, missingRequired } from './approved';
import OfflineCard from './OfflineCard';
import styles from './Review.module.css';

interface Props {
  imageUrl: string | null;
  onDiscard: () => void;
}

const asError = (e: unknown, fallback: string): AppError =>
  e instanceof LaqtaIpcError ? e.error : { code: 'UNKNOWN', userMessage: fallback };

/** Grows a text area with its content, so the draft reads like a document, not a form. */
function autoGrow(el: HTMLTextAreaElement | null): void {
  if (el === null) return;
  el.style.height = 'auto';
  el.style.height = `${String(el.scrollHeight + 2)}px`;
}

/**
 * Board 3: Review the draft (workbench step 2, T-084). The draft reads like the bug it becomes:
 * a title, then the description sections, each one still a labelled, editable control. The
 * Jira fields sit in a side panel with the attachment. Every field is editable.
 */
export default function ReviewStep({ imageUrl, onDiscard }: Props) {
  const { t, f } = useI18n();
  const s = useWorkbench();
  const draft = s.draft;
  const session = s.session;
  const [suggestion, setSuggestion] = useState<AssigneeSuggestion | null>(null);
  const [keptMessage, setKeptMessage] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [viewImage, setViewImage] = useState(false);
  const loaded = useRef(false);
  const state = session?.state;
  const inFlight = state === 'submitting' || state === 'verifying';

  // Load project fields, duplicates and the assignee once per draft.
  useEffect(() => {
    if (draft === null || loaded.current) return;
    loaded.current = true;
    const projectKey = s.projectKey;
    void laqta
      .jiraLoadCreateMeta({ projectKey, issueTypeName: draft.issueType })
      .then((meta) => s.set({ createMeta: meta, metaError: null }))
      .catch((e: unknown) => s.set({ metaError: asError(e, t('error.UNKNOWN')) }));
    if (draft.summary.trim() !== '') {
      void laqta
        .jiraCheckDuplicates({ projectKey, summary: draft.summary })
        .then((duplicates) => s.set({ duplicates }))
        .catch(() => s.set({ duplicates: [] }));
    }
    if (draft.assigneeQuery !== null && !s.assigneeConfirmed) {
      const query = draft.assigneeQuery;
      void laqta
        .jiraResolveAssignee({ projectKey, query, transliteration: draft.assigneeTransliteration })
        .then((resolution) => {
          s.set({ resolution });
          const pre = resolution.candidates.find((c) => c.username === resolution.preselected);
          if (pre) {
            s.set({ assignee: pre, assigneeConfirmed: true });
          } else if (resolution.candidates.length > 0) {
            // Ambiguous: the user must pick (spec section 1, hard requirement).
            setSuggestion({ kind: 'ambiguous', name: query, candidates: resolution.candidates });
          } else {
            setSuggestion({ kind: 'none', name: draft.assigneeTransliteration ?? query });
          }
        })
        .catch(() => setSuggestion({ kind: 'none', name: query }));
    } else if (draft.assigneeQuery === null) {
      s.set({ assigneeConfirmed: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per draft
  }, [draft]);

  if (draft === null || session === null) return null;

  const update = (patch: Partial<BugDraft>) => s.set({ draft: { ...draft, ...patch } });
  const missing = missingRequired(s.createMeta, s.extraValues);
  const canCreate =
    !inFlight &&
    draft.summary.trim() !== '' &&
    missing.length === 0 &&
    s.assigneeConfirmed &&
    s.createMeta !== null;
  // Why Create is disabled, said next to the button (T-084). In flight needs no reason.
  const blockedBy: StringKey | null = inFlight
    ? null
    : draft.summary.trim() === ''
      ? 'review.reasonSummary'
      : !s.assigneeConfirmed
        ? 'review.reasonAssignee'
        : missing.length > 0
          ? 'review.reasonRequired'
          : s.createMeta === null
            ? 'review.loadingMeta'
            : null;
  const fieldErrors =
    s.createError?.code === 'FIELD_ERROR' ? (s.createError.fieldErrors ?? {}) : {};
  const offline =
    s.createError?.code === 'NETWORK_UNREACHABLE' || s.createError?.code === 'TLS_ERROR';

  async function create() {
    if (!canCreate || session === null || draft === null) return;
    s.set({ createError: null });
    try {
      const bug = buildApproved({
        session,
        projectKey: s.projectKey,
        draft,
        assignee: s.assignee,
        meta: s.createMeta,
        values: s.extraValues,
      });
      const result = await laqta.jiraCreateBug(bug);
      if (result.kind === 'failed') s.set({ createError: result.error });
      // ok and partial: main closes this window and shows the result toast.
    } catch (e) {
      s.set({ createError: asError(e, t('error.UNKNOWN')) });
    }
  }

  async function keepForLater() {
    if (draft === null) return;
    const review: ReviewState = {
      projectKey: s.projectKey,
      bugLanguage: s.bugLanguage,
      prompt: s.prompt,
      draft,
      assignee: s.assignee,
      extraFields: s.extraValues,
    };
    try {
      const { saved } = await laqta.draftKeepForLater(review);
      setKeptMessage(saved ? t('offline.kept') : t('offline.cannotKeep'));
    } catch {
      setKeptMessage(t('offline.cannotKeep'));
    }
  }

  async function changeIssueType(name: string) {
    update({ issueType: name });
    try {
      const meta = await laqta.jiraLoadCreateMeta({
        projectKey: s.projectKey,
        issueTypeName: name,
      });
      s.set({ createMeta: meta, extraValues: {} });
    } catch (e) {
      s.set({ metaError: asError(e, t('error.UNKNOWN')) });
    }
  }

  const stepsText = draft.stepsToReproduce.join('\n');
  const aiPriority = s.aiDraft?.priority ?? null;
  const dup = s.duplicates[0];
  const questions = draft.missingInfo.length;
  const fileName = `laqta-${session.id}.png`;

  return (
    <Shell
      title={t('review.title')}
      badge={t('review.draftedByAi')}
      status={
        questions > 0 ? (
          <a className={styles.toCheck} href="#missing" title={t('review.toCheckJump')}>
            <WarningIcon />
            {f('review.toCheck', { count: questions })}
          </a>
        ) : undefined
      }
      step={2}
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void laqta.sessionBack()}
            disabled={inFlight}
          >
            <BackArrowIcon />
            {t('review.back')}
          </button>
          <p
            id="create-reason"
            className={`${styles.writeNotice} ${blockedBy !== null ? styles.blocked : ''}`}
            aria-live="polite"
          >
            {blockedBy !== null ? t(blockedBy) : t('review.writeNotice')}
          </p>
          <button type="button" className="btn" onClick={onDiscard} disabled={inFlight}>
            {t('review.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void create()}
            disabled={!canCreate}
            aria-describedby="write-notice create-reason"
          >
            {state === 'submitting'
              ? t('review.creating')
              : state === 'verifying'
                ? t('review.verifying')
                : f('review.create', { project: s.projectKey })}
          </button>
        </>
      }
    >
      <div className={styles.columns}>
        <aside className={styles.left}>
          <section className={styles.panel} aria-labelledby="attachment-title">
            <h2 id="attachment-title" className={styles.panelLabel}>
              {t('review.attachment')}
            </h2>
            <button
              type="button"
              className={styles.thumb}
              onClick={() => setViewImage(true)}
              disabled={imageUrl === null}
              aria-label={t('review.viewImage')}
              title={t('review.viewImage')}
            >
              {imageUrl !== null && (
                <img
                  src={imageUrl}
                  alt=""
                  onLoad={(e) =>
                    setImageSize({
                      width: e.currentTarget.naturalWidth,
                      height: e.currentTarget.naturalHeight,
                    })
                  }
                />
              )}
              <span className={styles.thumbZoom} aria-hidden="true">
                <ZoomImageIcon />
              </span>
            </button>
            <div className={styles.fileRow}>
              <div className={styles.flex}>
                <p className={styles.fileName} title={fileName}>
                  {fileName}
                </p>
                {imageSize !== null && (
                  <p className={styles.fileMeta}>{f('review.attachmentMeta', imageSize)}</p>
                )}
              </div>
              <button
                type="button"
                className={`btn ${styles.smallBtn}`}
                onClick={() => void laqta.sessionBack()}
                disabled={inFlight}
              >
                <PencilIcon />
                {t('review.editImage')}
              </button>
            </div>
            <p className={styles.muted}>{t('review.attachmentNote')}</p>
          </section>

          <section className={styles.panel} aria-labelledby="fields-title">
            <h2 id="fields-title" className={styles.panelLabel}>
              {t('review.fields')}
            </h2>
            <div className={styles.props}>
              <div className={styles.prop}>
                <span className="label">{t('review.project')}</span>
                <span className={styles.propValue}>{s.projectKey}</span>
              </div>
              <div className={styles.prop}>
                <label className="label" htmlFor="issue-type">
                  {t('review.type')}
                </label>
                <Select
                  id="issue-type"
                  label={t('review.type')}
                  value={draft.issueType}
                  onChange={(v) => void changeIssueType(v)}
                  options={(
                    s.createMeta?.issueTypes ?? [{ id: draft.issueType, name: draft.issueType }]
                  ).map((it) => ({ value: it.name, label: it.name }))}
                />
              </div>
              <div className={styles.prop}>
                <label className={`label ${styles.priorityLabel}`} htmlFor="priority">
                  <PriorityIcon priority={draft.priority} />
                  {t('review.priority')}
                  {aiPriority !== null && draft.priority === aiPriority && (
                    <span className={styles.aiTag}>{t('review.aiSuggested')}</span>
                  )}
                </label>
                <Select
                  id="priority"
                  label={t('review.priority')}
                  value={draft.priority ?? ''}
                  onChange={(v) => update({ priority: v === '' ? null : (v as Priority) })}
                  options={[
                    { value: '', label: t('review.priorityNone') },
                    ...(s.createMeta?.priorities ?? []).map((p) => ({ value: p, label: p })),
                  ]}
                />
              </div>
              <div className={styles.prop}>
                <AssigneeField
                  value={s.assignee}
                  matchedFrom={
                    s.assignee !== null && s.resolution?.preselected === s.assignee.username
                      ? s.resolution.matchedFrom
                      : null
                  }
                  suggestion={suggestion}
                  disabled={inFlight}
                  search={(query) => laqta.jiraSearchAssignees({ projectKey: s.projectKey, query })}
                  onChange={(assignee) => s.set({ assignee, assigneeConfirmed: true })}
                />
              </div>
              <div className={styles.prop}>
                <label className="label" htmlFor="labels">
                  {t('review.labels')}
                </label>
                <LabelsField
                  id="labels"
                  labels={draft.labels}
                  disabled={inFlight}
                  onChange={(labels) => update({ labels })}
                />
              </div>
            </div>

            {s.createMeta !== null && s.createMeta.requiredFields.length > 0 && (
              <div className={styles.props}>
                {s.createMeta.requiredFields.map((field) => {
                  const id = `rf-${field.id}`;
                  const kind = fieldInputKind(field);
                  const value = s.extraValues[field.id] ?? '';
                  const setValue = (v: string) =>
                    s.set({ extraValues: { ...s.extraValues, [field.id]: v } });
                  return (
                    <div key={field.id} className={styles.prop}>
                      <label className="label" htmlFor={id}>
                        {f('review.requiredField', { name: field.name })}
                      </label>
                      {kind === 'select' && field.allowedValues ? (
                        <Select
                          id={id}
                          label={field.name}
                          value={value}
                          placeholder={t('review.chooseValue')}
                          onChange={setValue}
                          aria-invalid={missing.includes(field.id)}
                          aria-required
                          options={field.allowedValues.map((v) => ({
                            value: v.id,
                            label: v.label,
                          }))}
                        />
                      ) : kind === 'date' || kind === 'datetime' || kind === 'number' ? (
                        // Native pickers: keyboard, screen reader and locale support for free,
                        // and they only ever produce the ISO format Jira expects.
                        <input
                          id={id}
                          className="input"
                          type={kind === 'datetime' ? 'datetime-local' : kind}
                          dir="ltr"
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          aria-invalid={missing.includes(field.id)}
                          required
                        />
                      ) : (
                        <input
                          id={id}
                          className="input"
                          dir="auto"
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          aria-invalid={missing.includes(field.id)}
                          required
                        />
                      )}
                      {fieldErrors[field.id] !== undefined && (
                        <p className="field-error">{fieldErrors[field.id]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {s.createMeta === null && s.metaError === null && (
              <p className={styles.muted}>{t('review.loadingMeta')}</p>
            )}
          </section>

          <details className={styles.request}>
            <summary>{t('review.yourRequest')}</summary>
            <blockquote dir="auto">{s.prompt}</blockquote>
          </details>
        </aside>

        <section className={styles.right} aria-busy={inFlight}>
          {dup !== undefined && (
            <div className={styles.duplicate} role="note">
              <WarningIcon />
              <p className={styles.duplicateText} dir="auto">
                <strong>{t('review.duplicateShort')}</strong>{' '}
                <span className={styles.issueKey}>{dup.key}</span>{' '}
                <span>
                  {f('review.duplicate', {
                    key: dup.key,
                    summary: dup.summary,
                    status: dup.status,
                  })}
                </span>
              </p>
              <button
                type="button"
                className={`btn btn-warning ${styles.smallBtn}`}
                onClick={() => void laqta.appOpenLink({ url: dup.browseUrl })}
              >
                {t('review.openIt')}
              </button>
            </div>
          )}
          {s.createError !== null && !offline && (
            <Banner
              kind="error"
              lead={t('error.lead')}
              action={
                s.createError.code === 'AUTH_INVALID' ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void laqta.appOpenSettings()}
                  >
                    {t('tray.settings')}
                  </button>
                ) : undefined
              }
            >
              {s.createError.userMessage}
            </Banner>
          )}
          {offline && (
            <OfflineCard
              onTryAgain={() => void create()}
              onKeep={() => void keepForLater()}
              message={keptMessage}
            />
          )}
          {s.metaError !== null && (
            <Banner kind="error" lead={t('error.lead')}>
              {s.metaError.userMessage}
            </Banner>
          )}

          <article className={styles.doc}>
            <p className={styles.aiNote}>
              <SparkleIcon />
              <span>{t('review.aiBanner')}</span>
            </p>

            <label className="visually-hidden" htmlFor="summary">
              {t('review.summary')}
            </label>
            <textarea
              id="summary"
              ref={autoGrow}
              className={styles.summary}
              dir="auto"
              rows={1}
              maxLength={120}
              placeholder={t('review.summaryPlaceholder')}
              value={draft.summary}
              onChange={(e) => {
                // A summary is one line in Jira.
                update({ summary: e.target.value.replace(/\n/g, ' ') });
                autoGrow(e.target);
              }}
              aria-invalid={fieldErrors.summary !== undefined || draft.summary.trim() === ''}
            />
            {fieldErrors.summary !== undefined && (
              <p className="field-error">{fieldErrors.summary}</p>
            )}

            {questions > 0 && (
              <div id="missing" className={styles.missing} tabIndex={-1}>
                <p className={styles.missingLead}>
                  <WarningIcon />
                  <span>
                    <strong>{t('review.needsInput')}: </strong>
                    {t('review.missingInfo')}
                  </span>
                </p>
                <ul>
                  {draft.missingInfo.map((q) => (
                    <li key={q} dir="auto">
                      {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <fieldset className={styles.description}>
              <legend className="visually-hidden">{t('review.description')}</legend>
              <div className={styles.section}>
                <label className={styles.sectionLabel} htmlFor="environment">
                  {t('review.environment')}
                </label>
                <input
                  id="environment"
                  className={styles.docField}
                  dir="auto"
                  maxLength={2000}
                  value={draft.environment}
                  onChange={(e) => update({ environment: e.target.value })}
                />
              </div>
              <div
                className={`${styles.section} ${
                  draft.stepsToReproduce.length === 0 ? styles.sectionNeeds : ''
                }`}
              >
                <label className={styles.sectionLabel} htmlFor="steps">
                  {t('review.steps')}
                  {draft.stepsToReproduce.length === 0 && (
                    <span className={styles.needsInput}>{t('review.needsInput')}</span>
                  )}
                </label>
                <textarea
                  id="steps"
                  ref={autoGrow}
                  className={styles.docField}
                  dir="auto"
                  rows={3}
                  placeholder={t('review.stepsPlaceholder')}
                  value={stepsText}
                  aria-describedby="steps-help"
                  onChange={(e) => {
                    update({
                      stepsToReproduce: e.target.value
                        .split('\n')
                        .map((x) => x.slice(0, 300))
                        .slice(0, 30),
                    });
                    autoGrow(e.target);
                  }}
                  onBlur={() =>
                    update({
                      stepsToReproduce: draft.stepsToReproduce.filter((x) => x.trim() !== ''),
                    })
                  }
                />
                <p id="steps-help" className={styles.sectionHelp}>
                  {t('review.stepsHelp')}
                </p>
              </div>
              <div className={styles.section}>
                <label className={styles.sectionLabel} htmlFor="actual">
                  {t('review.actual')}
                </label>
                <textarea
                  id="actual"
                  ref={autoGrow}
                  className={styles.docField}
                  dir="auto"
                  rows={2}
                  maxLength={2000}
                  value={draft.actualResult}
                  onChange={(e) => {
                    update({ actualResult: e.target.value });
                    autoGrow(e.target);
                  }}
                />
              </div>
              <div className={styles.section}>
                <label className={styles.sectionLabel} htmlFor="expected">
                  {t('review.expected')}
                </label>
                <textarea
                  id="expected"
                  ref={autoGrow}
                  className={styles.docField}
                  dir="auto"
                  rows={2}
                  maxLength={2000}
                  value={draft.expectedResult}
                  onChange={(e) => {
                    update({ expectedResult: e.target.value });
                    autoGrow(e.target);
                  }}
                />
              </div>
              <p className={styles.attachedNote}>{t('review.screenshotAttached')}</p>
            </fieldset>
          </article>
          <p id="write-notice" className="visually-hidden">
            {t('review.writeNotice')}
          </p>
        </section>
      </div>
      {viewImage && imageUrl !== null && (
        <Dialog
          title={t('review.imageTitle')}
          size="wide"
          onCancel={() => setViewImage(false)}
          actions={
            <button type="button" className="btn" onClick={() => setViewImage(false)}>
              {t('result.close')}
            </button>
          }
        >
          <img className={styles.fullImage} src={imageUrl} alt={t('review.screenshotAttached')} />
        </Dialog>
      )}
      {inFlight && (
        <BusyOverlay
          title={
            state === 'verifying'
              ? t('review.verifying')
              : f('review.creatingTitle', { project: s.projectKey })
          }
          detail={state === 'verifying' ? t('review.verifyingDetail') : t('review.creatingDetail')}
        />
      )}
    </Shell>
  );
}
