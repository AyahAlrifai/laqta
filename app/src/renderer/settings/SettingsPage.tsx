import { useEffect, useState } from 'react';
import { isHttpsUrl, looksLikeJiraCloud } from '../../shared/schemas';
import type { JiraProject, PermissionStatus, Settings, SettingsView } from '../../shared/types';
import { laqta, LaqtaIpcError } from '../shared/api';
import Banner from '../shared/Banner';
import { useI18n } from '../shared/i18n';
import styles from './Settings.module.css';

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; name: string }
  | { kind: 'error'; message: string };

/** Board 5, card 1 (sign-in) and card 2 (macOS permission guide), plus preferences. */
export default function SettingsPage() {
  const { t, f } = useI18n();
  const [view, setView] = useState<SettingsView | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [token, setToken] = useState('');
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [testedKey, setTestedKey] = useState<string | null>(null);
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [perm, setPerm] = useState<PermissionStatus | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);

  useEffect(() => {
    void laqta.settingsGet().then((v) => {
      setView(v);
      setForm(v.settings);
      if (v.hasToken && v.settings.jiraBaseUrl !== '') {
        laqta
          .jiraListProjects()
          .then(setProjects)
          .catch(() => undefined);
      }
    });
    void laqta.permissionsGet().then(setPerm);
  }, []);

  if (view === null || form === null) return null;

  const set = (patch: Partial<Settings>) => setForm({ ...form, ...patch });
  const cloud = form.jiraDeployment === 'cloud';
  const emailMissing = cloud && form.jiraEmail.trim() === '';
  const connectionKey = [form.jiraBaseUrl, form.jiraDeployment, form.jiraEmail, token].join(
    '\u0000',
  );
  const connectionChanged =
    form.jiraBaseUrl !== view.settings.jiraBaseUrl ||
    form.jiraDeployment !== view.settings.jiraDeployment ||
    form.jiraEmail !== view.settings.jiraEmail ||
    token !== '';
  const urlValid = form.jiraBaseUrl === '' || isHttpsUrl(form.jiraBaseUrl);
  const needsTest = connectionChanged && testedKey !== connectionKey;

  async function runTest() {
    if (form === null || !isHttpsUrl(form.jiraBaseUrl)) return;
    if (form.jiraDeployment === 'cloud' && form.jiraEmail.trim() === '') {
      setTest({ kind: 'error', message: t('settings.emailRequired') });
      return;
    }
    setTest({ kind: 'testing' });
    const result = await laqta.settingsTestConnection({
      baseUrl: form.jiraBaseUrl,
      token: token === '' ? undefined : token,
      deployment: form.jiraDeployment,
      email: form.jiraEmail.trim(),
    });
    if (result.ok) {
      setTest({ kind: 'ok', name: result.userDisplayName ?? '' });
      setTestedKey(connectionKey);
    } else {
      setTest({ kind: 'error', message: result.error?.userMessage ?? t('error.UNKNOWN') });
    }
  }

  async function save() {
    if (form === null || view === null) return;
    setMessage(null);
    if (needsTest) {
      setMessage({ kind: 'error', text: t('settings.testFirst') });
      return;
    }
    try {
      const result = await laqta.settingsSet({
        settings: form,
        token: token === '' ? undefined : token,
      });
      setConflicts(result.hotkeyConflicts);
      setToken('');
      setTestedKey(null);
      setView(result);
      setForm(result.settings);
      setMessage({ kind: 'ok', text: t('settings.saved') });
      laqta
        .jiraListProjects()
        .then(setProjects)
        .catch(() => undefined);
      if (result.settings.uiLanguage !== view.settings.uiLanguage) window.location.reload();
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof LaqtaIpcError ? error.error.userMessage : t('error.UNKNOWN'),
      });
    }
  }

  const showPermissionGuide = perm !== null && perm.platform === 'darwin';

  return (
    <main className={styles.page}>
      <h1 className={styles.h1}>{t('settings.title')}</h1>

      {!view.encryptionAvailable && (
        <Banner kind="error" lead={t('error.lead')}>
          {t('settings.noEncryption')}
        </Banner>
      )}

      {showPermissionGuide && (
        <section className={styles.card} aria-labelledby="perm-title">
          <h2 id="perm-title">{t('perm.title')}</h2>
          <p>{t('perm.body')}</p>
          {(['screen', 'microphone'] as const).map((kind) => {
            const granted = perm[kind] === 'granted';
            return (
              <div key={kind} className={styles.permRow}>
                <span>{kind === 'screen' ? t('perm.screen') : t('perm.microphone')}</span>
                {granted ? (
                  <strong className={styles.allowed}>{t('perm.allowed')}</strong>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void laqta.permissionsOpenSystemSettings({ kind })}
                  >
                    {t('perm.openSettings')}
                  </button>
                )}
              </div>
            );
          })}
          <p className={styles.muted}>{t('perm.note')}</p>
        </section>
      )}

      <section className={styles.card} aria-labelledby="connect-title">
        <h2 id="connect-title">{t('settings.connect')}</h2>
        <label className="label" htmlFor="jira-url">
          {t('settings.jiraAddress')}
        </label>
        <input
          id="jira-url"
          className="input"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('settings.jiraAddressPlaceholder')}
          value={form.jiraBaseUrl}
          onChange={(e) => {
            const url = e.target.value.trim();
            set(
              looksLikeJiraCloud(url)
                ? { jiraBaseUrl: url, jiraDeployment: 'cloud' }
                : { jiraBaseUrl: url },
            );
          }}
          aria-invalid={!urlValid}
          aria-describedby={urlValid ? undefined : 'url-error'}
        />
        {!urlValid && (
          <p id="url-error" className="field-error">
            {t('settings.httpsOnly')}
          </p>
        )}
        <label className="label" htmlFor="jira-deployment">
          {t('settings.deployment')}
        </label>
        <select
          id="jira-deployment"
          className="select"
          value={form.jiraDeployment}
          onChange={(e) =>
            set({ jiraDeployment: e.target.value === 'cloud' ? 'cloud' : 'datacenter' })
          }
        >
          <option value="datacenter">{t('settings.deploymentDc')}</option>
          <option value="cloud">{t('settings.deploymentCloud')}</option>
        </select>
        {cloud && (
          <>
            <label className="label" htmlFor="jira-email">
              {t('settings.email')}
            </label>
            <input
              id="jira-email"
              className="input"
              type="email"
              autoComplete="email"
              spellCheck={false}
              value={form.jiraEmail}
              onChange={(e) => set({ jiraEmail: e.target.value.trim() })}
              aria-invalid={emailMissing}
            />
          </>
        )}
        <label className="label" htmlFor="jira-token">
          {cloud ? t('settings.tokenCloud') : t('settings.token')}
        </label>
        <input
          id="jira-token"
          className="input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={view.hasToken ? '••••••••••••' : ''}
          value={token}
          onChange={(e) => setToken(e.target.value.trim())}
          aria-describedby="token-help"
          disabled={!view.encryptionAvailable}
        />
        <p id="token-help" className={styles.muted}>
          {view.hasToken ? `${t('settings.tokenStored')} ` : ''}
          {cloud ? t('settings.tokenHelpCloud') : t('settings.tokenHelp')}
        </p>
        <div className={styles.actions} aria-live="polite">
          {test.kind === 'ok' && (
            <span className={styles.allowed}>{f('settings.connectedAs', { name: test.name })}</span>
          )}
          {test.kind === 'error' && (
            <span className="field-error" role="alert">
              {test.message}
            </span>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => void runTest()}
            disabled={!isHttpsUrl(form.jiraBaseUrl) || emailMissing || test.kind === 'testing'}
          >
            {test.kind === 'testing' ? t('settings.testing') : t('settings.testConnection')}
          </button>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="prefs-title">
        <h2 id="prefs-title" className="visually-hidden">
          {t('settings.title')}
        </h2>
        <div className={styles.grid}>
          <div>
            <label className="label" htmlFor="default-project">
              {t('settings.defaultProject')}
            </label>
            {projects.length > 0 ? (
              <select
                id="default-project"
                className="select"
                value={form.defaultProjectKey}
                onChange={(e) => set({ defaultProjectKey: e.target.value })}
              >
                <option value="">{t('editor.projectPlaceholder')}</option>
                {projects.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.key} · {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="default-project"
                className="input"
                value={form.defaultProjectKey}
                onChange={(e) => set({ defaultProjectKey: e.target.value.toUpperCase() })}
              />
            )}
          </div>
          <div>
            <label className="label" htmlFor="bug-language">
              {t('settings.bugLanguage')}
            </label>
            <select
              id="bug-language"
              className="select"
              value={form.bugLanguage}
              onChange={(e) => set({ bugLanguage: e.target.value === 'ar' ? 'ar' : 'en' })}
            >
              <option value="en">{t('lang.en')}</option>
              <option value="ar">{t('lang.ar')}</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ui-language">
              {t('settings.uiLanguage')}
            </label>
            <select
              id="ui-language"
              className="select"
              value={form.uiLanguage}
              onChange={(e) => set({ uiLanguage: e.target.value === 'ar' ? 'ar' : 'en' })}
            >
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </div>
          <div />
          <div>
            <label className="label" htmlFor="hotkey-area">
              {t('settings.hotkeyArea')}
            </label>
            <input
              id="hotkey-area"
              className="input"
              value={form.hotkeyArea}
              onChange={(e) => set({ hotkeyArea: e.target.value })}
              aria-describedby="hotkey-help"
              spellCheck={false}
            />
          </div>
          <div>
            <label className="label" htmlFor="hotkey-window">
              {t('settings.hotkeyWindow')}
            </label>
            <input
              id="hotkey-window"
              className="input"
              value={form.hotkeyWindow}
              onChange={(e) => set({ hotkeyWindow: e.target.value })}
              aria-describedby="hotkey-help"
              spellCheck={false}
            />
          </div>
        </div>
        <p id="hotkey-help" className={styles.muted}>
          {t('settings.hotkeyHelp')}
        </p>
        {conflicts.map((c) => (
          <Banner key={c} kind="warning" lead={t('error.lead')}>
            {f('settings.hotkeyConflict', { accelerator: c })}
          </Banner>
        ))}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.voiceEnabled}
            onChange={(e) => set({ voiceEnabled: e.target.checked })}
          />
          {t('settings.voiceEnabled')}
        </label>
        {form.voiceEnabled && (
          <div>
            <label className="label" htmlFor="voice-lang">
              {t('settings.voiceLanguage')}
            </label>
            <select
              id="voice-lang"
              className="select"
              value={form.voiceLanguage}
              onChange={(e) =>
                set({
                  voiceLanguage:
                    e.target.value === 'ar-JO' ? 'ar-JO' : e.target.value === 'en' ? 'en' : 'auto',
                })
              }
            >
              <option value="ar-JO">{t('lang.arJO')}</option>
              <option value="en">{t('lang.en')}</option>
              <option value="auto">{t('lang.auto')}</option>
            </select>
          </div>
        )}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.telemetryEnabled}
            onChange={(e) => set({ telemetryEnabled: e.target.checked })}
          />
          {t('settings.telemetry')}
        </label>
      </section>

      {message !== null && (
        <div aria-live="polite">
          {message.kind === 'ok' ? (
            <Banner kind="info">{message.text}</Banner>
          ) : (
            <Banner kind="error" lead={t('error.lead')}>
              {message.text}
            </Banner>
          )}
        </div>
      )}

      <div className={styles.footer}>
        <span className={styles.muted}>{f('settings.version', { version: view.appVersion })}</span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void save()}
          disabled={!urlValid}
        >
          {view.hasToken ? t('settings.save') : t('settings.saveContinue')}
        </button>
      </div>
    </main>
  );
}
