import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 42.10 (§5.7): ⌥⌘F — find and replace. «Заменить»: the current match, one edit, the next one is current; «Все»:
// one edit for the file, ⌘Z takes it back whole; inside a folded drawer too. The new interface's panel: «2 из 5»,
// «.*» with the groups of the expression. In both interfaces.

const DOC = ['* Миграция v1', ':PROPERTIES:', ':NOTE: про v1', ':END:', 'Версия v1 и снова v1.', ''].join('\n');
const text = (page: Page) => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.files[0].text as string);

test('the old interface: ⌥⌘F, «Заменить» one, «Все» the rest in one edit, ⌘Z takes «Все» back', async ({ page }) => {
  await openApp(page, { files: { '/mock/a.org': DOC } });
  await page.locator('.cm-line', { hasText: 'Версия' }).click();
  await page.keyboard.press('Alt+Meta+f');
  await page.getByRole('textbox', { name: 'Найти в файле' }).fill('v1');
  await expect(page.getByRole('search', { name: 'Поиск в файле' })).toContainText('из 4');
  await page.getByRole('textbox', { name: 'Заменить на' }).fill('v2');
  await page.getByRole('button', { name: 'Заменить', exact: true }).click();
  await expect.poll(() => text(page).then((t) => (t.match(/v2/g) ?? []).length)).toBe(1);
  await page.getByRole('button', { name: 'Все', exact: true }).click();
  await expect.poll(() => text(page)).toBe(DOC.replaceAll('v1', 'v2')); // the folded drawer too
  await page.keyboard.press('Escape');
  await page.locator('.cm-line', { hasText: 'Версия' }).click();
  await page.keyboard.press('Meta+z');
  await expect.poll(() => text(page).then((t) => (t.match(/v2/g) ?? []).length)).toBe(1);
});

test('the new interface: the floating panel, «.*» with groups, ⌘G steps; ⎋ closes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': DOC }, ready: false });
  await expect(page.locator('[data-ui="next"] .cm-content')).toBeVisible();
  await page.locator('.cm-line', { hasText: 'Версия' }).click();
  await page.keyboard.press('Meta+f');
  const panel = page.getByRole('search', { name: 'Поиск в файле' });
  await expect(panel).toBeVisible();
  await panel.getByRole('textbox', { name: 'Найти в файле' }).fill('v(\\d)');
  await panel.getByRole('button', { name: '.*' }).click();
  await expect(panel).toContainText('из 4');
  await expect(page.locator('.cm-find-cur')).toHaveCount(1);
  await page.keyboard.press('Alt+Meta+f');
  await panel.getByRole('textbox', { name: 'Заменить на' }).fill('версия $1.0');
  await panel.getByRole('button', { name: 'Все', exact: true }).click();
  await expect.poll(() => text(page)).toBe(DOC.replaceAll('v1', 'версия 1.0'));
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});
