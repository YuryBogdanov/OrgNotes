import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// ТЗ 02 (and its fix): the tree folded by default, the path to the current file opened, «Свернуть всё» /
// «Развернуть всё», ⌥ on a whole subtree, the state kept per notes folder.

const FILES = () => ({
  '/mock/Работа/2026/work.org': '* Цели\n** Q4\n*** Бюджет\nтекст\n* Идеи\n',
  '/mock/Работа/plan.org': '* План\n',
  '/mock/Личное/Дом/ремонт.org': '* Ремонт\n',
  '/mock/inbox.org': '* Задача\n',
});
const rows = (page: Page) => page.locator('.nav .row .label').allInnerTexts();
const row = (page: Page, key: string) => page.locator(`.nav .row[data-key="${key}"]`);
const collapse = (page: Page) => page.getByRole('button', { name: 'Свернуть всё' });
const expand = (page: Page) => page.getByRole('button', { name: 'Развернуть всё' });

async function open(page: Page, files: Record<string, string> = FILES(), init?: () => void) {
  await installTauriMock(page, files);
  if (init) await page.addInitScript(init);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
}
/** ⇧⌘O and a name: the current file changes not through the tree. */
async function goto(page: Page, name: string) {
  await page.keyboard.press('Shift+Meta+o');
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText(name);
}

test('a new notes folder: folded; changing the file opens the path to it and keeps what was open', async ({ page }) => {
  await open(page);
  await goto(page, 'inbox');
  expect(await rows(page)).toEqual(['Личное', 'Работа', 'inbox']);
  await goto(page, 'work');
  expect(await rows(page)).toEqual(['Личное', 'Работа', '2026', 'work', 'plan', 'inbox']);
  await expect(row(page, '/mock/Работа/2026/work.org')).toHaveClass(/sel/);
  await goto(page, 'ремонт');
  expect(await rows(page)).toEqual(['Личное', 'Дом', 'ремонт', 'Работа', '2026', 'work', 'plan', 'inbox']); // nothing folded
});

test('the line over the tree: only in «Файлы»; «Свернуть всё» keeps the path, «Развернуть всё» opens all; off when nothing to do', async ({ page }) => {
  await open(page);
  await goto(page, 'work');
  await expect(collapse(page)).toBeDisabled(); // only the path is open
  await expect(expand(page)).toBeEnabled();
  await expect(collapse(page)).toHaveAttribute('title', 'Свернуть всё');
  await expand(page).click();
  expect(await rows(page)).toEqual(['Личное', 'Дом', 'ремонт', 'Работа', '2026', 'work', 'plan', 'inbox']);
  await expect(expand(page)).toBeDisabled();
  await expect(collapse(page)).toBeEnabled();
  await collapse(page).click();
  expect(await rows(page)).toEqual(['Личное', 'Работа', '2026', 'work', 'plan', 'inbox']);
  await expect(collapse(page)).toBeDisabled();
  // a hand-opened folder makes «Свернуть всё» useful again
  await row(page, 'Личное/').locator('.chev').click();
  await expect(collapse(page)).toBeEnabled();
  await page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Inbox' }).click();
  await expect(collapse(page)).toHaveCount(0);
});

test('the state is kept for the notes folder after a restart', async ({ page }) => {
  await open(page);
  await goto(page, 'inbox');
  await row(page, 'Личное/').locator('.chev').click();
  expect(await rows(page)).toEqual(['Личное', 'Дом', 'Работа', 'inbox']);
  await page.reload();
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await expect.poll(() => rows(page)).toEqual(['Личное', 'Дом', 'Работа', 'inbox']);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('nav:open:/mock') ?? '[]'));
  expect(kept).toContain('Личное/');
});

