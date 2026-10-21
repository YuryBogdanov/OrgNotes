import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';
import { FILES } from './kanbanFixture';

// fix-49-2 §2–3: no view switch over the file — the board's head full width, «Структура» from the top, ⌘F in the
// text's corner; the view chosen in «Показывать как ›» of the tab's menu and of the file's menu in the navigator: ✓ at
// the file's view, the views' keys, «Виды добавляют плагины»; a file not open is shown so when it is opened.

const P = '/mock/work/platform.org';
const I = '/mock/inbox.org';
const board = (page: Page) => page.locator('.kanban');
const tree = (page: Page) => page.getByRole('tree', { name: 'Файлы' });
const menu = (page: Page) => page.getByRole('menu');
async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { ...FILES(true), [I]: '#+BOARD: Задачи\n* TODO x\n' }, ready: false, viewport: { width: 1600, height: 900 } });
  await pluginsReady(page);
  await page.evaluate(async (p) => {
    const { store } = await import('/src/store.svelte.ts' as string);
    store.open(store.files.findIndex((f: { path: string }) => f.path === p), 0);
  }, P);
}
/** The submenu «Показывать как ›» of the menu open: its rows' texts. */
async function viewsSub(page: Page) {
  await menu(page).getByRole('menuitem', { name: /Показывать как/ }).hover();
  await expect(menu(page)).toHaveCount(2);
  return menu(page).nth(1);
}

test('no switch over the file: the board\'s head full width; the text — «Структура» from the top, ⌘F in the corner', async ({ page }) => {
  await open(page);
  await expect(board(page)).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Вид файла' })).toHaveCount(0);
  expect(await page.locator('.kanban .kb-head').evaluate((e) => getComputedStyle(e).paddingRight)).toBe('32px');
  await page.keyboard.press('Alt+Meta+b');
  await expect(board(page)).toHaveCount(0);
  const area = (await page.locator('.area').boundingBox())!;
  const col = page.getByRole('complementary', { name: 'Структура' });
  expect(await col.evaluate((e) => getComputedStyle(e).paddingTop)).toBe('46px');
  await page.locator('.cm-content').click();
  await page.keyboard.press('Meta+f');
  const find = (await page.locator('.find').boundingBox())!;
  expect(Math.round(find.y - area.y)).toBe(12);
});

test('the tab\'s menu: «Показывать как ›» — ✓ «Доска ⌥⌘B», «Текст», the note; «Текст» shows the text', async ({ page }) => {
  await open(page);
  await expect(board(page)).toBeVisible();
  await page.getByRole('tab', { name: /platform/ }).click({ button: 'right' });
  const sub = await viewsSub(page);
  await expect(sub.getByRole('menuitem')).toHaveText([/^\s*Текст\s*$/, /Доска\s*⌥⌘B/, /Презентация\s*⌥⌘P/]);
  await expect(sub.getByRole('menuitem', { name: /Доска/ }).locator('.chk svg')).toHaveCount(1);
  await expect(sub).toContainText('Виды добавляют плагины');
  await sub.getByRole('menuitem', { name: 'Текст' }).click();
  await expect(board(page)).toHaveCount(0);
  await expect(page.locator('.cm-content')).toBeVisible();
});

test('the navigator\'s menu of a file: «Показывать как ›» first; an open file switches at once, one not open opens so; none for a folder', async ({ page }) => {
  await open(page);
  await expect(board(page)).toBeVisible();
  // the open file: its tab switches at once
  const work = tree(page).getByRole('treeitem', { name: 'work' });
  if ((await work.getAttribute('aria-expanded')) !== 'true') await work.click();
  await tree(page).getByRole('treeitem', { name: 'platform' }).click({ button: 'right' });
  await expect(menu(page).getByRole('menuitem').first()).toHaveText(/^\s*Показывать как/);
  await (await viewsSub(page)).getByRole('menuitem', { name: 'Текст' }).click();
  await expect(board(page)).toHaveCount(0);
  // a file not open (its «#+BOARD» would make it a board): text when it is opened, and no tab opened by the choice
  const tabs = await page.getByRole('tab').count();
  await tree(page).getByRole('treeitem', { name: 'inbox' }).click({ button: 'right' });
  await (await viewsSub(page)).getByRole('menuitem', { name: 'Текст' }).click();
  expect(await page.getByRole('tab').count()).toBe(tabs);
  await tree(page).getByRole('treeitem', { name: 'inbox' }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(board(page)).toHaveCount(0);
  // back to a board from the navigator: ✓ moves
  await tree(page).getByRole('treeitem', { name: 'inbox' }).click({ button: 'right' });
  const sub = await viewsSub(page);
  await expect(sub.getByRole('menuitem', { name: 'Текст' }).locator('.chk svg')).toHaveCount(1);
  await sub.getByRole('menuitem', { name: /Доска/ }).click();
  await expect(board(page)).toBeVisible();
  // a folder has no views
  await tree(page).getByRole('treeitem', { name: 'work' }).click({ button: 'right' });
  await expect(menu(page).getByRole('menuitem', { name: /Показывать как/ })).toHaveCount(0);
});

// §4: the navigator's icon of a file is its view's — the board's for a board, the leaf for the text — the same as its
// tab's; drawn in a box of 20 with a line of 1.75; the board plugin off — the leaf
test('the navigator\'s icon: the view\'s for a board, the same as the tab\'s; the leaf for the text', async ({ page }) => {
  await open(page);
  await expect(board(page)).toBeVisible();
  const work = tree(page).getByRole('treeitem', { name: 'work' });
  if ((await work.getAttribute('aria-expanded')) !== 'true') await work.click();
  const ic = (name: string) => tree(page).getByRole('treeitem', { name }).locator('svg.ic');
  await expect(ic('platform')).toHaveAttribute('data-view', 'kanban.board');
  await expect(ic('platform')).toHaveAttribute('viewBox', '0 0 20 20');
  await expect(ic('platform')).toHaveAttribute('stroke-width', '1.75');
  const tabPath = await page.getByRole('tab', { name: /platform/ }).locator('svg.ic path').getAttribute('d');
  expect(await ic('platform').locator('path').getAttribute('d')).toBe(tabPath);
  await expect(ic('inbox')).toHaveAttribute('data-view', 'kanban.board'); // «#+BOARD», not open
  await page.keyboard.press('Alt+Meta+b');
  await expect(board(page)).toHaveCount(0);
  await expect(ic('platform')).not.toHaveAttribute('data-view', /./);
  await expect(ic('platform')).toHaveAttribute('viewBox', '0 0 16 16');
  await expect(ic('work')).toHaveAttribute('viewBox', '0 0 16 16'); // a folder
});

test('the board plugin off: the leaf, whatever the file was shown as', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { ...FILES(true) }, local: { 'plugins:enabled': JSON.stringify({ kanban: false }), 'fileView:/mock': JSON.stringify({ 'inbox.org': 'kanban.board' }) }, ready: false, viewport: { width: 1600, height: 900 } });
  await pluginsReady(page);
  const ic = tree(page).getByRole('treeitem', { name: 'inbox' }).locator('svg.ic');
  await expect(ic).toHaveAttribute('viewBox', '0 0 16 16');
  await expect(ic).not.toHaveAttribute('data-view', /./);
});
