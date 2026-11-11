import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { MockJira } from '../test/mock-jira';
import { pick } from './pick';

// Spec section 12, end to end: golden path, partial failure and unknown-result verify, with
// the fake draft provider (LAQTA_E2E=1) and the mock Jira server.

const mock = new MockJira();
let jiraUrl = '';
let app: ElectronApplication;
let userData = '';

test.beforeAll(async () => {
  jiraUrl = await mock.start();
});
test.afterAll(async () => {
  await mock.stop();
});

test.beforeEach(async () => {
  mock.reset();
  mock.config.token = 'e2e-token';
  app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      LAQTA_E2E: '1',
      LAQTA_E2E_JIRA_URL: jiraUrl,
      LAQTA_E2E_USER_DATA: (userData = mkdtempSync(join(tmpdir(), 'laqta-e2e-'))),
    },
  });
});

test.afterEach(async () => {
  await app.close();
});

/** Set LAQTA_SHOTS=<dir> to save a screenshot of each step for a visual check. */
async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.LAQTA_SHOTS;
  if (dir !== undefined) await page.screenshot({ path: join(dir, `${name}.png`) });
}

async function windowFor(kind: string): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    const page = app.windows().find((w) => w.url().includes(`/${kind}/`));
    if (page) {
      await page.waitForLoadState('domcontentloaded');
      return page;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no ${kind} window`);
}

/** Capture an area and open the workbench; optionally blur one area with the keyboard. */
async function captureToEditor(blur: boolean): Promise<Page> {
  await expect
    .poll(() => app.evaluate(() => typeof (globalThis as Record<string, unknown>).__laqtaE2E), {
      timeout: 20_000,
    })
    .toBe('object');
  await app.evaluate(() => {
    (globalThis as unknown as { __laqtaE2E: { capture: (m: string) => void } }).__laqtaE2E.capture(
      'area',
    );
  });
  const overlay = await windowFor('overlay');
  await expect(overlay.getByRole('status')).toBeVisible();
  // Drag a selection on the frozen frame, then press Enter (board 1).
  await overlay.mouse.move(100, 120);
  await overlay.mouse.down();
  await overlay.mouse.move(420, 300, { steps: 5 });
  await overlay.mouse.up();
  await expect(overlay.getByText(/\d+ × \d+/)).toBeVisible();
  await shot(overlay, '1-overlay');
  await overlay.getByRole('application').focus();
  // Enter completes the capture and the overlay closes immediately.
  await overlay.keyboard.press('Enter').catch(() => undefined);

  const wb = await windowFor('workbench');
  const canvas = wb.getByRole('img', { name: /Screenshot/ });
  await expect(canvas).toBeVisible();
  // Redact an area with the keyboard: R selects Blur, Enter on the canvas adds a centred one.
  if (blur) {
    await canvas.focus();
    await wb.keyboard.press('r');
    await wb.keyboard.press('Enter');
    await expect(wb.getByRole('button', { name: 'Blur (1)' })).toBeVisible();
  }
  return wb;
}

async function captureAndAsk(prompt: string): Promise<Page> {
  const wb = await captureToEditor(true);
  await wb.getByLabel('What is wrong?').fill(prompt);
  await pick(wb.getByRole('combobox', { name: 'Project' }), 'PROJ');
  await shot(wb, '2-editor');
  await wb.getByRole('button', { name: 'Generate draft' }).click();
  await expect(wb.getByRole('heading', { name: 'Review the draft' })).toBeVisible();
  return wb;
}

test('golden path: capture, annotate, redact, draft, review, pick assignee, create, attach, toast', async () => {
  const wb = await captureAndAsk('The total is shown twice, assign Sara');
  // Two Saras: the assignee list opens with nothing chosen and Create stays disabled.
  const assignee = wb.getByRole('combobox', { name: 'Assignee' });
  const options = wb.getByRole('listbox', { name: 'Assignee' });
  await expect(
    wb.getByText('More than one person matches “Sara”. Pick one to continue.'),
  ).toBeVisible();
  await expect(options.getByRole('option')).toHaveCount(3); // two Saras + Leave unassigned
  await expect(wb.getByRole('button', { name: 'Create bug in PROJ' })).toBeDisabled();
  await shot(wb, '4-picker');
  await options.getByRole('option', { name: /Sara H\./ }).click();
  await expect(assignee).toHaveValue('Sara H.');
  await expect(options).toBeHidden();
  // Labels: comma, space and Enter each finish one; invalid text is explained, not kept.
  const labels = wb.getByLabel('Labels', { exact: true });
  await labels.fill('Checkout, ui-bug ');
  await labels.pressSequentially('فاتورة');
  await labels.press('Enter');
  await expect(wb.getByText('“فاتورة” can’t be a label.', { exact: false })).toBeVisible();
  await labels.pressSequentially('slow');
  await labels.press('Enter');
  await wb.getByRole('button', { name: 'Remove label ui-bug' }).click();
  await expect(wb.getByRole('button', { name: /^Remove label / })).toHaveCount(3);
  await shot(wb, '3-review');
  expect(mock.createCalls).toBe(0); // nothing written before the click
  await wb.getByRole('button', { name: 'Create bug in PROJ' }).click();

  const toast = await windowFor('toast');
  await expect(toast.getByText('Bug PROJ-1001 created')).toBeVisible();
  await shot(toast, '5-toast');
  expect(mock.issues).toHaveLength(1);
  const issue = mock.issues[0];
  expect(issue?.fields.assignee).toEqual({ name: 'sara.h' });
  const sent = issue?.fields.labels as string[];
  expect(sent[0]).toBe('laqta');
  expect(sent.slice(2)).toEqual(['billing', 'checkout', 'slow']);
  expect(issue?.attachments).toHaveLength(1);
  expect(String(issue?.fields.description)).toContain('h3. Environment');
  // The window fits the card: only the card's own padding is left under the buttons.
  await expect
    .poll(async () => {
      const box = await toast.getByRole('button', { name: 'Open in Jira' }).boundingBox();
      const inner = await toast.evaluate<number>('window.innerHeight');
      return inner - (box ? box.y + box.height : 0);
    })
    .toBeLessThanOrEqual(32);
  // Left alone, the result closes itself.
  await toast.waitForEvent('close', { timeout: 15_000 });
});

test('partial failure: attachment fails, Retry upload only uploads the image', async () => {
  mock.config.attachFailures = -1;
  const wb = await captureAndAsk('The total is shown twice');
  await wb.getByRole('button', { name: 'Create bug in PROJ' }).click();
  const toast = await windowFor('toast');
  await expect(toast.getByText('Bug created, screenshot not uploaded')).toBeVisible();
  await shot(toast, '6-partial');
  expect(mock.issues).toHaveLength(1);
  mock.config.attachFailures = 0;
  await toast.getByRole('button', { name: 'Retry upload' }).click();
  await expect(toast.getByText('Bug PROJ-1001 created')).toBeVisible();
  expect(mock.createCalls).toBe(1);
  expect(mock.issues[0]?.attachments).toHaveLength(1);
});

test('unknown result: the request label is found and exactly one bug exists', async () => {
  mock.config.createFailure = 'reset-after-create';
  const wb = await captureAndAsk('The total is shown twice');
  await wb.getByRole('button', { name: 'Create bug in PROJ' }).click();
  const toast = await windowFor('toast');
  await expect(toast.getByText('Bug PROJ-1001 created')).toBeVisible({ timeout: 30_000 });
  expect(mock.createCalls).toBe(1);
  expect(mock.issues).toHaveLength(1);
});

test('no-blur confirm: asks by default, and "Don’t ask me again" is saved', async () => {
  const wb = await captureToEditor(false);
  await wb.getByLabel('What is wrong?').fill('The total is shown twice');
  await pick(wb.getByRole('combobox', { name: 'Project' }), 'PROJ');
  await wb.getByRole('button', { name: 'Generate draft' }).click();
  // Spec section 5: nothing leaves the machine before the user answers.
  const confirm = wb.getByRole('alertdialog');
  await expect(
    confirm.getByRole('heading', { name: 'Send without blurring anything?' }),
  ).toBeVisible();
  await confirm.getByLabel('Don’t ask me again').check();
  await confirm.getByRole('button', { name: 'Send as is' }).click();
  await expect(wb.getByRole('heading', { name: 'Review the draft' })).toBeVisible();
  await expect
    .poll(
      () =>
        (
          JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')) as {
            confirmNoBlur: boolean;
          }
        ).confirmNoBlur,
    )
    .toBe(false);
  // End the session so the app can close (an open draft asks before closing).
  await wb.getByRole('button', { name: 'Close' }).click();
  await wb.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click();
});

test('text tool: click on the image, type, and Enter adds the label', async () => {
  const wb = await captureToEditor(false);
  await wb.getByRole('button', { name: 'Text', exact: true }).click();
  const canvas = wb.getByRole('img', { name: /Screenshot/ });
  // A real mouse click: the bug was the mousedown stealing focus back from the editor.
  await canvas.click({ position: { x: 60, y: 40 } });
  const label = wb.getByLabel('Label text');
  await expect(label).toBeFocused();
  await wb.keyboard.type('Wrong total');
  await expect(label).toHaveValue('Wrong total');
  await wb.keyboard.press('Enter');
  await expect(wb.getByRole('img', { name: /1 text labels/ })).toBeVisible();
  await wb.getByRole('button', { name: 'Close' }).click();
  await wb.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click();
});
