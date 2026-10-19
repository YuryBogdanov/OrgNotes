import { expect, test, type Page } from '@playwright/test';
import { diskFile as disk, openApp } from './helpers';
import { pluginsReady } from './tauriMock';
import { FILES, PLATFORM } from './kanbanFixture';

// fix-49 (ТЗ 49.2): the view switch of a file — at the file area's top right, over the text and over the board,
// icons only: «Исходник», «Доска»; on a file with «#+BOARD» «Доска» lit; ⌥⌘B there and back; nothing in the tabs'
// strip; the board's head and its card at the side keep the corner clear; a file with no other view — no switch;
// a file with no «#+BOARD» — «Доска» asks for the workflow, «Отмена» the text again, the file as it was.

const P = '/mock/work/platform.org';
const sw = (page: Page) => page.getByRole('radiogroup', { name: 'Вид файла' });
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

test('a board file: the switch at the area\'s top right — «Исходник» / «Доска» as icons, «Доска» lit; a click and ⌥⌘B switch; nothing in the tabs', async ({ page }) => {
  await open(page);
  await expect(page.locator('.kanban')).toBeVisible();
  await expect(sw(page).getByRole('radio')).toHaveCount(2);
  await expect(seg(page, 'Доска')).toHaveAttribute('aria-checked', 'true');
  await expect(seg(page, 'Доска')).toHaveAttribute('title', 'Доска ⌥⌘B');
  await expect(page.getByRole('radiogroup', { name: 'Вид текста' })).toHaveCount(0); // the tabs' strip: only the tabs
  // where: 14 down, 18 in from the area's top right
  const area = (await page.locator('.area').boundingBox())!;
  const b = (await sw(page).boundingBox())!;
  expect(Math.round(b.y - area.y)).toBe(14);
  expect(Math.round(area.x + area.width - (b.x + b.width))).toBe(18);
  // the board's head keeps the corner clear
  expect(await page.locator('.kanban .kb-head').evaluate((e) => parseFloat(getComputedStyle(e).paddingRight))).toBeGreaterThanOrEqual(140);
  await seg(page, 'Исходник').click();
  await expect(page.locator('.kanban')).toHaveCount(0);
  await expect(seg(page, 'Исходник')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.cm-content')).toBeVisible();
  // over the text with «Структура»: the column under the switch
  const col = (await page.getByRole('complementary', { name: 'Структура' }).locator('.lbl').first().boundingBox())!;
  expect(col.y).toBeGreaterThan(b.y + b.height);
  await page.locator('.cm-content').click();
  await page.keyboard.press('Alt+Meta+b');
  await expect(page.locator('.kanban')).toBeVisible();
  await expect(seg(page, 'Доска')).toHaveAttribute('aria-checked', 'true');
});

test('no other view — no switch: the board plugin off', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': '* TODO Задача\n' }, local: { 'plugins:enabled': JSON.stringify({ kanban: false }) }, ready: false, viewport: { width: 1400, height: 800 } });
  await pluginsReady(page);
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(sw(page)).toHaveCount(0);
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
