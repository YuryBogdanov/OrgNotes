import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 44.9 (§11): a file's tab — its name without `.org`; the same name twice — the folder that tells them apart in
// grey; the tip — the path in the notes folder; the toolbar — the name, the path under it; narrowed — «имя › заголовок».

const A = '/mock/Команда/Безопасность/Ольга Петрова.org';
const B = '/mock/Команда/Платформа/Ольга Петрова.org';
const F = { [A]: '* 1-1\nтекст\n* Цели\n', [B]: '* 1-1\n', '/mock/inbox.org': '* X\n' };
const strip = (page: Page) => page.getByRole('tablist', { name: 'Вкладки' });
const store = (page: Page, code: string) => page.evaluate(async (c) => {
  const store = (await import('/src/store.svelte.ts' as string)).store;
  const layout = await import('/src/layout.ts' as string);
  return new Function('store', 'layout', c)(store, layout);
}, code);

test('the name, the folder telling the same names apart, no `.org` anywhere; the tip and the toolbar', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: F, ready: false, viewport: { width: 1440, height: 820 } });
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
  await store(page, `store.open(store.files.findIndex((f) => f.path === '${A}'), 0);`);
  await store(page, `for (const p of ['${B}', '/mock/inbox.org']) layout.openFile(store.layout, 0, p, 0, { replace: false });`);
  const tabs = strip(page).getByRole('tab');
  await expect(tabs.filter({ hasText: 'Ольга' })).toHaveText(['Ольга Петрова — Безопасность', 'Ольга Петрова — Платформа']);
  for (const t of await tabs.allTextContents()) expect(t).not.toContain('.org');
  const first = strip(page).getByRole('tab', { name: 'Ольга Петрова — Безопасность' });
  await expect(first).toHaveAttribute('title', 'Команда/Безопасность/Ольга Петрова.org');
  expect(await first.locator('.hint').evaluate((e) => getComputedStyle(e).color)).not.toBe(await first.locator('.nm').evaluate((e) => getComputedStyle(e).color)); // grey
  await first.click();
  await expect(page.locator('header.bar .name')).toHaveText('Ольга Петрова');
  await expect(page.locator('header.bar .path')).toContainText('Команда/Безопасность/Ольга Петрова.org');
  // one of them closed: the other is unique again
  await strip(page).getByRole('button', { name: 'Закрыть вкладку Ольга Петрова — Платформа' }).click({ force: true });
  await expect(tabs.filter({ hasText: 'Ольга' })).toHaveText(['Ольга Петрова']);
  // narrowed
  await page.locator('.cm-line', { hasText: 'текст' }).click();
  await page.keyboard.press('Control+x');
  await page.keyboard.press('n');
  await page.keyboard.press('s');
  await expect(tabs.filter({ hasText: 'Ольга' })).toHaveText('Ольга Петрова › 1-1');
});
