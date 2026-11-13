import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { format, t, type StringKey } from '../src/shared/strings';
import { MockJira } from '../test/mock-jira';
import { pick, valueOf } from './pick';

// Settings › Jira › Default project (spec section 9, board 5): a Jira-backed dropdown that is
// disabled until a connection works, falls back to a text input when the list fails, and
// keeps the saved choice. LAQTA_E2E_JIRA_URL is deliberately not set: that switch
// preconfigures Jira and blanks the address, while these tests start from a first run and
// type the mock's address into Settings (E2E runs accept its http://127.0.0.1 URL).

const mock = new MockJira();
let jiraUrl = '';
let app: ElectronApplication | null = null;
let userData = '';

const en = (key: StringKey) => t('en', key);

test.beforeAll(async () => {
  jiraUrl = await mock.start();
});
test.afterAll(async () => {
  await mock.stop();
});

test.beforeEach(() => {
  mock.reset();
  mock.config.token = 'e2e-token';
  userData = mkdtempSync(join(tmpdir(), 'laqta-e2e-settings-'));
});

test.afterEach(async () => {
  await app?.close();
  app = null;
});

/** Launches a first-run app; Settings opens by itself because Jira is not configured. */
async function launchSettings(): Promise<Page> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith('LAQTA_E2E_JIRA')) env[k] = v;
  }
  app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...env, LAQTA_E2E: '1', LAQTA_E2E_USER_DATA: userData },
    // No colour-scheme emulation: the appearance tests need nativeTheme to reach the page.
    colorScheme: null,
  });
  for (let i = 0; i < 200; i++) {
    const page = app.windows().find((w) => w.url().includes('/settings/'));
    if (page) {
      await page.waitForLoadState('domcontentloaded');
      return page;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('no settings window');
}

const projectField = (page: Page, lang: 'en' | 'ar' = 'en') =>
  page.getByRole('combobox', { name: t(lang, 'settings.defaultProject'), exact: true });

/** Types the mock's details and presses Test connection; waits for the success status. */
async function connect(page: Page, url = jiraUrl): Promise<void> {
  await page.getByLabel(en('settings.jiraAddress'), { exact: true }).fill(url);
  await page.getByLabel(en('settings.token'), { exact: true }).fill('e2e-token');
  await page.getByRole('button', { name: en('settings.testConnection'), exact: true }).click();
  await expect(
    page.getByText(format('en', 'settings.connectedAs', { name: 'Test User' }), { exact: true }),
  ).toBeVisible();
}

async function connectAndSave(page: Page, projectKey: string): Promise<void> {
  await connect(page);
  await pick(projectField(page), projectKey);
  await page.getByRole('button', { name: en('settings.save'), exact: true }).click();
  await expect(page.getByText(en('settings.saved'), { exact: true })).toBeVisible();
}

test('first run: the project select is disabled until Jira is connected', async () => {
  const page = await launchSettings();
  const select = projectField(page);
  await expect(select).toBeDisabled();
  await expect(select).toHaveAttribute(valueOf, '');
  await expect(page.getByText(en('settings.projectConnectFirst'), { exact: true })).toBeVisible();
  expect(mock.calls).toEqual([]);
});

test('test connection lists the projects; the saved choice survives a reload', async () => {
  const page = await launchSettings();
  await connect(page);
  const select = projectField(page);
  await expect(select).toBeEnabled();
  await expect(page.getByText(en('settings.projectConnectFirst'))).toHaveCount(0);
  // Nothing chosen yet: the placeholder shows; the list holds the mock's PROJ and REQ.
  await expect(select).toHaveText(en('editor.projectPlaceholder'));
  await select.click();
  const options = page.getByRole('listbox', { name: en('settings.defaultProject') });
  await expect(options.getByRole('option')).toHaveCount(2);
  await expect(options.getByRole('option', { name: /^\W*PROJ\b/ })).toHaveCount(1);
  await select.press('Escape');
  await expect(options).toBeHidden();

  await pick(select, 'REQ');
  await page.getByRole('button', { name: en('settings.save'), exact: true }).click();
  await expect(page.getByText(en('settings.saved'), { exact: true })).toBeVisible();
  const stored = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')) as {
    jiraBaseUrl: string;
    defaultProjectKey: string;
  };
  expect(stored).toMatchObject({ jiraBaseUrl: jiraUrl, defaultProjectKey: 'REQ' });

  // A fresh mount loads the list with the saved connection (jira:listProjects).
  await page.reload();
  await expect(projectField(page)).toBeEnabled();
  await expect(projectField(page)).toHaveAttribute(valueOf, 'REQ');
  await expect(page.getByRole('button', { name: en('settings.save'), exact: true })).toBeVisible();
});

test('editing the address disconnects the field; reverting it brings the list back', async () => {
  const page = await launchSettings();
  await connectAndSave(page, 'REQ');
  const address = page.getByLabel(en('settings.jiraAddress'), { exact: true });
  const select = projectField(page);
  await expect(select).toHaveAttribute(valueOf, 'REQ');

  await address.fill(`${jiraUrl}/other`);
  await expect(select).toBeDisabled();
  await expect(page.getByText(en('settings.projectConnectFirst'), { exact: true })).toBeVisible();

  // Regression: the field used to stay disconnected after typing the saved address back.
  await address.fill(jiraUrl);
  await expect(select).toBeEnabled();
  await expect(select).toHaveAttribute(valueOf, 'REQ');
  await expect(page.getByText(en('settings.projectConnectFirst'))).toHaveCount(0);
});

