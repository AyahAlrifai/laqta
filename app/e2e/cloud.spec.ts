import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { MockJira } from '../test/mock-jira';
import { pick } from './pick';

// Spec section 8.2: the golden path against a Jira Cloud-shaped server.

test('Jira Cloud: draft, pick assignee by accountId, create, attach', async () => {
  const mock = new MockJira();
  const url = await mock.start();
  mock.config.deployment = 'cloud';
  mock.config.token = 'e2e-token';
  const app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      LAQTA_E2E: '1',
      LAQTA_E2E_JIRA_URL: url,
      LAQTA_E2E_JIRA_DEPLOYMENT: 'cloud',
      LAQTA_E2E_USER_DATA: mkdtempSync(join(tmpdir(), 'laqta-e2e-cloud-')),
    },
  });
  const windowFor = async (kind: string): Promise<Page> => {
    for (let i = 0; i < 100; i++) {
      const page = app.windows().find((w) => w.url().includes(`/${kind}/`));
      if (page) {
        await page.waitForLoadState('domcontentloaded');
        return page;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`no ${kind} window`);
  };
  try {
    await expect
      .poll(() => app.evaluate(() => typeof (globalThis as Record<string, unknown>).__laqtaE2E), {
        timeout: 20_000,
      })
      .toBe('object');
    await app.evaluate(() => {
      (
        globalThis as unknown as { __laqtaE2E: { capture: (m: string) => void } }
      ).__laqtaE2E.capture('area');
    });
    const overlay = await windowFor('overlay');
    await overlay.mouse.move(100, 120);
    await overlay.mouse.down();
    await overlay.mouse.move(400, 300, { steps: 4 });
    await overlay.mouse.up();
    await overlay.getByRole('application').focus();
    await overlay.keyboard.press('Enter').catch(() => undefined);

    const wb = await windowFor('workbench');
    const canvas = wb.getByRole('img', { name: /Screenshot/ });
    await canvas.focus();
    await wb.keyboard.press('r');
    await wb.keyboard.press('Enter');
    await wb.getByLabel('What is wrong?').fill('The total is shown twice, assign Sara');
    await pick(wb.getByRole('combobox', { name: 'Project' }), 'PROJ');
    await wb.getByRole('button', { name: 'Generate draft' }).click();
    await wb
      .getByRole('listbox', { name: 'Assignee' })
      .getByRole('option', { name: /Sara K\./ })
      .click();
    await wb.getByRole('button', { name: 'Create bug in PROJ' }).click();

    const toast = await windowFor('toast');
    await expect(toast.getByText('Bug PROJ-1001 created')).toBeVisible();
    expect(mock.issues).toHaveLength(1);
    expect(mock.issues[0]?.fields.assignee).toEqual({ id: 'acc-sara.k' });
    expect(mock.issues[0]?.attachments).toHaveLength(1);
  } finally {
    await app.close();
    await mock.stop();
  }
});
