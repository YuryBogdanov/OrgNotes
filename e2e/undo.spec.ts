import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { FILES, INBOX } from './inboxFixture';
import { FILES as GOALS, NOW as GOALS_NOW, PETROV } from './goalsFixture';

// Roadmap 0.1: one journal of edits, one ⌘Z — outside a text field it takes back the last edit a feature made,
// wherever it was made; in an editor an edit from outside is one step of its own.

const IB = '/mock/inbox.org';
const disk = (page: Page, p = IB) => page.evaluate((p) => (window as any).__disk[p] as string, p);
const panel = (page: Page) => page.locator('.inbox');
const rows = (page: Page) => panel(page).locator('.row');
/** Out of any text field: the focus on the page itself. */
const blur = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 800 });
  await installTauriMock(page, FILES());
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Inbox' }).click();
}

test('⌘Z anywhere outside a text field takes back the last edit, steps in order', async ({ page }) => {
  await open(page);
  await rows(page).first().getByRole('button', { name: /^Готово/ }).click();
  await expect(rows(page)).toHaveCount(3);
  await rows(page).first().getByRole('button', { name: /^Готово/ }).click();
  await expect(rows(page)).toHaveCount(2);
  const afterTwo = await disk(page);
  // not the list: the toolbar has the focus
  await blur(page);
  await page.keyboard.press('Meta+z');
  await expect(rows(page)).toHaveCount(3);
  expect(await disk(page)).not.toBe(afterTwo);
  await page.keyboard.press('Meta+z');
  await expect(rows(page)).toHaveCount(4);
  expect(await disk(page)).toBe(INBOX());
  await page.keyboard.press('Meta+z'); // nothing more: nothing happens
  expect(await disk(page)).toBe(INBOX());
});

test('a step whose file was changed since is not taken back, and says so', async ({ page }) => {
  await open(page);
  await rows(page).first().getByRole('button', { name: /^Готово/ }).click();
  await expect(rows(page)).toHaveCount(3);
  await page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Файлы' }).click();
  await page.locator('.nav .row', { hasText: 'inbox' }).first().click();
  await page.locator('.cm-content').first().click();
  await page.keyboard.press('Meta+End');
  await page.keyboard.type('\nещё строка');
  await blur(page);
  await page.keyboard.press('Meta+z');
  await expect(page.locator('section.pane.active')).toContainText('Отменить нельзя: файл уже изменился');
});

test('in the editor, an edit from outside is one step: ⌘Z there takes back only it, not the typing before', async ({ page }) => {
  await open(page);
  await page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Файлы' }).click();
  await page.locator('.nav .row', { hasText: 'inbox' }).first().click();
  const ed = page.locator('section.pane.active .cm-content');
  await ed.click();
  await page.keyboard.press('Meta+End');
  await page.keyboard.type('\nмоя строка');
  // a feature's edit to the same file (the Inbox's «Готово»), the editor still showing it
  await page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Inbox' }).click();
  await rows(page).first().getByRole('button', { name: /^Готово/ }).click();
  await expect(ed).toContainText('DONE Позвонить в банк про лимиты');
  await ed.click();
  await page.keyboard.press('Meta+z');
  await expect(ed).toContainText('TODO Позвонить в банк про лимиты');
  await expect(ed).toContainText('моя строка'); // the typing stays
});

test('⌘Z in a text field is the field\'s own', async ({ page }) => {
  await open(page);
  await rows(page).first().getByRole('button', { name: /^Готово/ }).click();
  await expect(rows(page)).toHaveCount(3);
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('abc');
  await page.keyboard.press('Meta+z');
  await expect(rows(page)).toHaveCount(3); // the journal was not touched
  await page.keyboard.press('Escape');
});

test('goals: a mark of the 1-1 review is taken back by ⌘Z too, the counter with it', async ({ page }) => {
  await page.clock.setFixedTime(GOALS_NOW);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, GOALS());
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.keyboard.press('Control+Meta+4');
  await page.getByRole('navigation', { name: 'Цели' }).getByRole('button', { name: /Обзор квартала/ }).click();
  await page.getByRole('region', { name: 'Петров Алексей' }).getByRole('button', { name: 'Разобрать цели' }).click();
  const before = await disk(page, PETROV);
  await page.keyboard.type('Кэш включили.');
  await page.keyboard.press('Meta+Enter');
  await expect.poll(() => disk(page, PETROV)).toContain('Кэш включили.');
  await blur(page);
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page, PETROV)).toBe(before);
});

test('⌘Z pressed quickly again and again takes back as many steps, in order (no step taken twice)', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 3; i++) {
    const n = 4 - i;
    await rows(page).first().getByRole('button', { name: /^Готово/ }).click();
    await expect(rows(page)).toHaveCount(n - 1);
  }
  await blur(page);
  await page.evaluate(() => ((window as any).__saveDelay = 200)); // a slow disk: the next ⌘Z comes while one is written
  // three presses without waiting for the writes
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page)).toBe(INBOX());
  await expect(rows(page)).toHaveCount(4);
  await expect(page.locator('.toast', { hasText: 'Отменить нельзя' })).toHaveCount(0);
});
