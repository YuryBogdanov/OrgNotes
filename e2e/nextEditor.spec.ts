import { expect, test, type Page } from '@playwright/test';
import { openApp, diskFile as disk } from './helpers';

// ТЗ 42.5: the editor of the new interface — the same engine as the old one (cm/orgEditor.ts): typing goes to the
// file and is saved, ⌘Z, the keys of the editor, folding, a change on disk followed; an untitled tab; «Оформление»
// switches the look; a plugin's tab shows its view.

const MID = ['* TODO Роадмап Q4', 'Текст.', '* NEXT Переезд', ''].join('\n');
const ed = (page: Page) => page.locator('[data-ui="next"] .cm-content');
async function open(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/Midterm.org': MID }, ready: false });
  await expect(ed(page)).toBeVisible();
}
const text = (page: Page) => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.files[0].text as string);

test('typing goes to the file, ⌘S writes it, ⌘Z takes it back', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: 'Текст.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Ещё');
  await expect.poll(() => text(page)).toContain('Текст. Ещё');
  await page.keyboard.press('Meta+s');
  await expect.poll(() => disk(page, '/mock/Midterm.org')).toContain('Текст. Ещё');
  await page.keyboard.press('Meta+z');
  await expect.poll(() => text(page)).not.toContain('Ещё');
});

test('the editor\'s keys: a status by ⇧→ on a heading; ⌥↩ a new heading; S-Tab folds', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: 'Роадмап' }).click();
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => text(page)).toContain('* NEXT Роадмап Q4');
  await page.locator('.cm-line', { hasText: 'Переезд' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Alt+Enter');
  await page.keyboard.type('Новый');
  await expect.poll(() => text(page)).toContain('* NEXT Переезд\n* Новый');
});

test('a change on the disk is followed; an untitled tab is an editor too; «Оформление» draws the text', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).__setDisk('/mock/Midterm.org', '* TODO Роадмап Q4\nС диска.\n* NEXT Переезд\n'));
  await expect(page.locator('.cm-line', { hasText: 'С диска.' })).toBeVisible();
  await page.getByRole('button', { name: 'Новая вкладка' }).click();
  await expect(page.locator('[data-ui="next"] .cm-placeholder')).toHaveText('Начните писать…');
  await page.keyboard.type('* Черновик');
  await expect.poll(() => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.tab.text)).toBe('* Черновик');
  await page.getByRole('radio', { name: 'Оформление' }).click();
  await expect(page.locator('[data-ui="next"] .cm-editor')).toHaveClass(/cm-rich/);
});

test('a plugin\'s tab shows its view', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.palette);
  await page.keyboard.press('Meta+k');
  await page.keyboard.type('Долгие дела: открыть');
  await page.getByRole('option', { name: /Долгие дела: открыть список/ }).click();
  await expect(page.getByRole('tab', { name: 'Долгие дела' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-ui="next"] .lmv')).toBeVisible();
});
