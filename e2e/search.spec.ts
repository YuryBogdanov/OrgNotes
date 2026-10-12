import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { FILES, WORK } from './searchFixture';

// ТЗ «Поиск в файле (⌘F) и по всем файлам (⇧⌘F)».
const W = '/mock/work.org';
const disk = (page: Page, p = W) => page.evaluate((p) => (window as any).__disk[p] as string, p);
const pane = (page: Page) => page.locator('section.pane.active');
const bar = (page: Page) => pane(page).getByRole('search', { name: 'Поиск в файле' });
const field = (page: Page) => bar(page).getByRole('textbox', { name: 'Найти в файле' });
const count = (page: Page) => bar(page).locator('.cnt');
const line = (page: Page, t: string) => pane(page).locator('.cm-line', { hasText: t }).first();
const panel = (page: Page) => page.locator('.search');

async function open(page: Page, files: Record<string, string> = FILES(), init?: () => void) {
  await page.setViewportSize({ width: 1440, height: 900 });
  if (init) await page.addInitScript(init);
  await installTauriMock(page, files);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.locator('.nav .row[data-key="/mock/work.org"]').click();
  await expect(line(page, 'Работа')).toBeVisible();
}

test.describe('in a file (⌘F)', () => {
  test('opens with the focus in the field, the selection as the query; as you type: «K из N», case and «ё» folded; ⎋ closes, the caret stays', async ({ page }) => {
    await open(page);
    await line(page, 'Свести заявки').click();
    await page.keyboard.press('Home');
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight'); // «Свести»
    await page.keyboard.press('Meta+f');
    await expect(field(page)).toBeFocused();
    await expect(field(page)).toHaveValue('Свести');
    await expect(count(page)).toHaveText('1 из 1');
    await field(page).fill('бюджет');
    await expect(count(page)).toHaveText(/из 7$/);
    await expect(pane(page).locator('.cm-find')).not.toHaveCount(0);
    await expect(pane(page).locator('.cm-find-cur')).toHaveCount(1);
    await field(page).fill('елку');
    await expect(count(page)).toHaveText('1 из 1'); // «ё» = «е»
    await field(page).fill('нет такого');
    await expect(count(page)).toHaveText('Не найдено');
    await expect(bar(page).locator('.fld')).toHaveClass(/none/);
    await field(page).fill('Бюджет');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(bar(page)).toHaveCount(0);
    await expect(pane(page).locator('.cm-find')).toHaveCount(0);
    await expect(pane(page).locator('.cm-content')).toBeFocused();
    await page.keyboard.type('X'); // replaces the selected match: the caret was on it
    await expect.poll(() => disk(page)).not.toBe(WORK);
  });

  test('↩ / ⇧↩ and ⌘G / ⇧⌘G go round; ⌘G works with the bar closed; «Aa» and «Слово»; ticks on the scroll bar', async ({ page }) => {
    await open(page);
    await pane(page).locator('.cm-content').click();
    await page.keyboard.press('Meta+f');
    await page.keyboard.type('бюджет');
    await expect(count(page)).toHaveText(/1 из 7/);
    await page.keyboard.press('Enter');
    await expect(count(page)).toHaveText('2 из 7');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.press('Shift+Enter');
    await expect(count(page)).toHaveText(/с начала|7 из 7/); // round the start
    await page.keyboard.press('Meta+g');
    await expect(count(page)).toHaveText(/с начала|1 из 7/);
    await expect(pane(page).locator('.cm-find-ticks span')).toHaveCount(7);
    await bar(page).getByRole('button', { name: 'Aa' }).click();
    await expect(count(page)).toHaveText(/из 5$/);
    await bar(page).getByRole('button', { name: 'Слово' }).click();
    await expect(count(page)).toHaveText(/из 5$/); // «бюджет» alone, lower case
    expect(await page.evaluate(() => [localStorage.getItem('find:cs'), localStorage.getItem('find:word')])).toEqual(['1', '1']);
    await bar(page).getByRole('button', { name: 'Aa' }).click();
    await bar(page).getByRole('button', { name: 'Слово' }).click();
    await bar(page).getByRole('button', { name: /Готово/ }).click();
    await page.keyboard.press('Meta+g'); // the bar closed: the next match by the last query
    await expect(pane(page).locator('.cm-selectionBackground, .cm-line')).not.toHaveCount(0);
    await expect(bar(page)).toHaveCount(0);
  });

  test('matches in folded headings and drawers: counted, a badge, a note; going to one opens it', async ({ page }) => {
    await open(page);
    await line(page, 'Q4 2026').click();
    await page.keyboard.press('Tab'); // fold «Q4 2026»
    await expect(line(page, 'Свести заявки')).toHaveCount(0);
    await page.keyboard.press('ArrowDown'); // to «Найм»
    await page.keyboard.press('Meta+f');
    await page.keyboard.type('бюджет');
    await expect(count(page)).toHaveText(/из 7$/);
    await expect(line(page, 'Q4 2026').locator('.cm-find-folded')).toHaveText('5 в свёрнутом');
    await expect(bar(page).locator('.note')).toHaveText('и 5 в свёрнутых заголовках');
    for (let i = 0; i < 3; i++) await page.keyboard.press('Enter'); // round to the folded ones
    await expect(line(page, 'Свести заявки')).toBeVisible();
  });

  test('⌘E takes the selection as the query; the bar stays with its pane across tabs', async ({ page }) => {
    await open(page);
    await line(page, 'Кандидаты').click();
    await page.keyboard.press('Home');
    for (let i = 0; i < 9; i++) await page.keyboard.press('Shift+ArrowRight'); // «Кандидаты»
    await page.keyboard.press('Meta+e');
    await page.keyboard.press('Meta+f');
    await expect(field(page)).toHaveValue('Кандидаты');
    await expect(count(page)).toHaveText('1 из 1');
    await page.locator('.nav .row[data-key="/mock/journal.org"]').click();
    await expect(bar(page)).toBeVisible();
    await expect(count(page)).toHaveText('Не найдено');
  });
});