test('a failed project list falls back to a text input with Try again', async () => {
  mock.config.projectFailures = 1;
  const page = await launchSettings();
  await connect(page);

  const banner = page.getByRole('alert').filter({ hasText: en('settings.projectLoadFailed') });
  await expect(banner).toBeVisible();
  const input = page.getByRole('textbox', { name: en('settings.defaultProject'), exact: true });
  await expect(input).toBeEditable();
  await input.fill('proj');
  await expect(input).toHaveValue('PROJ');

  // Try again re-runs the test; the mock now answers, so the select comes back.
  await banner.getByRole('button', { name: en('settings.projectRetry'), exact: true }).click();
  const select = page.getByRole('combobox', { name: en('settings.defaultProject'), exact: true });
  await expect(select).toBeEnabled();
  await expect(select).toHaveAttribute(valueOf, 'PROJ');
  await expect(select).toBeFocused();
  await expect(banner).toHaveCount(0);
});

test('Arabic UI: the connect-first message is in Arabic and the page is RTL', async () => {
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ uiLanguage: 'ar' }));
  const page = await launchSettings();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(projectField(page, 'ar')).toBeDisabled();
  await expect(
    page.getByText(t('ar', 'settings.projectConnectFirst'), { exact: true }),
  ).toBeVisible();
});

/** Set LAQTA_SHOTS=<dir> to save a screenshot for a visual check. */
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.LAQTA_SHOTS;
  if (dir !== undefined) await page.screenshot({ path: join(dir, `${name}.png`) });
}

// String expressions: the e2e tsconfig has no DOM types.
const prefersDark = (page: Page) =>
  page.evaluate<boolean>("matchMedia('(prefers-color-scheme: dark)').matches");
const bodyBackground = (page: Page) =>
  page.evaluate<string>('getComputedStyle(document.body).backgroundColor');

test('appearance: picking a theme applies it at once and saves it (T-086)', async () => {
  const page = await launchSettings();
  await connect(page);
  await page.getByRole('tab', { name: en('settings.nav.appearance'), exact: true }).click();
  const group = page.getByRole('radiogroup', { name: en('settings.theme'), exact: true });
  await expect(group.getByRole('radio', { name: en('theme.system') })).toBeChecked();

  await group.getByRole('radio', { name: en('theme.dark') }).check();
  await expect.poll(() => prefersDark(page)).toBe(true);
  await expect.poll(() => bodyBackground(page)).toBe('rgb(26, 29, 37)');
  await shot(page, 'appearance-dark');

  await group.getByRole('radio', { name: en('theme.light') }).check();
  await expect.poll(() => prefersDark(page)).toBe(false);
  await expect.poll(() => bodyBackground(page)).toBe('rgb(255, 255, 255)');
  await shot(page, 'appearance-light');

  await group.getByRole('radio', { name: en('theme.dark') }).check();
  // Appearance saves on change: no Save click.
  await expect(
    page.getByRole('status').filter({ hasText: en('settings.autoSaved') }),
  ).toBeVisible();
  const storedTheme = () =>
    (JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')) as { theme: string }).theme;
  await expect.poll(storedTheme).toBe('dark');
  await page.reload();
  await expect.poll(() => prefersDark(page)).toBe(true);
});

test('appearance: a picked theme stays after Settings closes, without Save (T-086)', async () => {
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ theme: 'light' }));
  const page = await launchSettings();
  await page.getByRole('tab', { name: en('settings.nav.appearance'), exact: true }).click();
  await page.getByRole('radio', { name: en('theme.dark') }).check();
  await expect.poll(() => prefersDark(page)).toBe(true);
  const electronApp = app;
  if (electronApp === null) throw new Error('no app');
  // Closed from main on a timer: a Playwright call still pending when a page closes is
  // cancelled, so the close must not happen inside the call that triggers it.
  const closed = page.waitForEvent('close');
  await electronApp.evaluate(({ BrowserWindow }) => {
    setTimeout(() => BrowserWindow.getAllWindows()[0]?.close(), 100);
  });
  await closed;
  // The choice was saved when it was picked, so closing keeps it.
  await expect
    .poll(() => electronApp.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
    .toBe('dark');
});

test('jira: Test connection sits below the form, and Save keeps its label', async () => {
  const page = await launchSettings();
  const save = page.getByRole('button', { name: en('settings.save'), exact: true });
  await expect(save).toBeVisible();
  // Test connection comes after the token field in reading order (and on screen).
  const token = page.getByLabel(en('settings.token'), { exact: true });
  const testButton = page.getByRole('button', { name: en('settings.testConnection') });
  const tokenBox = await token.boundingBox();
  const testBox = await testButton.boundingBox();
  expect(tokenBox !== null && testBox !== null && testBox.y > tokenBox.y).toBe(true);

  await connectAndSave(page, 'PROJ');
  await expect(save).toBeVisible();
  // Save may jump to Capture when another app holds the shortcuts; come back for the shot.
  await page.getByRole('tab', { name: en('settings.nav.jira') }).click();
  await shot(page, 'jira-connected');
});
