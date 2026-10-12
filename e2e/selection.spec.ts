import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// The fix «выделение и текущая строка»: the selection is seen on the caret's line too; the current line is not
// marked while something is selected; grey without the focus; a search match inside the selection keeps it seen.

const WORK = '* Q4 2026\n** TODO Бюджет на 2027\nСвести расходы по направлениям.\nСогласовать бюджет с финансами.\n** Идеи\n';

async function open(page: Page) {
  await installTauriMock(page, { '/mock/work.org': WORK });
  await page.goto('/');
  await expect(page.locator('.cm-content')).toContainText('Согласовать');
}
const ed = (page: Page) => page.locator('section.pane.active .cm-editor');
const bg = (page: Page, sel: string) => ed(page).locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor);

test('three lines selected through the caret\'s line: the line is not marked, the selection is blue', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: 'Свести расходы' }).click();
  await expect(ed(page)).not.toHaveClass(/cm-has-selection/);
  expect(await bg(page, '.cm-activeLine')).toBe('rgba(10, 100, 214, 0.05)'); // the soft current line, see-through
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(ed(page)).toHaveClass(/cm-has-selection/);
  expect(await bg(page, '.cm-activeLine')).toBe('rgba(0, 0, 0, 0)');
  expect(await bg(page, '.cm-activeLineGutter')).toBe('rgba(0, 0, 0, 0)');
  await expect(ed(page).locator('.cm-selectionBackground').first()).toBeVisible();
  expect(await bg(page, '.cm-selectionBackground')).toBe('rgba(10, 100, 214, 0.26)');
  await page.keyboard.press('ArrowRight'); // nothing selected again
  await expect(ed(page)).not.toHaveClass(/cm-has-selection/);
});

test('in the dark theme too; without the focus the selection is grey', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page);
  await page.locator('.cm-line', { hasText: 'Свести расходы' }).click();
  expect(await bg(page, '.cm-activeLine')).toBe('rgba(108, 180, 255, 0.07)');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  expect(await bg(page, '.cm-selectionBackground')).toBe('rgba(10, 132, 255, 0.45)');
  await page.keyboard.press('Meta+f'); // the focus goes to the find field: the editor keeps its selection, grey
  await expect(page.getByRole('textbox', { name: 'Найти в файле' })).toBeFocused();
  expect(await bg(page, '.cm-selectionBackground')).toBe('rgba(255, 255, 255, 0.14)');
});

test('a search match inside the selection is framed, so the selection stays seen over the yellow', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+f');
  await page.keyboard.type('бюджет');
  await expect(ed(page).locator('.cm-find')).toHaveCount(2);
  await page.locator('.cm-line', { hasText: 'Согласовать' }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await expect(ed(page).locator('.cm-find.cm-find-sel')).toHaveCount(1);
  await expect(ed(page).locator('.cm-line', { hasText: 'Согласовать' }).locator('.cm-find')).toHaveClass(/cm-find-sel/);
  await expect(ed(page).locator('.cm-line', { hasText: 'Бюджет на 2027' }).locator('.cm-find')).not.toHaveClass(/cm-find-sel/);
});

test('in the other pane, without the focus, the line is still not marked while something is selected', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: 'Свести расходы' }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowDown');
  await page.getByRole('button', { name: 'Второй редактор' }).click(); // the focus goes to the new pane
  const left = page.locator('section.pane').nth(0).locator('.cm-editor');
  await expect(left).not.toHaveClass(/cm-focused/);
  await expect(left).toHaveClass(/cm-has-selection/);
  expect(await left.locator('.cm-activeLine').first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await left.locator('.cm-selectionBackground').first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0.1)');
});
