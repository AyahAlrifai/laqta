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
  page.getByLabel(t(lang, 'settings.defaultProject'), { exact: true });

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
  await projectField(page).selectOption(projectKey);
  await page.getByRole('button', { name: en('settings.saveContinue'), exact: true }).click();
  await expect(page.getByText(en('settings.saved'), { exact: true })).toBeVisible();
}

test('first run: the project select is disabled until Jira is connected', async () => {
  const page = await launchSettings();
  const select = projectField(page);
  await expect(select).toBeDisabled();
  await expect(select).toHaveValue('');
  await expect(page.getByText(en('settings.projectConnectFirst'), { exact: true })).toBeVisible();
  expect(mock.calls).toEqual([]);
});

test('test connection lists the projects; the saved choice survives a reload', async () => {
  const page = await launchSettings();
  await connect(page);
  const select = projectField(page);
  await expect(select).toBeEnabled();
  await expect(page.getByText(en('settings.projectConnectFirst'))).toHaveCount(0);
  // The mock lists PROJ and REQ after the empty placeholder option.
  await expect(select.locator('option')).toHaveCount(3);
  await expect(select.locator('option[value=""]')).toHaveText(en('editor.projectPlaceholder'));
  await expect(select.locator('option[value="PROJ"]')).toHaveCount(1);
  await expect(select.locator('option[value="REQ"]')).toHaveCount(1);

  await select.selectOption('REQ');
  await page.getByRole('button', { name: en('settings.saveContinue'), exact: true }).click();
  await expect(page.getByText(en('settings.saved'), { exact: true })).toBeVisible();
  const stored = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')) as {
    jiraBaseUrl: string;
    defaultProjectKey: string;
  };
  expect(stored).toMatchObject({ jiraBaseUrl: jiraUrl, defaultProjectKey: 'REQ' });

  // A fresh mount loads the list with the saved connection (jira:listProjects).
  await page.reload();
  await expect(projectField(page)).toBeEnabled();
  await expect(projectField(page)).toHaveValue('REQ');
  await expect(page.getByRole('button', { name: en('settings.save'), exact: true })).toBeVisible();
});

test('editing the address disconnects the field; reverting it brings the list back', async () => {
  const page = await launchSettings();
  await connectAndSave(page, 'REQ');
  const address = page.getByLabel(en('settings.jiraAddress'), { exact: true });
  const select = projectField(page);
  await expect(select).toHaveValue('REQ');

  await address.fill(`${jiraUrl}/other`);
  await expect(select).toBeDisabled();
  await expect(page.getByText(en('settings.projectConnectFirst'), { exact: true })).toBeVisible();

  // Regression: the field used to stay disconnected after typing the saved address back.
  await address.fill(jiraUrl);
  await expect(select).toBeEnabled();
  await expect(select).toHaveValue('REQ');
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
  await expect(select).toHaveValue('PROJ');
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
