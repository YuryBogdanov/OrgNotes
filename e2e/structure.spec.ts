import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// ТЗ «Навигатор, структура файла и переход к заголовку».
const WORK = '#+TITLE: Работа\n\n* Q4 2026\n** TODO Подготовить бюджет 2027\nтекст\n*** DONE Собрать заявки\n*** TODO Согласовать с финансами\n** NEXT План найма\n* Тимлиды\nзаметки\n';
const FILES = () => ({
  '/mock/work.org': WORK,
  '/mock/journal.org': '* Октябрь\n** Итоги\n',
  '/mock/empty.org': 'просто текст без заголовков\n',
  '/mock/Работа/2026/plan.org': '* План\n',
});

const open = async (page: Page, opts: { headings?: boolean } = {}) => {
  if (opts.headings) await page.addInitScript(() => localStorage.setItem('nav:headings', '1'));
  await installTauriMock(page, FILES());
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.locator('.nav .row[data-key="/mock/work.org"]').click();
  await expect(page.locator('.cm-content').first()).toContainText('Q4 2026');
};
const navRow = (page: Page, key: string) => page.locator(`.nav .row[data-key="${key}"]`);
const x = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!.x;
const outline = (page: Page) => page.locator('.insp .outline');
const orow = (page: Page, text: string) => outline(page).locator('.row', { has: page.locator('.t', { hasText: text }) });
const otitles = (page: Page) => outline(page).locator('.row .t').allInnerTexts();
const status = (page: Page) => page.locator('section.pane.active .status').innerText();
const toOutline = async (page: Page) => page.locator('.insp').getByRole('tab', { name: 'Структура' }).click();