test.describe('in every file (⇧⌘F)', () => {
  test('⇧⌘F: «Поиск» with the focus; ↩ runs; the results by file, the open one first, with the heading path, the line and the piece', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Shift+Meta+f');
    await expect(panel(page).getByRole('textbox')).toBeFocused();
    await expect(page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Поиск по заметкам' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.type('бюджет');
    await expect(panel(page).locator('.enter')).toHaveText('↩ искать');
    await page.keyboard.press('Enter');
    await expect(panel(page).locator('.sum')).toContainText('10 совпадений в 2 файлах');
    expect(await panel(page).locator('.file .fn').allInnerTexts()).toEqual(['work', 'finance']); // the open file first
    await expect(panel(page).locator('.file .fp')).toHaveText(['корень', 'Работа']);
    const first = panel(page).locator('.hit').first();
    await expect(first.locator('.wp')).toHaveText('Q4 2026');
    await expect(first.locator('.ln')).toHaveText('стр. 3');
    await expect(first.locator('.kw')).toHaveText('TODO');
    await expect(first.locator('mark')).toHaveText('бюджет');
    await expect(panel(page).locator('.more')).toHaveText('Ещё 3');
    await panel(page).locator('.more').click();
    await expect(panel(page).locator('.file').first().locator('xpath=following-sibling::div[contains(@class,"hit")]')).toHaveCount(10);
  });

  test('«Заголовки» / «Текст», «Aa», «Слово» change what is found', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Shift+Meta+f');
    await page.keyboard.type('бюджет');
    await panel(page).getByRole('button', { name: 'Заголовки' }).click();
    await panel(page).getByRole('textbox').press('Enter');
    await expect(panel(page).locator('.sum')).toContainText('4 совпадения в 2 файлах');
    await panel(page).getByRole('button', { name: 'Текст' }).click();
    await panel(page).getByRole('textbox').press('Enter');
    await expect(panel(page).locator('.sum')).toContainText('6 совпадений в 2 файлах');
    await panel(page).getByRole('button', { name: 'Везде' }).click();
    await panel(page).getByRole('button', { name: 'Слово' }).click();
    await panel(page).getByRole('textbox').press('Enter');
    await expect(panel(page).locator('.sum')).toContainText('7 совпадений в 2 файлах'); // «Бюджетный», «бюджету» left out
    await panel(page).getByRole('textbox').fill('нет такого');
    await panel(page).getByRole('textbox').press('Enter');
    await expect(panel(page).locator('.sum')).toContainText('Ничего не найдено');
    await expect(panel(page).locator('.nothing')).toContainText('Проверьте «Aa»');
  });

  test('a result opens its file at the match with the pane’s bar «из глобального поиска»; ↓ ↩ from the keyboard; ⌥⌘G goes from file to file', async ({ page }) => {
    await open(page);
    await page.locator('.nav .row[data-key="/mock/journal.org"]').click();
    await page.keyboard.press('Shift+Meta+f');
    await page.keyboard.type('бюджет');
    await page.keyboard.press('Enter');
    await panel(page).locator('.file', { hasText: 'finance' }).locator('xpath=following-sibling::div[contains(@class,"hit")][3]').click();
    await expect(page.locator('section.pane.active .tab.on')).toContainText('finance');
    await expect(bar(page).locator('.note')).toHaveText('из глобального поиска');
    await expect(field(page)).toHaveValue('бюджет');
    await expect(pane(page).locator('.cm-find-cur')).toHaveText('бюджет');
    await expect(pane(page).locator('.cm-activeLine')).toContainText('Итоги по бюджету');
    await page.keyboard.press('Alt+Meta+g'); // the next result: the next file
    await expect(page.locator('section.pane.active .tab.on')).toContainText('work');
    await panel(page).getByRole('textbox').focus();
    await page.keyboard.press('ArrowDown');
    await expect(panel(page).locator('.hit.sel')).toHaveCount(1);
    await page.keyboard.press('ArrowLeft'); // fold its group
    await expect(panel(page).locator('.file').first().locator('.chev')).not.toHaveClass(/open/);
  });

  test('recent queries when nothing was searched: a click runs one; changed files are marked', async ({ page }) => {
    await open(page, FILES(), () => localStorage.setItem('search:recent', JSON.stringify([{ q: 'заявки', t: Date.now() - 120000 }, { q: 'бюджет', t: Date.now() - 3 * 3600000 }])));
    await page.keyboard.press('Shift+Meta+f');
    await expect(panel(page).locator('.rh')).toHaveText('НЕДАВНИЕ ЗАПРОСЫ');
    await expect(panel(page).locator('.rq .rt')).toHaveText(['заявки', 'бюджет']);
    await expect(panel(page).locator('.rq .ra')).toHaveText(['2 мин', '3 ч']);
    await panel(page).locator('.rq', { hasText: 'заявки' }).click();
    await expect(panel(page).locator('.sum')).toContainText('2 совпадения в 1 файле');
    await page.evaluate((p) => (window as any).__setDisk(p, (window as any).__disk[p] + 'новые заявки\n'), W);
    await expect(panel(page).locator('.file .fp')).toHaveText('изменён — ↩ обновить');
  });
});

