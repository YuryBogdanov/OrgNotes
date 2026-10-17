import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 42.9: «Структура» right of the editor — headings of levels 1–3, the current one marked, a click goes there;
// «Ссылаются» — the links to the heading under the caret, a click opens their place; ⌥⌘0 hides and shows it (kept on
// this Mac); a narrow window has no room for it.

const MID = ['* TODO Роадмап', ':PROPERTIES:', ':ID: x1', ':END:', 'Текст.', '* NEXT Переезд', '** TODO Бенчмарк', '*** Детали', '**** Глубже', '* DONE Готово', ''].join('\n');
const F = { '/mock/Midterm.org': MID, '/mock/weeks.org': '* Неделя 42\nСм. [[id:x1][роадмап]].\n' };
const col = (page: Page) => page.getByRole('complementary', { name: 'Структура' });

async function open(page: Page, width = 1440) {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: F, ready: false, viewport: { width, height: 820 } });
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'Midterm' }).click();
  await expect(page.locator('[data-ui="next"] .cm-content')).toBeVisible();
}

test('levels 1–3, the current one marked; a click goes to a heading', async ({ page }) => {
  await open(page);
  await expect(col(page).locator('.row .t')).toHaveText(['Роадмап', 'Переезд', 'Бенчмарк', 'Детали', 'Готово']);
  await page.locator('.cm-line', { hasText: 'Глубже' }).click();
  await expect(col(page).locator('.row.on')).toHaveText('Детали'); // level 4: its ancestor of level 3
  await col(page).getByRole('button', { name: 'Переезд' }).click();
  await expect(col(page).locator('.row.on')).toHaveText('Переезд');
  await expect(page.locator('.cm-activeLine')).toContainText('Переезд');
});

test('one ground with the text: the grid under both, the editor has no ground of its own (the mockup)', async ({ page }) => {
  await open(page);
  const bgOf = (sel: string) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).backgroundColor + '|' + getComputedStyle(e).backgroundImage);
  for (const sel of ['[data-ui="next"] .cm-editor', '[data-ui="next"] .cm-scroller']) expect(await bgOf(sel)).toBe('rgba(0, 0, 0, 0)|none');
  expect(await col(page).evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await col(page).evaluate((e) => getComputedStyle(e.parentElement!).backgroundImage)).toContain('linear-gradient');
});

test('«Ссылаются»: the links to the heading under the caret; a click opens their place; none — no block', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: 'Текст.' }).click();
  await expect(col(page).locator('.bl')).toHaveText(['↳ weeks · Неделя 42']);
  await page.locator('.cm-line', { hasText: 'Готово' }).click();
  await expect(col(page).locator('.back')).toHaveCount(0);
  await page.locator('.cm-line', { hasText: 'Текст.' }).click();
  await col(page).locator('.bl').click();
  await expect(page.locator('.bar .name')).toHaveText('weeks');
});

test('⌥⌘0 hides and shows it, kept after a reload; a narrow window has no room for it', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Alt+Meta+0');
  await expect(col(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-ui="next"] .cm-content')).toBeVisible();
  await expect(col(page)).toHaveCount(0);
  await page.keyboard.press('Alt+Meta+0');
  await expect(col(page)).toBeVisible();
  await page.setViewportSize({ width: 1000, height: 820 }); // the area: 1000 − the sidebar < 900
  await expect(col(page)).toHaveCount(0);
});
