import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { isHttpsUrl, looksLikeJiraCloud } from '../../shared/schemas';
import type { StringKey } from '../../shared/strings';
import type { JiraProject, PermissionStatus, Settings, SettingsView } from '../../shared/types';
import { laqta, LaqtaIpcError } from '../shared/api';
import Banner from '../shared/Banner';
import { AppMark, ErrorIcon, SuccessIcon } from '../shared/icons';
import { useI18n } from '../shared/i18n';
import { Row, Segmented, ShortcutRecorder, SwitchRow } from './controls';
import { CaptureIcon, GlobeIcon, LinkIcon, LockIcon, ShieldIcon, SparkIcon } from './navIcons';
import styles from './Settings.module.css';

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; name: string }
  | { kind: 'error'; message: string };

type Section = 'jira' | 'ai' | 'capture' | 'language' | 'privacy' | 'permissions';

const SECTIONS: { id: Section; nav: StringKey; title: StringKey; icon: () => ReactNode }[] = [
  { id: 'jira', nav: 'settings.nav.jira', title: 'settings.connect', icon: LinkIcon },
  { id: 'ai', nav: 'settings.nav.ai', title: 'settings.aiTitle', icon: SparkIcon },
  { id: 'capture', nav: 'settings.nav.capture', title: 'settings.nav.capture', icon: CaptureIcon },
  {
    id: 'language',
    nav: 'settings.nav.language',
    title: 'settings.nav.language',
    icon: GlobeIcon,
  },
  { id: 'privacy', nav: 'settings.nav.privacy', title: 'settings.nav.privacy', icon: ShieldIcon },
  { id: 'permissions', nav: 'settings.nav.permissions', title: 'perm.title', icon: LockIcon },
];

const INTRO: Record<Section, StringKey> = {
  jira: 'settings.jiraIntro',
  ai: 'settings.aiIntro',
  capture: 'settings.captureIntro',
  language: 'settings.languageIntro',
  privacy: 'settings.privacyIntro',
  permissions: 'perm.body',
};

