import type { Locator } from '@playwright/test';

/** The attribute that holds a dropdown's value (shared/Select.tsx), for assertions. */
export const valueOf = 'data-value';

/**
 * Chooses an option in one of Laqta's dropdowns: open it, then click the option whose label
 * starts with `key`. Replaces Playwright's selectOption, which only drives native <select>.
 */
export async function pick(field: Locator, key: string): Promise<void> {
  await field.click();
  const listId = await field.getAttribute('aria-controls');
  if (listId === null) throw new Error('dropdown has no aria-controls');
  // useId() ids contain colons, so match the attribute rather than a #id selector.
  const list = field.page().locator(`[id="${listId}"]`);
  await list.getByRole('option', { name: new RegExp(`^\\W*${key}\\b`) }).click();
}