test.describe('navigator', () => {
  test('a chevron only on folders; files and folders of one level line up', async ({ page }) => {
    await open(page);
    const folder = navRow(page, 'Работа/');
    const file = navRow(page, '/mock/work.org');
    await expect(folder.locator('.chev')).toBeVisible();
    await expect(file.locator('.chev')).toHaveCSS('visibility', 'hidden');
    const fi = (await folder.locator('svg.ic').boundingBox())!.x;
    const ii = (await file.locator('svg.ic').boundingBox())!.x;
    expect(Math.abs(fi - ii)).toBeLessThanOrEqual(1);
    // one level deeper: 14 more
    const sub = (await navRow(page, 'Работа/2026/').locator('svg.ic').boundingBox())!.x;
    expect(Math.round(sub - fi)).toBe(14);
    expect(Math.round((await folder.locator('.chev').boundingBox())!.width)).toBe(10);
    void x;
  });

  test('an empty folder has no chevron', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Shift+Meta+p');
    await page.keyboard.type('создать папку');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Пустая');
    await page.keyboard.press('Enter');
    await expect(navRow(page, 'Пустая/')).toBeVisible();
    await expect(navRow(page, 'Пустая/').locator('.chev')).toHaveCSS('visibility', 'hidden');
  });

  test('with the setting off (the default) no headings appear in the navigator, whatever happens', async ({ page }) => {
    await open(page);
    await expect(page.locator('.nav .row')).toHaveText(['Работа', '2026', 'plan', 'empty', 'journal', 'work'].map((t) => new RegExp(t)));
    await page.locator('.cm-line', { hasText: 'План найма' }).click();
    await navRow(page, '/mock/work.org').locator('.chev').click({ force: true });
    await page.keyboard.press('Shift+Meta+j'); // «Показать в навигаторе»
    await expect(page.locator('.nav .kw')).toHaveCount(0);
    await expect(page.locator('.nav')).not.toContainText('Q4 2026');
    await expect(navRow(page, '/mock/work.org')).toHaveClass(/sel/);
  });

  test('with the setting on a file shows its chevron when open or under the pointer', async ({ page }) => {
    await open(page, { headings: true });
    const work = navRow(page, '/mock/work.org');
    const journal = navRow(page, '/mock/journal.org');
    await expect(work.locator('.chev')).toHaveCSS('opacity', '1'); // the open file
    await expect(journal.locator('.chev')).toHaveCSS('opacity', '0');
    await journal.hover();
    await expect(journal.locator('.chev')).toHaveCSS('opacity', '1');
    await expect(navRow(page, '/mock/empty.org').locator('.chev')).toHaveCSS('visibility', 'hidden'); // no headings
    // heading rows: one level deeper, keyword as a chip; a click puts the caret on it
    const h = page.locator('.nav .row', { hasText: 'План найма' });
    await expect(h.locator('.kw')).toHaveText('NEXT');
    await h.click();
    await expect.poll(() => status(page)).toContain('Стр. 8');
  });

  test('the setting in Настройки → Основные reaches the open window at once', async ({ page, context }) => {
    await open(page);
    const settings = await context.newPage();
    await installTauriMock(settings, FILES());
    await settings.goto('/#settings');
    await settings.getByRole('tab', { name: 'Основные' }).click();
    const sw = settings.getByRole('switch', { name: 'Показывать заголовки в навигаторе' });
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.nav')).toContainText('Q4 2026');
    await sw.click();
    await expect(page.locator('.nav')).not.toContainText('Q4 2026');
  });

  test('a click on a file opens it and keeps the keyboard in the navigator; ↩ goes into the editor', async ({ page }) => {
    await open(page);
    await navRow(page, '/mock/journal.org').click();
    await expect(page.locator('.tab.on .lbl')).toHaveText('journal');
    await expect(navRow(page, '/mock/journal.org')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(navRow(page, '/mock/work.org')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(navRow(page, '/mock/empty.org')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.tab.on .lbl')).toHaveText('empty');
    await expect(page.locator('section.pane.active .cm-content')).toBeFocused();
  });

  test('←/→ fold and open folders as in Finder; ↑↓ move', async ({ page }) => {
    await open(page);
    await navRow(page, 'Работа/').locator('.label').click(); // also folds it
    await expect(navRow(page, 'Работа/2026/')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(navRow(page, 'Работа/2026/')).toBeVisible();
    await page.keyboard.press('ArrowRight'); // into the folder
    await expect(navRow(page, 'Работа/2026/')).toBeFocused();
    await page.keyboard.press('ArrowLeft'); // fold 2026
    await expect(navRow(page, '/mock/Работа/2026/plan.org')).toHaveCount(0);
    await page.keyboard.press('ArrowLeft'); // up to Работа
    await expect(navRow(page, 'Работа/')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(navRow(page, 'Работа/2026/')).toBeFocused();
  });
});

test.describe('the inspector outline', () => {
  test('the tab is remembered; the title is the file name; the caret\'s heading is marked and follows it', async ({ page }) => {
    await open(page);
    await toOutline(page);
    await expect(outline(page).locator('.cap')).toHaveText('СТРУКТУРА · work');
    expect(await otitles(page)).toEqual(['Q4 2026', 'Подготовить бюджет 2027', 'Собрать заявки', 'Согласовать с финансами', 'План найма', 'Тимлиды']);
    await expect(orow(page, 'Подготовить бюджет').locator('.kw')).toHaveText('TODO');
    await page.locator('.cm-line', { hasText: 'текст' }).first().click();
    await expect(orow(page, 'Подготовить бюджет')).toHaveClass(/cur/);
    await page.locator('.cm-line', { hasText: 'заметки' }).click();
    await expect(orow(page, 'Тимлиды')).toHaveClass(/cur/);
    await expect(orow(page, 'Подготовить бюджет')).not.toHaveClass(/cur/);
    await page.reload();
    await expect(outline(page)).toBeVisible();
  });

  test('a click puts the caret on the heading and the focus stays; ↑↓ preview; Return goes into the editor', async ({ page }) => {
    await open(page);
    await toOutline(page);
    await orow(page, 'План найма').click();
    await expect.poll(() => status(page)).toContain('Стр. 8');
    await expect(outline(page).locator('.tree')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => status(page)).toContain('Стр. 7');
    await expect(outline(page).locator('.tree')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('section.pane.active .cm-content')).toBeFocused();
    await page.keyboard.type('!');
    await expect(page.locator('.cm-line', { hasText: 'Согласовать' })).toHaveText('!*** TODO Согласовать с финансами');
  });

  test('a double click goes into the editor too', async ({ page }) => {
    await open(page);
    await toOutline(page);
    await orow(page, 'Тимлиды').dblclick();
    await expect(page.locator('section.pane.active .cm-content')).toBeFocused();
    await expect.poll(() => status(page)).toContain('Стр. 9');
  });

  test('a folded branch shows its count of tasks', async ({ page }) => {
    await open(page);
    await toOutline(page);
    await orow(page, 'Подготовить бюджет').locator('.chev').click();
    expect(await otitles(page)).toEqual(['Q4 2026', 'Подготовить бюджет 2027', 'План найма', 'Тимлиды']);
    await expect(orow(page, 'Подготовить бюджет').locator('.cnt')).toHaveText('1/2');
    await expect(orow(page, 'План найма').locator('.chev')).toHaveCSS('visibility', 'hidden');
  });

  test('the filter keeps the parents and marks the match; «Только задачи» works with it', async ({ page }) => {
    await open(page);
    await toOutline(page);
    await outline(page).getByLabel('Фильтр заголовков').fill('ФИН');
    expect(await otitles(page)).toEqual(['Q4 2026', 'Подготовить бюджет 2027', 'Согласовать с финансами']);
    await expect(orow(page, 'Согласовать').locator('mark')).toHaveText('фин');
    await outline(page).getByLabel('Фильтр заголовков').fill('');
    await outline(page).getByRole('radio', { name: 'Только задачи' }).click();
    expect(await otitles(page)).toEqual(['Q4 2026', 'Подготовить бюджет 2027', 'Собрать заявки', 'Согласовать с финансами', 'План найма']);
    await outline(page).getByLabel('Фильтр заголовков').fill('план');
    expect(await otitles(page)).toEqual(['Q4 2026', 'План найма']);
    await outline(page).getByLabel('Фильтр заголовков').fill('тимлид');
    await expect(outline(page)).toContainText('Ничего не найдено');
  });

  test('it follows the active editor and edits; empty states', async ({ page }) => {
    await open(page);
    await toOutline(page);
    await page.locator('.cm-line', { hasText: 'Тимлиды' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' и CTO');
    await expect(orow(page, 'Тимлиды и CTO')).toBeVisible();
    await page.getByRole('button', { name: 'Второй редактор' }).click();
    await navRow(page, '/mock/journal.org').click();
    await expect(outline(page).locator('.cap')).toHaveText('СТРУКТУРА · journal');
    await page.locator('section.pane').first().locator('.cm-content').click();
    await expect(outline(page).locator('.cap')).toHaveText('СТРУКТУРА · work');
    await navRow(page, '/mock/empty.org').click();
    await expect(outline(page)).toContainText('В файле нет заголовков');
    await page.keyboard.press('Meta+w');
    await page.keyboard.press('Meta+w');
    await expect(page.locator('.insp')).toContainText('Откройте файл, чтобы увидеть структуру');
  });
});

test.describe('the palette', () => {
  test('«Показать структуру файла» opens the outline; «#» without a file says so', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Shift+Meta+p');
    await page.keyboard.type('структур');
    await page.keyboard.press('Enter');
    await expect(outline(page)).toBeVisible();
    await page.keyboard.press('Meta+w');
    await page.keyboard.press('Shift+Meta+p');
    await page.keyboard.type('#');
    await expect(page.getByRole('dialog', { name: 'Командная палитра' }).locator('.row')).toHaveText(['Откройте файл, чтобы перейти к заголовку']);
  });
});
