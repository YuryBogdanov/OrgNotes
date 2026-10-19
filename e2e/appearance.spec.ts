import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet } from './tauriMock';

// ТЗ 25, part 1: «Настройки → Оформление» — the appearance of the app (system / light / dark) and the editor theme
// of each appearance; the built-in themes; statuses in the theme's palette.

const NOTES = '#+TITLE: Работа\n* Q4 2026\n** TODO Подготовить бюджет\n*** NEXT Свести расходы\n**** Уровень 4\n***** Уровень 5\n';
async function open(page: Page, scheme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ colorScheme: scheme });
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, { '/mock/Work.org': NOTES });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
}
const look = (page: Page) => page.getByRole('region', { name: 'Оформление' });
const root = (page: Page) => page.locator('html');
const color = (page: Page, sel: string, prop = 'color') => page.locator(sel).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test('«Оформление» comes after «Основные» and «Сегодня»; «Системное» is chosen and follows macOS', async ({ page }) => {
  await open(page, 'dark');
  await expect(root(page)).toHaveAttribute('data-appearance', 'dark');
  await openSettingsSheet(page, 'Оформление');
  await expect(page.getByRole('dialog', { name: 'Настройки' }).getByRole('tab').nth(2)).toHaveText('Оформление');
  await expect(look(page).getByRole('radio', { name: 'Системное' })).toHaveAttribute('aria-checked', 'true');
  await expect(look(page)).toContainText('сейчас активна — системное оформление тёмное');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root(page)).toHaveAttribute('data-appearance', 'light');
  await expect(look(page)).toContainText('сейчас активна — системное оформление светлое');
});

test('«Светлое» and «Тёмное» switch the whole window at once and are kept', async ({ page }) => {
  await open(page, 'light');
  await openSettingsSheet(page, 'Оформление');
  await look(page).getByRole('radio', { name: 'Тёмное' }).click();
  await expect(root(page)).toHaveAttribute('data-appearance', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())).toBe('#1e1e22');
  await expect(look(page).getByRole('radio', { name: 'Тёмное' })).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(root(page)).toHaveAttribute('data-appearance', 'dark'); // before the first paint
  // the arrows move the choice
  await openSettingsSheet(page, 'Оформление');
  await look(page).getByRole('radio', { name: 'Тёмное' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(look(page).getByRole('radio', { name: 'Светлое' })).toHaveAttribute('aria-checked', 'true');
  await expect(root(page)).toHaveAttribute('data-appearance', 'light');
});

test('the built-in themes; by default the look is as before; a theme recolours the editor and the statuses at once', async ({ page }) => {
  await open(page, 'light');
  expect(await color(page, '.cm-editor', 'background-color')).toBe('rgb(255, 255, 255)');
  expect(await color(page, '.cm-h1')).toBe('rgb(10, 88, 194)');
  expect(await color(page, '.cm-kw')).toBe('rgb(196, 38, 46)'); // TODO: red
  await openSettingsSheet(page, 'Оформление');
  const light = look(page).getByRole('radiogroup', { name: 'Тема при светлом оформлении' });
  const dark = look(page).getByRole('radiogroup', { name: 'Тема при тёмном оформлении' });
  expect(await light.getByRole('radio').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Классическая светлая', 'Бумага', 'Leuven', 'Solarized Light', 'Modus Operandi']);
  expect(await dark.getByRole('radio').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Классическая тёмная', 'Синька', 'Nord', 'Gruvbox Dark', 'Dracula', 'Modus Vivendi']);
  await expect(light.getByRole('radio', { name: 'Классическая светлая' })).toHaveAttribute('aria-checked', 'true');
  await expect(light.getByRole('radio', { name: 'Leuven' }).locator('..')).toContainText('из плагина');
  await light.getByRole('radio', { name: 'Solarized Light' }).click();
  await expect(light.getByRole('radio', { name: 'Solarized Light' })).toHaveAttribute('aria-checked', 'true');
  expect(await color(page, '.cm-editor', 'background-color')).toBe('rgb(253, 246, 227)');
  expect(await color(page, '.cm-h1')).toBe('rgb(203, 75, 22)');
  expect(await color(page, '.cm-kw')).toBe('rgb(220, 50, 47)'); // the theme's red
  // the rest of the window keeps its own colours
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())).toBe('#ffffff');
  // the dark appearance has its own theme
  await dark.getByRole('radio', { name: 'Nord' }).click();
  await look(page).getByRole('radio', { name: 'Тёмное' }).click();
  expect(await color(page, '.cm-editor', 'background-color')).toBe('rgb(46, 52, 64)');
  await look(page).getByRole('radio', { name: 'Светлое' }).click();
  expect(await color(page, '.cm-editor', 'background-color')).toBe('rgb(253, 246, 227)');
  await page.reload();
  expect(await color(page, '.cm-h1')).toBe('rgb(203, 75, 22)');
});

test('levels 4 and deeper: a class of their own, coloured by the theme (5 as 4 unless set)', async ({ page }) => {
  await open(page, 'light');
  expect(await color(page, '.cm-h4')).toBe(await color(page, '.cm-h3'));
  expect(await color(page, '.cm-h5')).toBe(await color(page, '.cm-h4'));
  await openSettingsSheet(page, 'Оформление');
  await look(page).getByRole('radiogroup', { name: 'Тема при светлом оформлении' }).getByRole('radio', { name: 'Leuven' }).click();
  expect(await color(page, '.cm-h4')).toBe('rgb(234, 99, 0)');
  expect(await color(page, '.cm-h5')).toBe('rgb(227, 37, 141)');
});