/**
 * Board 5, card 1 (sign-in) and card 2 (macOS permission guide), plus preferences, laid out
 * as a preferences window: sections in a sidebar, one section at a time, and a Save bar that
 * is always visible. The rules are unchanged: test the connection before saving, the token
 * is write-only and masked, and the version is shown.
 */
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
  const [section, setSection] = useState<Section>('jira');
  const tabRefs = useRef(new Map<Section, HTMLButtonElement>());

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

  const set = (patch: Partial<Settings>) => {
    setMessage(null);
    setForm({ ...form, ...patch });
  };
  /** A test result describes the details it ran with, so editing them clears it. */
  const setConnection = (patch: Partial<Settings>) => {
    if (test.kind !== 'testing') setTest({ kind: 'idle' });
    set(patch);
  };
  const mac =
    perm !== null ? perm.platform === 'darwin' : navigator.userAgent.includes('Macintosh');
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
  const configured = view.hasToken && view.settings.jiraBaseUrl !== '';
  const dirty = token !== '' || JSON.stringify(form) !== JSON.stringify(view.settings);
  const showPermissions = perm !== null && perm.platform === 'darwin';
  const screenMissing = showPermissions && perm.screen !== 'granted';
  const jiraAttention = !configured || needsTest || !urlValid;
  const aiAttention = form.aiProvider === 'gateway' && !view.gatewayConfigured;
  const sections = SECTIONS.filter((s) => s.id !== 'permissions' || showPermissions);
  const current = sections.find((s) => s.id === section) ?? sections[0];
  if (current === undefined) return null;

  const status: { tone: 'ok' | 'error' | 'neutral'; title: string; detail: string } =
    test.kind === 'ok' && !needsTest
      ? {
          tone: 'ok',
          title: t('settings.statusConnected'),
          detail: f('settings.connectedAs', { name: test.name }),
        }
      : test.kind === 'error'
        ? { tone: 'error', title: t('settings.statusFailed'), detail: test.message }
        : configured && !connectionChanged
          ? { tone: 'ok', title: t('settings.statusSaved'), detail: view.settings.jiraBaseUrl }
          : {
              tone: 'neutral',
              title: t('settings.statusNotConnected'),
              detail: t('settings.statusUntested'),
            };

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
      setSection('jira');
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
      if (result.hotkeyConflicts.length > 0) setSection('capture');
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

  /** Vertical tabs: arrows, Home and End move between sections (WAI-ARIA tabs pattern). */
  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const ids = sections.map((s) => s.id);
    const index = ids.indexOf(section);
    const next =
      e.key === 'ArrowDown'
        ? ids[(index + 1) % ids.length]
        : e.key === 'ArrowUp'
          ? ids[(index - 1 + ids.length) % ids.length]
          : e.key === 'Home'
            ? ids[0]
            : e.key === 'End'
              ? ids[ids.length - 1]
              : undefined;
    if (next === undefined) return;
    e.preventDefault();
    setSection(next);
    tabRefs.current.get(next)?.focus();
  }

  const attention = (id: Section) =>
    (id === 'jira' && jiraAttention) ||
    (id === 'ai' && aiAttention) ||
    (id === 'permissions' && screenMissing) ||
    (id === 'capture' && conflicts.length > 0);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <AppMark size={36} />
          <span className={styles.brandText}>
            <span className={styles.brandName}>Laqta</span>
            <span className={styles.brandVersion}>
              {f('settings.version', { version: view.appVersion })}
            </span>
          </span>
        </div>
        <h1 className="visually-hidden">{t('settings.title')}</h1>
        <div
          className={styles.tabs}
          role="tablist"
          aria-orientation="vertical"
          aria-label={t('settings.sections')}
        >
          {sections.map((s) => {
            const selected = s.id === current.id;
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(s.id, el);
                  else tabRefs.current.delete(s.id);
                }}
                id={`tab-${s.id}`}
                type="button"
                role="tab"
                className={styles.tab}
                aria-selected={selected}
                aria-controls="settings-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setSection(s.id)}
                onKeyDown={onTabKey}
              >
                <Icon />
                <span className={styles.tabLabel}>{t(s.nav)}</span>
                {attention(s.id) && (
                  <span className={styles.dot} title={t('settings.needsAttention')}>
                    <span className="visually-hidden">{t('settings.needsAttention')}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className={styles.sideStatus} data-tone={status.tone}>
          <span className={styles.sideStatusDot} aria-hidden="true" />
          <span>{status.title}</span>
        </div>
      </aside>

      <div className={styles.main}>
        <div
          id="settings-panel"
          className={styles.panel}
          role="tabpanel"
          aria-labelledby={`tab-${current.id}`}
          tabIndex={-1}
        >
          <header className={styles.header}>
            <h2 className={styles.title}>{t(current.title)}</h2>
            <p className={styles.intro}>{t(INTRO[current.id])}</p>
          </header>

          {current.id === 'jira' && (
            <>
              {!view.encryptionAvailable && (
                <Banner kind="error" lead={t('error.lead')}>
                  {t('settings.noEncryption')}
                </Banner>
              )}

              <div className={styles.statusCard} data-tone={status.tone} aria-live="polite">
                <span className={styles.statusIcon} aria-hidden="true">
                  {status.tone === 'ok' ? (
                    <SuccessIcon />
                  ) : status.tone === 'error' ? (
                    <ErrorIcon />
                  ) : (
                    <LinkIcon />
                  )}
                </span>
                <span className={styles.statusText}>
                  <strong>{status.title}</strong>
                  <span dir="auto">{status.detail}</span>
                </span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void runTest()}
                  disabled={
                    !isHttpsUrl(form.jiraBaseUrl) || emailMissing || test.kind === 'testing'
                  }
                >
                  {test.kind === 'testing' ? (
                    <>
                      <span className={styles.spinner} aria-hidden="true" />
                      {t('settings.testing')}
                    </>
                  ) : (
                    t('settings.testConnection')
                  )}
                </button>
              </div>

              <section className={styles.group}>
                <Row labelId="deployment-label" label={t('settings.deployment')}>
                  <Segmented
                    name="jira-deployment"
                    labelledBy="deployment-label"
                    value={form.jiraDeployment}
                    options={[
                      { value: 'datacenter', label: t('settings.deploymentDcShort') },
                      { value: 'cloud', label: t('settings.deploymentCloudShort') },
                    ]}
                    onChange={(v) => setConnection({ jiraDeployment: v })}
                  />
                </Row>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="jira-url">
                    {t('settings.jiraAddress')}
                  </label>
                  <input
                    id="jira-url"
                    className="input"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    dir="ltr"
                    placeholder={t('settings.jiraAddressPlaceholder')}
                    value={form.jiraBaseUrl}
                    onChange={(e) => {
                      const url = e.target.value.trim();
                      setConnection(
                        looksLikeJiraCloud(url)
                          ? { jiraBaseUrl: url, jiraDeployment: 'cloud' }
                          : { jiraBaseUrl: url },
                      );
                    }}
                    aria-invalid={!urlValid}
                    aria-describedby={urlValid ? 'deployment-help' : 'url-error'}
                  />
                  {urlValid ? (
                    <p id="deployment-help" className={styles.fieldHelp}>
                      {cloud ? t('settings.deploymentCloud') : t('settings.deploymentDc')}
                    </p>
                  ) : (
                    <p id="url-error" className="field-error">
                      {t('settings.httpsOnly')}
                    </p>
                  )}
                </div>
                {cloud && (
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="jira-email">
                      {t('settings.email')}
                    </label>
                    <input
                      id="jira-email"
                      className="input"
                      type="email"
                      autoComplete="email"
                      spellCheck={false}
                      dir="ltr"
                      value={form.jiraEmail}
                      onChange={(e) => setConnection({ jiraEmail: e.target.value.trim() })}
                      aria-invalid={emailMissing}
                    />
                  </div>
                )}
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="jira-token">
                    {cloud ? t('settings.tokenCloud') : t('settings.token')}
                  </label>
                  <input
                    id="jira-token"
                    className="input"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    dir="ltr"
                    placeholder={view.hasToken ? '••••••••••••' : ''}
                    value={token}
                    onChange={(e) => {
                      setMessage(null);
                      if (test.kind !== 'testing') setTest({ kind: 'idle' });
                      setToken(e.target.value.trim());
                    }}
                    aria-describedby="token-help"
                    disabled={!view.encryptionAvailable}
                  />
                  <p id="token-help" className={styles.fieldHelp}>
                    {view.hasToken && (
                      <>
                        <strong>{t('settings.tokenStored')}</strong>{' '}
                      </>
                    )}
                    {cloud ? t('settings.tokenHelpCloud') : t('settings.tokenHelp')}
                  </p>
                </div>
              </section>

              <section className={styles.group}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="default-project">
                    {t('settings.defaultProject')}
                  </label>
                  {projects.length > 0 ? (
                    <select
                      id="default-project"
                      className="select"
                      value={form.defaultProjectKey}
                      onChange={(e) => set({ defaultProjectKey: e.target.value })}
                      aria-describedby="project-help"
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
                      dir="ltr"
                      value={form.defaultProjectKey}
                      onChange={(e) => set({ defaultProjectKey: e.target.value.toUpperCase() })}
                      aria-describedby="project-help"
                    />
                  )}
                  <p id="project-help" className={styles.fieldHelp}>
                    {t('settings.defaultProjectHelp')}
                  </p>
                </div>
              </section>
            </>
          )}

          {current.id === 'ai' && (
            <>
              <section className={styles.group}>
                <Row
                  labelId="ai-provider-label"
                  label={t('settings.aiProvider')}
                  help={
                    form.aiProvider === 'claude-code'
                      ? t('settings.aiClaudeCodeHelp')
                      : view.gatewayConfigured
                        ? t('settings.aiGatewayHelp')
                        : undefined
                  }
                >
                  <Segmented
                    name="ai-provider"
                    labelledBy="ai-provider-label"
                    value={form.aiProvider}
                    options={[
                      { value: 'gateway', label: t('settings.aiGateway') },
                      { value: 'claude-code', label: t('settings.aiClaudeCode') },
                    ]}
                    onChange={(v) => set({ aiProvider: v })}
                  />
                </Row>
              </section>
              {aiAttention && (
                <Banner kind="warning" lead={t('error.lead')}>
                  {t('settings.aiGatewayMissing')}
                </Banner>
              )}
              {form.aiProvider === 'claude-code' && (
                <section className={styles.group} aria-labelledby="ai-steps-title">
                  <h3 id="ai-steps-title" className={styles.groupTitle}>
                    {t('settings.aiClaudeCodeSteps')}
                  </h3>
                  <ol className={styles.steps}>
                    <li>{t('settings.aiClaudeCodeStep1')}</li>
                    <li>{t('settings.aiClaudeCodeStep2')}</li>
                    <li>{t('settings.aiClaudeCodeStep3')}</li>
                  </ol>
                </section>
              )}
            </>
          )}

          {current.id === 'capture' && (
            <>
              <section className={styles.group} aria-labelledby="shortcuts-title">
                <h3 id="shortcuts-title" className={styles.groupTitle}>
                  {t('settings.shortcuts')}
                </h3>
                <Row htmlFor="hotkey-area" label={t('settings.hotkeyArea')}>
                  <ShortcutRecorder
                    id="hotkey-area"
                    label={t('settings.hotkeyArea')}
                    value={form.hotkeyArea}
                    mac={mac}
                    onChange={(v) => set({ hotkeyArea: v })}
                  />
                </Row>
                <Row htmlFor="hotkey-window" label={t('settings.hotkeyWindow')}>
                  <ShortcutRecorder
                    id="hotkey-window"
                    label={t('settings.hotkeyWindow')}
                    value={form.hotkeyWindow}
                    mac={mac}
                    onChange={(v) => set({ hotkeyWindow: v })}
                  />
                </Row>
                <p className={styles.groupFoot}>{t('settings.hotkeyHelp')}</p>
              </section>
              {conflicts.map((c) => (
                <Banner key={c} kind="warning" lead={t('error.lead')}>
                  {f('settings.hotkeyConflict', { accelerator: c })}
                </Banner>
              ))}

              <section className={styles.group} aria-labelledby="voice-title">
                <h3 id="voice-title" className={styles.groupTitle}>
                  {t('settings.voice')}
                </h3>
                <SwitchRow
                  id="voice-enabled"
                  label={t('settings.voiceEnabled')}
                  help={t('settings.voiceHelp')}
                  checked={form.voiceEnabled}
                  onChange={(v) => set({ voiceEnabled: v })}
                />
                {form.voiceEnabled && (
                  <Row htmlFor="voice-lang" label={t('settings.voiceLanguage')}>
                    <select
                      id="voice-lang"
                      className={`select ${styles.compactSelect}`}
                      value={form.voiceLanguage}
                      onChange={(e) =>
                        set({
                          voiceLanguage:
                            e.target.value === 'ar-JO'
                              ? 'ar-JO'
                              : e.target.value === 'en'
                                ? 'en'
                                : 'auto',
                        })
                      }
                    >
                      <option value="ar-JO">{t('lang.arJO')}</option>
                      <option value="en">{t('lang.en')}</option>
                      <option value="auto">{t('lang.auto')}</option>
                    </select>
                  </Row>
                )}
              </section>
            </>
          )}

          {current.id === 'language' && (
            <section className={styles.group}>
              <Row labelId="ui-language-label" label={t('settings.uiLanguage')}>
                <Segmented
                  name="ui-language"
                  labelledBy="ui-language-label"
                  value={form.uiLanguage}
                  options={[
                    { value: 'en', label: t('lang.nativeEn'), lang: 'en' },
                    { value: 'ar', label: t('lang.nativeAr'), lang: 'ar' },
                  ]}
                  onChange={(v) => set({ uiLanguage: v })}
                />
              </Row>
              <Row labelId="bug-language-label" label={t('settings.bugLanguage')}>
                <Segmented
                  name="bug-language"
                  labelledBy="bug-language-label"
                  value={form.bugLanguage}
                  options={[
                    { value: 'en', label: t('lang.nativeEn'), lang: 'en' },
                    { value: 'ar', label: t('lang.nativeAr'), lang: 'ar' },
                  ]}
                  onChange={(v) => set({ bugLanguage: v })}
                />
              </Row>
            </section>
          )}

          {current.id === 'privacy' && (
            <section className={styles.group}>
              <SwitchRow
                id="telemetry"
                label={t('settings.telemetry')}
                help={t('settings.telemetryHelp')}
                checked={form.telemetryEnabled}
                onChange={(v) => set({ telemetryEnabled: v })}
              />
              <SwitchRow
                id="confirm-no-blur"
                label={t('settings.confirmNoBlur')}
                help={t('settings.confirmNoBlurHelp')}
                checked={form.confirmNoBlur}
                onChange={(v) => set({ confirmNoBlur: v })}
              />
            </section>
          )}

          {current.id === 'permissions' && perm !== null && (
            <>
              <section className={styles.group}>
                {(['screen', 'microphone'] as const).map((kind) => {
                  const granted = perm[kind] === 'granted';
                  return (
                    <Row
                      key={kind}
                      label={kind === 'screen' ? t('perm.screen') : t('perm.microphone')}
                    >
                      {granted ? (
                        <span className={styles.allowed}>
                          <SuccessIcon />
                          {t('perm.allowed')}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => void laqta.permissionsOpenSystemSettings({ kind })}
                        >
                          {t('perm.openSettings')}
                        </button>
                      )}
                    </Row>
                  );
                })}
              </section>
              <p className={styles.note}>{t('perm.note')}</p>
            </>
          )}
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerMessage} aria-live="polite">
            {message !== null ? (
              message.kind === 'ok' ? (
                <span className={styles.footerOk}>
                  <SuccessIcon />
                  {message.text}
                </span>
              ) : (
                <span className={styles.footerError} role="alert">
                  <ErrorIcon />
                  <span>
                    <strong>{t('error.lead')}</strong> {message.text}
                  </span>
                </span>
              )
            ) : (
              dirty && <span className={styles.footerDirty}>{t('settings.unsaved')}</span>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void save()}
            disabled={!urlValid || (configured && !dirty)}
          >
            {configured ? t('settings.save') : t('settings.saveContinue')}
          </button>
        </footer>
      </div>
    </div>
  );
}
