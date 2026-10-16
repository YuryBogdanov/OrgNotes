import { expect, test, type Page } from '@playwright/test';
import { openApp, diskFile as disk } from './helpers';

// ТЗ 42.7: tables and blocks in the new «Оформление» — a table framed with its columns in one width, the head on a
// chip, the rule line gone; the caret in a cell shows only its row's text, the rows around stay where they were;
// SRC on a chip with its language, its fences hidden; QUOTE italic with a bar; the file never changes by it.

const DOC = ['* Сравнение', '| Вариант | Срок |', '|---------+------|', '| Postgres | 6 недель |', '| ClickHouse | 4 недели |', '', '#+BEGIN_SRC python', 'def migrate(db):', '    pass', '#+END_SRC', '#+BEGIN_QUOTE', 'Без простоя.', '#+END_QUOTE', 'Текст.', ''].join('\n');
const view = (page: Page) => page.locator('[data-ui="next"] .cm-editor');

async function open(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ui:next', '1');
    localStorage.setItem('editor:rich', '1');
  });
  await openApp(page, { files: { '/mock/Midterm.org': DOC }, ready: false });
  await expect(view(page)).toHaveClass(/cm-rich/);
}

test('a table: rows in one column width, the head on a chip, the rule gone; a cell shows only its row', async ({ page }) => {
  await open(page);
  const rows = view(page).locator('.cm-n-trow');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toHaveClass(/head/);
  await expect(rows.first().locator('.cm-n-cell')).toHaveText(['Вариант', 'Срок']);
  // the columns line up: the second cell starts at the same x in every row
  const xs = await rows.evaluateAll((els) => els.map((e) => Math.round((e.children[1] as HTMLElement).getBoundingClientRect().left)));
  expect(new Set(xs).size).toBe(1);
  await expect(view(page).locator('.cm-n-trule')).toHaveCSS('height', '0px');
  const below = () => view(page).locator('.cm-n-trow', { hasText: 'ClickHouse' }).evaluate((el) => Math.round(el.getBoundingClientRect().top));
  const y0 = await below();
  await view(page).locator('.cm-n-trow', { hasText: 'Postgres' }).click();
  await expect(view(page).locator('.cm-n-tline.raw')).toHaveText('| Postgres | 6 недель |');
  await expect(view(page).locator('.cm-n-trow')).toHaveCount(2); // the others stay drawn
  expect(await below()).toBe(y0);
});

test('SRC on a chip with its language, the fences hidden; QUOTE italic; shown, the file is the same', async ({ page }) => {
  await open(page);
  await expect(view(page).locator('.cm-n-bline.src')).toHaveCount(2);
  await expect(view(page).locator('.cm-n-bline.src.first')).toHaveAttribute('data-lang', 'python');
  expect(await view(page).locator('.cm-n-bline.src.first').evaluate((el) => getComputedStyle(el).fontFamily)).toContain('IBM Plex Mono');
  await expect(view(page).locator('.cm-n-bfence.begin.src')).toHaveText('');
  expect(await view(page).locator('.cm-n-bline.quote').evaluate((el) => getComputedStyle(el).fontStyle)).toBe('italic');
  await page.keyboard.press('Meta+s');
  await page.waitForTimeout(300);
  expect(await disk(page, '/mock/Midterm.org')).toBe(DOC);
});
