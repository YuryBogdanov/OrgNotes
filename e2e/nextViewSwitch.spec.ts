import { expect, test, type Page } from '@playwright/test';
import { diskFile as disk, openApp } from './helpers';
import { pluginsReady } from './tauriMock';
import { FILES, PLATFORM } from './kanbanFixture';

// ТЗ 49.2: the view switch of the tabs — «Оформление / Исходник / Доска»: on a file with «#+BOARD» «Доска» lit;
// «Оформление» / «Исходник» back to the text in that mode; ⌥⌘B there and back; ⌃⌘E on the board back to the text;
// a file with no «#+BOARD» — «Доска» asks for the workflow, «Отмена» the text again, the file as it was.

const P = '/mock/work/platform.org';
const sw = (page: Page) => page.getByRole('radiogroup', { name: 'Вид текста' });
const seg = (page: Page, name: string) => sw(page).getByRole('radio', { name });
async function open(page: Page, board = true) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: FILES(board), ready: false, viewport: { width: 1600, height: 900 } });
  await pluginsReady(page);
  await page.evaluate(async (p) => {
    const { store } = await import('/src/store.svelte.ts' as string);
    store.open(store.files.findIndex((f: { path: string }) => f.path === p), 0);
  }, P);
}

test('a board file: «Доска» lit, the key by it; «Оформление» / «Исходник» back to the text in that mode; ⌥⌘B and ⌃⌘E', async ({ page }) => {
  await open(page);
  await expect(page.locator('.kanban')).toBeVisible();
  await expect(sw(page).getByRole('radio')).toHaveText(['Оформление', 'Исходник', 'Доска']);
  await expect(seg(page, 'Доска')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.tabs .vk')).toHaveText('⌥⌘B');
  await seg(page, 'Исходник').click();
  await expect(page.locator('.kanban')).toHaveCount(0);
  await expect(seg(page, 'Исходник')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Alt+Meta+b');
  await expect(page.locator('.kanban')).toBeVisible();
  await expect(seg(page, 'Доска')).toHaveAttribute('aria-checked', 'true');
  // ⌃⌘E on the board: the text in the mode it had (Исходник), no switch of the mode
  await page.keyboard.press('Control+Meta+e');
  await expect(page.locator('.kanban')).toHaveCount(0);
  await expect(seg(page, 'Исходник')).toHaveAttribute('aria-checked', 'true');
  await seg(page, 'Доска').click();
  await seg(page, 'Оформление').click();
  await expect(seg(page, 'Оформление')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.kanban')).toHaveCount(0);
});

test('a file with no «#+BOARD»: «Доска» asks for the workflow; «Отмена» — the text again, the file as it was', async ({ page }) => {
  await open(page, false);
  await expect(page.locator('.cm-content')).toBeVisible();
  await seg(page, 'Доска').click();
  const setup = page.getByRole('dialog', { name: 'Показать как доску' });
  await expect(setup).toBeVisible();
  await setup.getByRole('button', { name: /Отмена/ }).click();
  await expect(page.locator('.kanban')).toHaveCount(0);
  await expect(page.locator('.cm-content')).toBeVisible();
  expect(await disk(page, P)).toBe(PLATFORM(false));
});
