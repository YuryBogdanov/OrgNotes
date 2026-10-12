import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet } from './tauriMock';

// ТЗ 25, part 2: own themes — «+ Новая тема», duplicate, rename, delete, export, import; files in the themes folder.

const NOTES = '* Q4 2026\n** TODO Подготовить бюджет\n';
const MINE = JSON.stringify({ format: 'panopticon-theme', version: 1, name: 'Ночная', appearance: 'dark', basedOn: 'Nord', colors: { bg: '#101820', h1: '#ff8800' } });
async function open(page: Page, extra: Record<string, string> = {}) {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, { '/mock/Work.org': NOTES, ...extra });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await openSettingsSheet(page, 'Оформление');
}
const disk = (page: Page) => page.evaluate(() => (window as any).__disk as Record<string, string>);
const dark = (page: Page) => page.getByRole('radiogroup', { name: 'Тема при тёмном оформлении' });
const light = (page: Page) => page.getByRole('radiogroup', { name: 'Тема при светлом оформлении' });
const edBg = (page: Page) => page.locator('.cm-editor').first().evaluate((el) => getComputedStyle(el).backgroundColor);
const menuOn = async (page: Page, name: string) => dark(page).getByRole('radio', { name, exact: true }).click({ button: 'right' });

test('own themes from the themes folder are listed after the built-in ones, marked «своя», and can be chosen', async ({ page }) => {
  await open(page, { '/config/themes/Ночная.json': MINE });
  const card = dark(page).getByRole('radio', { name: 'Ночная' });
  await expect(card).toBeVisible();
  await expect(card.locator('..')).toContainText('своя');
  await card.click();
  expect(await edBg(page)).toBe('rgb(16, 24, 32)');
  // a reload paints it at once (cached), then reads the folder again
  await page.reload();
  expect(await edBg(page)).toBe('rgb(16, 24, 32)');
});

test('«+ Новая тема»: a copy of the chosen theme, chosen and opened in the theme editor; written as a file', async ({ page }) => {
  await open(page);
  await dark(page).getByRole('radio', { name: 'Nord' }).click();
  await dark(page).getByRole('button', { name: 'Новая тема' }).click();
  await expect(page.getByRole('region', { name: 'Редактор темы' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Название темы' })).toHaveValue('Nord — моя');
  await expect(page.getByRole('dialog', { name: 'Настройки' }).locator('.t2')).toHaveText('Оформление › Тема редактора');
  await page.getByRole('button', { name: '‹ Оформление' }).click();
  await expect(dark(page).getByRole('radio', { name: 'Nord — моя' })).toHaveAttribute('aria-checked', 'true');
  const files = await disk(page);
  expect(Object.keys(files).filter((k) => k.startsWith('/config/themes/'))).toEqual(['/config/themes/Nord — моя.json']);
  const t = JSON.parse(files['/config/themes/Nord — моя.json']);
  expect(t).toMatchObject({ format: 'panopticon-theme', version: 1, name: 'Nord — моя', appearance: 'dark', basedOn: 'Nord' });
  expect(await edBg(page)).toBe('rgb(46, 52, 64)');
});

test('the menu of a card: duplicate («(2)» on a clash), rename (the file follows), delete (back to Panopticon)', async ({ page }) => {
  await open(page, { '/config/themes/Ночная.json': MINE });
  await dark(page).getByRole('radio', { name: 'Ночная' }).click();
  // a built-in theme cannot be renamed or deleted
  await menuOn(page, 'Nord');
  await expect(page.getByRole('menuitem', { name: 'Переименовать' })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: 'Удалить' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Настройки' })).toBeVisible(); // ⎋ closed only the menu

  await menuOn(page, 'Ночная');
  await page.getByRole('menuitem', { name: 'Дублировать' }).click();
  await page.keyboard.press('Enter'); // keep the offered name
  await expect(dark(page).getByRole('radio', { name: 'Ночная (2)' })).toHaveAttribute('aria-checked', 'true');

  await menuOn(page, 'Ночная (2)');
  await page.getByRole('menuitem', { name: 'Переименовать' }).click();
  await page.keyboard.type('Сумерки');
  await page.keyboard.press('Enter');
  await expect(dark(page).getByRole('radio', { name: 'Сумерки' })).toHaveAttribute('aria-checked', 'true');
  let keys = Object.keys(await disk(page)).filter((k) => k.startsWith('/config/themes/')).sort();
  expect(keys).toEqual(['/config/themes/Ночная.json', '/config/themes/Сумерки.json']);
  // renaming to a taken name gets «(2)»; ⎋ while renaming leaves the name
  await menuOn(page, 'Сумерки');
  await page.getByRole('menuitem', { name: 'Переименовать' }).click();
  await page.keyboard.type('Новое');
  await page.keyboard.press('Escape');
  await expect(dark(page).getByRole('radio', { name: 'Сумерки' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Настройки' })).toBeVisible();

  await menuOn(page, 'Сумерки');
  await page.getByRole('menuitem', { name: 'Удалить' }).click();
  const dlg = page.getByRole('alertdialog', { name: 'Удаление темы' });
  await expect(dlg).toContainText('Редактор вернётся к теме «Panopticon тёмная»');
  await dlg.getByRole('button', { name: 'Удалить' }).click();
  await expect(dark(page).getByRole('radio', { name: 'Сумерки' })).toHaveCount(0);
  await expect(dark(page).getByRole('radio', { name: 'Panopticon тёмная' })).toHaveAttribute('aria-checked', 'true');
  keys = Object.keys(await disk(page)).filter((k) => k.startsWith('/config/themes/'));
  expect(keys).toEqual(['/config/themes/Ночная.json']);
});

test('«Экспорт…» writes the theme where the save panel says; «Импорт…» adds one for its appearance', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    (window as any).__savePicks = ['/Users/me/Desktop/Dracula.json'];
    (window as any).__picks = ['/Users/me/Downloads/light.json'];
    (window as any).__disk['/Users/me/Downloads/light.json'] = JSON.stringify({ format: 'panopticon-theme', version: 1, name: 'Leuven', appearance: 'light', colors: { bg: '#fafaf0' } });
  });
  await menuOn(page, 'Dracula');
  await page.getByRole('menuitem', { name: 'Экспорт…' }).click();
  await expect.poll(async () => (await disk(page))['/Users/me/Desktop/Dracula.json'] ?? '').toContain('"name": "Dracula"');
  const out = JSON.parse((await disk(page))['/Users/me/Desktop/Dracula.json']);
  expect(out.colors.bg).toBe('#282a36');
  // a taken name gets «(2)»
  await light(page).locator('..').getByRole('button', { name: 'Импорт…' }).click();
  await expect(light(page).getByRole('radio', { name: 'Leuven (2)' })).toBeVisible();
  await expect(page.locator('.toast')).toContainText('Тема «Leuven (2)» добавлена — для светлого оформления');
  await light(page).getByRole('radio', { name: 'Leuven (2)' }).click();
  await expect(light(page).getByRole('radio', { name: 'Leuven (2)' })).toHaveAttribute('aria-checked', 'true');
  expect(Object.keys(await disk(page))).toContain('/config/themes/Leuven (2).json');
});

test('a file that is not a theme is refused with a word why', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    (window as any).__picks = ['/x/notes.json'];
    (window as any).__disk['/x/notes.json'] = '{"hello": 1}';
  });
  await dark(page).locator('..').getByRole('button', { name: 'Импорт…' }).click();
  await expect(page.getByText('Это не тема Panopticon')).toBeVisible();
});
