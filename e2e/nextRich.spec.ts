import { expect, test, type Page } from '@playwright/test';
import { openApp, diskFile as disk } from './helpers';

// ТЗ 42.6: «Оформление» of the new interface — the column with Cormorant, no stars or dots, a status capsule, tags
// `:dev:`, chips for dates, a cookie and folded drawers («⋯ 1 свойство»), the caret's line keeps its font and size
// (the lines around do not move), an unfolded drawer a block that folds by a click on its first line, the line
// above the title, an empty file's word; the file never changes by being shown.

const MID = [
  '#+TITLE: Midterm',
  '* TODO Роадмап Q4 [1/2] :работа:',
  'SCHEDULED: <2026-10-16 Пт>',
  ':PROPERTIES:',
  ':ID: x1',
  ':END:',
  'Собрать роадмап и согласовать с [[id:x2][планом миграции]], *важно*.',
  '- [X] Вводные',
  '- [ ] Черновик',
  '* NEXT Переезд хранилища :dev:',
  'Отделить парсер.',
  '',
].join('\n');
const view = (page: Page) => page.locator('[data-ui="next"] .cm-editor');
const line = (page: Page, t: string) => view(page).locator('.cm-line', { hasText: t }).first();

async function open(page: Page, files: Record<string, string> = { '/mock/Midterm.org': MID }) {
  await page.addInitScript(() => {
    localStorage.setItem('ui:next', '1');
    localStorage.setItem('editor:rich', '1');
  });
  await openApp(page, { files, ready: false, now: new Date(2026, 9, 16, 11, 0) });
  await expect(view(page)).toHaveClass(/cm-rich/);
}

test('the elements: Cormorant, no stars, a capsule, `:dev:`, chips; the title with its line above', async ({ page }) => {
  await open(page);
  const h = line(page, 'Переезд хранилища');
  await expect(h).toHaveText('NEXT Переезд хранилища:dev:'); // the tags take the space before them
  expect(await h.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Cormorant Garamond');
  expect(await h.evaluate((el) => getComputedStyle(el).fontSize)).toBe('27px');
  await expect(h.locator('.cm-r-status')).toHaveText('NEXT');
  await expect(h.locator('.cm-r-tags.colons')).toHaveText(':dev:');
  await expect(view(page).locator('.cm-r-dot')).toHaveCount(0);
  await expect(line(page, 'Роадмап').locator('.cm-r-chip.cookie')).toHaveText('1/2');
  await expect(view(page).locator('.cm-r-chip.drawer')).toHaveText('⋯ 1 свойство');
  await expect(view(page).locator('.cm-r-chip.sched')).toBeVisible();
  await expect(view(page).locator('.cm-r-title')).toHaveAttribute('data-eyebrow', /^Midterm\.org/);
  expect(await line(page, 'Отделить').evaluate((el) => getComputedStyle(el).fontSize)).toBe('19px');
});

test('the caret on a heading or a body line: the markup shows, the lines around stay where they were', async ({ page }) => {
  await open(page);
  const below = () => line(page, 'Отделить парсер').evaluate((el) => Math.round(el.getBoundingClientRect().top));
  const above = () => line(page, 'Черновик').evaluate((el) => Math.round(el.getBoundingClientRect().top));
  await line(page, 'Черновик').click({ position: { x: 300, y: 8 } });
  await page.keyboard.press('ArrowDown'); // onto the heading «Переезд хранилища»
  const y0 = await below();
  await page.keyboard.press('ArrowDown'); // its body line
  await page.keyboard.press('ArrowUp'); // the heading again
  await expect(line(page, 'Переезд хранилища').locator('.cm-n-kw')).toHaveText('NEXT');
  await expect(line(page, 'Переезд хранилища').locator('.cm-n-mk').first()).toHaveText('* ');
  expect(await line(page, 'Переезд хранилища').evaluate((el) => getComputedStyle(el).fontSize)).toBe('27px');
  expect(await below()).toBe(y0);
  // a line with its date: the chips and the raw text are as high
  const a0 = await above();
  await line(page, 'Собрать роадмап').click({ position: { x: 40, y: 10 } });
  await page.keyboard.press('ArrowUp'); // the folded drawer
  await page.keyboard.press('ArrowUp'); // SCHEDULED: <…>
  await expect(view(page).locator('.cm-activeLine .cm-n-mk')).toHaveText('SCHEDULED: <2026-10-16 Пт>');
  expect(await above()).toBe(a0);
});

test('a folded drawer opens by its chip into a block; a click on its first line folds it again', async ({ page }) => {
  await open(page);
  await view(page).locator('.cm-r-chip.drawer').click();
  await expect(view(page).locator('.cm-r-dline')).toHaveCount(3);
  await expect(view(page).locator('.cm-r-dline.end')).toHaveAttribute('data-hint', '⌃C ⌃X D — свернуть');
  await view(page).locator('.cm-r-dline.head').click();
  await expect(view(page).locator('.cm-r-dline')).toHaveCount(0);
  await expect(view(page).locator('.cm-r-chip.drawer')).toHaveText('⋯ 1 свойство');
});

test('shown and saved without an edit, the file is the same to the byte; an empty file says so', async ({ page }) => {
  await open(page, { '/mock/Midterm.org': MID, '/mock/Пусто.org': '' });
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'Midterm' }).click();
  await line(page, 'Переезд').click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Meta+s');
  await page.waitForTimeout(300);
  expect(await disk(page, '/mock/Midterm.org')).toBe(MID);
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'Пусто' }).click();
  await expect(page.locator('[data-ui="next"] .empty')).toContainText('Пустой файл');
  await expect(page.locator('[data-ui="next"] .empty')).toContainText('Начните с * — это заголовок');
});