test('a big folder does not freeze the window: 400 files, ~10 MB', async ({ page }) => {
  const files: Record<string, string> = { '/mock/work.org': WORK };
  const body = Array.from({ length: 600 }, (_, i) => `** TODO Задача ${i}\nтекст строки ${i} про план и бюджет\n`).join('');
  for (let i = 0; i < 400; i++) files[`/mock/f${i}.org`] = `* Файл ${i}\n${body}`;
  await open(page, files);
  await page.keyboard.press('Shift+Meta+f');
  await page.keyboard.type('бюджет');
  const t0 = Date.now();
  await page.keyboard.press('Enter');
  await expect(panel(page).locator('.sum')).toContainText('показаны первые 1000', { timeout: 10000 });
  expect(Date.now() - t0).toBeLessThan(4000);
});

test('«Оформленный текст»: going to a match inside a drawn element shows its line’s real text', async ({ page }) => {
  const { FILES: RICH } = await import('./richFixture');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('editor:rich', '1'));
  await installTauriMock(page, RICH());
  await page.goto('/');
  await page.locator('.nav .row[data-key="/mock/work.org"]').click();
  await expect(pane(page).locator('.cm-r-chip.dead').first()).toBeVisible();
  await page.keyboard.press('Meta+f');
  await page.keyboard.type('DEADLINE');
  await page.keyboard.press('Enter');
  await expect(pane(page).locator('.cm-line', { hasText: 'DEADLINE: <' })).toHaveCount(1);
});

test('⇧⌘F takes the editor’s one-line selection into the field without searching yet', async ({ page }) => {
  await open(page);
  await line(page, 'Кандидаты').click();
  await page.keyboard.press('Home');
  for (let i = 0; i < 9; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+Meta+f');
  await expect(panel(page).getByRole('textbox')).toHaveValue('Кандидаты');
  await expect(panel(page).locator('.sum')).toHaveCount(0); // not run until ↩
});
