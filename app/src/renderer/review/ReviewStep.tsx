import { useEffect, useRef, useState } from 'react';
import type {
  AppError,
  AssigneeCandidate,
  BugDraft,
  Priority,
  ReviewState,
} from '../../shared/types';
import { laqta, LaqtaIpcError } from '../shared/api';
import Banner from '../shared/Banner';
import { useI18n } from '../shared/i18n';
import { BackArrowIcon, PencilIcon, SparkleIcon } from '../shared/icons';
import Shell from '../workbench/Shell';
import { useWorkbench } from '../workbench/store';
import AssigneePicker, { initials } from './AssigneePicker';
import { buildApproved, missingRequired } from './approved';
import OfflineCard from './OfflineCard';
import styles from './Review.module.css';

interface Props {
  imageUrl: string | null;
  onDiscard: () => void;
}

const asError = (e: unknown, fallback: string): AppError =>
  e instanceof LaqtaIpcError ? e.error : { code: 'UNKNOWN', userMessage: fallback };

/** Board 3: Review the draft (workbench step 2). Every field is editable. */
export default function ReviewStep({ imageUrl, onDiscard }: Props) {
  const { t, f } = useI18n();
  const s = useWorkbench();
  const draft = s.draft;
  const session = s.session;
  const [picker, setPicker] = useState<{
    name: string | null;
    candidates: AssigneeCandidate[];
  } | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchEmpty, setSearchEmpty] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [keptMessage, setKeptMessage] = useState<string | null>(null);
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
            setPicker({ name: query, candidates: resolution.candidates });
          } else {
            setShowSearch(true);
            setSearchText(draft.assigneeTransliteration ?? query);
          }
        })
        .catch(() => setShowSearch(true));
    } else if (draft.assigneeQuery === null) {
      s.set({ assigneeConfirmed: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per draft
  }, [draft]);

  if (draft === null || session === null) return null;

  const update = (patch: Partial<BugDraft>) => s.set({ draft: { ...draft, ...patch } });
  const missing = missingRequired(s.createMeta, s.extraValues);
  const pickerOpen = picker !== null;
  const canCreate =
    !inFlight &&
    draft.summary.trim() !== '' &&
    missing.length === 0 &&
    s.assigneeConfirmed &&
    !pickerOpen &&
    s.createMeta !== null;
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

  async function search() {
    if (searchText.trim() === '') return;
    setSearching(true);
    setSearchEmpty(null);
    try {
      const candidates = await laqta.jiraSearchAssignees({
        projectKey: s.projectKey,
        query: searchText.trim(),
      });
      if (candidates.length === 0) setSearchEmpty(searchText.trim());
      else setPicker({ name: null, candidates });
    } catch {
      setSearchEmpty(searchText.trim());
    } finally {
      setSearching(false);
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

  return (
    <Shell
      title={t('review.title')}
      badge={t('review.draftedByAi')}
      step={2}
      onClose={onDiscard}
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
          <p className={styles.writeNotice}>{t('review.writeNotice')}</p>
          <button type="button" className="btn" onClick={onDiscard} disabled={inFlight}>
            {t('review.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void create()}
            disabled={!canCreate}
            aria-describedby="write-notice"
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
          <section className={styles.card} aria-labelledby="attachment-title">
            <h2 id="attachment-title" className={styles.cardLabel}>
              {t('review.attachment')}
            </h2>
            <div className={styles.thumb}>
              {imageUrl !== null && <img src={imageUrl} alt={t('review.screenshotAttached')} />}
            </div>
            <div>
              <p className={styles.fileName}>{`laqta-${session.id}.png`}</p>
              <p className={styles.muted}>{t('review.attachmentNote')}</p>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => void laqta.sessionBack()}
              disabled={inFlight}
            >
              <PencilIcon />
              {t('review.editImage')}
            </button>
          </section>
          <section className={styles.card} aria-labelledby="request-title">
            <h2 id="request-title" className={styles.cardLabel}>
              {t('review.yourRequest')}
            </h2>
            <blockquote className={styles.request} dir="auto">
              {s.prompt}
            </blockquote>
          </section>
        </aside>

        <section className={styles.right} aria-busy={inFlight}>
          <p className={styles.aiNote}>
            <SparkleIcon />
            <span>{t('review.aiBanner')}</span>
          </p>
          {dup !== undefined && (
            <Banner
              kind="warning"
              lead={t('review.duplicateLead')}
              action={
                <button
                  type="button"
                  className="btn btn-warning"
                  onClick={() => void laqta.appOpenLink({ url: dup.browseUrl })}
                >
                  {t('review.openIt')}
                </button>
              }
            >
              <span dir="auto">
                {f('review.duplicate', { key: dup.key, summary: dup.summary, status: dup.status })}
              </span>
            </Banner>
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

          <div className={styles.card}>
            <label className={styles.cardLabel} htmlFor="summary">
              {t('review.summary')}
            </label>
            <input
              id="summary"
              className={`input ${styles.summary}`}
              dir="auto"
              maxLength={120}
              value={draft.summary}
              onChange={(e) => update({ summary: e.target.value })}
              aria-invalid={fieldErrors.summary !== undefined || draft.summary.trim() === ''}
            />
            {fieldErrors.summary !== undefined && (
              <p className="field-error">{fieldErrors.summary}</p>
            )}
          </div>

          <fieldset className={`${styles.card} ${styles.description}`}>
            <legend className={styles.cardLabel}>{t('review.description')}</legend>
            <label className={styles.descLabel} htmlFor="environment">
              {t('review.environment')}
            </label>
            <input
              id="environment"
              className="input"
              dir="auto"
              maxLength={2000}
              value={draft.environment}
              onChange={(e) => update({ environment: e.target.value })}
            />
            <label className={styles.descLabel} htmlFor="steps">
              {t('review.steps')}
              {draft.stepsToReproduce.length === 0 && (
                <span className={styles.needsInput}>{t('review.needsInput')}</span>
              )}
            </label>
            <textarea
              id="steps"
              className={`textarea ${draft.stepsToReproduce.length === 0 ? styles.needsField : ''}`}
              dir="auto"
              rows={3}
              placeholder={t('review.stepsPlaceholder')}
              value={stepsText}
              aria-describedby="steps-help"
              onChange={(e) =>
                update({
                  stepsToReproduce: e.target.value
                    .split('\n')
                    .map((x) => x.slice(0, 300))
                    .slice(0, 30),
                })
              }
              onBlur={() =>
                update({ stepsToReproduce: draft.stepsToReproduce.filter((x) => x.trim() !== '') })
              }
            />
            <p id="steps-help" className={styles.muted}>
              {t('review.stepsHelp')}
            </p>
            <label className={styles.descLabel} htmlFor="actual">
              {t('review.actual')}
            </label>
            <textarea
              id="actual"
              className="textarea"
              dir="auto"
              rows={2}
              maxLength={2000}
              value={draft.actualResult}
              onChange={(e) => update({ actualResult: e.target.value })}
            />
            <label className={styles.descLabel} htmlFor="expected">
              {t('review.expected')}
            </label>
            <textarea
              id="expected"
              className="textarea"
              dir="auto"
              rows={2}
              maxLength={2000}
              value={draft.expectedResult}
              onChange={(e) => update({ expectedResult: e.target.value })}
            />
            <p className={styles.muted}>{t('review.screenshotAttached')}</p>
            {draft.missingInfo.length > 0 && (
              <div className={styles.missing}>
                <p>
                  <strong>{t('review.needsInput')}: </strong>
                  {t('review.missingInfo')}
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
          </fieldset>

          <section className={styles.card} aria-labelledby="fields-title">
            <h2 id="fields-title" className={styles.cardLabel}>
              {t('review.fields')}
            </h2>
            <div className={styles.tiles}>
              <div className={styles.tile}>
                <span className="label">{t('review.project')}</span>
                <strong>{s.projectKey}</strong>
              </div>
              <div className={styles.tile}>
                <label className="label" htmlFor="issue-type">
                  {t('review.type')}
                </label>
                <select
                  id="issue-type"
                  className="select"
                  value={draft.issueType}
                  onChange={(e) => void changeIssueType(e.target.value)}
                >
                  {(
                    s.createMeta?.issueTypes ?? [{ id: draft.issueType, name: draft.issueType }]
                  ).map((it) => (
                    <option key={it.id} value={it.name}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.tile}>
                <label className="label" htmlFor="priority">
                  {t('review.priority')}
                  {aiPriority !== null && draft.priority === aiPriority && (
                    <span className={styles.aiTag}> · {t('review.aiSuggested')}</span>
                  )}
                </label>
                <select
                  id="priority"
                  className="select"
                  value={draft.priority ?? ''}
                  onChange={(e) =>
                    update({
                      priority: e.target.value === '' ? null : (e.target.value as Priority),
                    })
                  }
                >
                  <option value="">{t('review.priorityNone')}</option>
                  {(s.createMeta?.priorities ?? []).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.tiles2}>
              <div className={`${styles.tile} ${styles.assignee}`}>
                {s.assignee !== null ? (
                  <>
                    <span className={styles.avatar} aria-hidden="true">
                      {initials(s.assignee.displayName)}
                    </span>
                    <span className={styles.flex}>
                      <span className="label">{t('review.assignee')}</span>
                      <strong dir="auto">{s.assignee.displayName}</strong>
                      {s.resolution?.preselected === s.assignee.username &&
                        s.resolution.matchedFrom !== null && (
                          <span className={styles.matched} dir="auto">
                            {f('review.matchedFrom', { query: s.resolution.matchedFrom })}
                          </span>
                        )}
                    </span>
                  </>
                ) : (
                  <span className={styles.flex}>
                    <span className="label">{t('review.assignee')}</span>
                    <strong>{t('review.unassigned')}</strong>
                  </span>
                )}
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowSearch(true)}
                  disabled={inFlight}
                >
                  {t('review.change')}
                </button>
              </div>
              <div className={styles.tile}>
                <label className="label" htmlFor="labels">
                  {t('review.labels')}
                </label>
                <div className={styles.labels}>
                  <span className={styles.labelChip}>laqta</span>
                  <input
                    id="labels"
                    className="input"
                    value={draft.labels.join(', ')}
                    onChange={(e) =>
                      update({
                        labels: e.target.value
                          .split(',')
                          .map((x) => x.trim().toLowerCase())
                          .filter((x) => x !== '')
                          .slice(0, 5),
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </section>

          {showSearch && (
            <div className={`${styles.card} ${styles.searchRow}`}>
              <label className="label" htmlFor="assignee-search">
                {t('review.searchAssignee')}
              </label>
              <div className={styles.row}>
                <input
                  id="assignee-search"
                  className="input"
                  dir="auto"
                  maxLength={100}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void search()}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => void search()}
                  disabled={searching}
                >
                  {t('review.searchAssigneeButton')}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    s.set({ assignee: null, assigneeConfirmed: true });
                    setShowSearch(false);
                  }}
                >
                  {t('picker.leaveUnassigned')}
                </button>
              </div>
              {searchEmpty !== null && (
                <p className={styles.muted}>
                  {f('review.noAssigneeMatch', { query: searchEmpty })}
                </p>
              )}
            </div>
          )}

          {s.createMeta !== null && s.createMeta.requiredFields.length > 0 && (
            <div className={`${styles.card} ${styles.required}`}>
              {s.createMeta.requiredFields.map((field) => {
                const id = `rf-${field.id}`;
                const value = s.extraValues[field.id] ?? '';
                const setValue = (v: string) =>
                  s.set({ extraValues: { ...s.extraValues, [field.id]: v } });
                return (
                  <div key={field.id}>
                    <label className="label" htmlFor={id}>
                      {f('review.requiredField', { name: field.name })}
                    </label>
                    {field.allowedValues ? (
                      <select
                        id={id}
                        className="select"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        aria-invalid={missing.includes(field.id)}
                        required
                      >
                        <option value="">{t('review.chooseValue')}</option>
                        {field.allowedValues.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                      </select>
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
          <p id="write-notice" className="visually-hidden">
            {t('review.writeNotice')}
          </p>
        </section>
      </div>

      {picker !== null && (
        <AssigneePicker
          name={picker.name}
          candidates={picker.candidates}
          onCancel={() => setPicker(null)}
          onPick={(c) => {
            s.set({ assignee: c, assigneeConfirmed: true });
            setPicker(null);
            setShowSearch(false);
          }}
        />
      )}
    </Shell>
  );
}