test('⌥-click on a chevron and ⌥→ / ⌥← act on the whole subtree', async ({ page }) => {
  await open(page);
  await goto(page, 'inbox');
  await row(page, 'Работа/').locator('.chev').click({ modifiers: ['Alt'] });
  expect(await rows(page)).toEqual(['Личное', 'Работа', '2026', 'work', 'plan', 'inbox']);
  await row(page, 'Работа/').locator('.chev').click({ modifiers: ['Alt'] });
  expect(await rows(page)).toEqual(['Личное', 'Работа', 'inbox']);
  await row(page, 'Личное/').locator('.label').click(); // opens Личное, the keyboard in the tree
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Alt+ArrowRight');
  expect(await rows(page)).toEqual(['Личное', 'Дом', 'ремонт', 'Работа', 'inbox']);
  await page.keyboard.press('Alt+ArrowLeft');
  expect(await rows(page)).toEqual(['Личное', 'Работа', 'inbox']);
  await page.keyboard.press('ArrowRight'); // Дом stays folded: ⌥← folded it too
  expect(await rows(page)).toEqual(['Личное', 'Дом', 'Работа', 'inbox']);
});

test('with headings shown: the path opens down to the current heading; «Развернуть всё» opens headings too', async ({ page }) => {
  await open(page, FILES(), () => localStorage.setItem('nav:headings', '1'));
  await goto(page, 'work');
  await page.locator('.cm-line', { hasText: 'Бюджет' }).click();
  // inbox.org, current at the start, stays open: nothing is folded by itself
  await expect.poll(() => rows(page)).toEqual(['Личное', 'Работа', '2026', 'work', 'Цели', 'Q4', 'Бюджет', 'Идеи', 'plan', 'inbox', 'Задача']);
  await collapse(page).click();
  expect(await rows(page)).toEqual(['Личное', 'Работа', '2026', 'work', 'Цели', 'Q4', 'Бюджет', 'Идеи', 'plan', 'inbox']);
  await expect(collapse(page)).toBeDisabled();
  await row(page, '/mock/Работа/2026/work.org#Цели').locator('.chev').click();
  expect(await rows(page)).toEqual(['Личное', 'Работа', '2026', 'work', 'Цели', 'Идеи', 'plan', 'inbox']);
  await expand(page).click();
  expect(await rows(page)).toEqual(['Личное', 'Дом', 'ремонт', 'Ремонт', 'Работа', '2026', 'work', 'Цели', 'Q4', 'Бюджет', 'Идеи', 'plan', 'План', 'inbox', 'Задача']); // ремонт.org: one heading, nothing under it
});

test('over 2000 nodes «Развернуть всё» leaves headings closed and says so', async ({ page }) => {
  const big = Array.from({ length: 1100 }, (_, i) => `* Раздел ${i}\n** Пункт ${i}\n`).join('');
  await open(page, { ...FILES(), '/mock/Большой/big.org': big }, () => localStorage.setItem('nav:headings', '1'));
  await goto(page, 'inbox');
  await expand(page).click();
  await expect(row(page, '/mock/Большой/big.org')).toHaveAttribute('aria-expanded', 'true');
  await expect(row(page, '/mock/Большой/big.org#Раздел 0')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.nav .capped')).toHaveText('Заголовки не раскрыты: их слишком много');
  await expect(expand(page)).toBeDisabled();
  await collapse(page).click();
  await expect(page.locator('.nav .capped')).toHaveCount(0);
});

test('the palette has «Навигатор: свернуть всё / развернуть всё», from any mode of the navigator', async ({ page }) => {
  await open(page);
  await goto(page, 'inbox');
  await page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Inbox' }).click();
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('развернуть всё');
  await page.keyboard.press('Enter');
  await expect(expand(page)).toBeDisabled();
  expect(await rows(page)).toEqual(['Личное', 'Дом', 'ремонт', 'Работа', '2026', 'work', 'plan', 'inbox']);
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('свернуть всё');
  await page.keyboard.press('Enter');
  expect(await rows(page)).toEqual(['Личное', 'Работа', 'inbox']);
});
