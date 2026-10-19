import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet } from './tauriMock';

// ТЗ 25, part 3: the theme editor — colours by groups, the picker, contrast, levels 5–9, the live example.

const NOTES = '* Q4 2026\n** TODO Подготовить бюджет\n***** Пятый уровень\n';
async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, { '/mock/Work.org': NOTES });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await openSettingsSheet(page, 'Оформление');
}
const ed = (page: Page) => page.getByRole('region', { name: 'Редактор темы' });
const row = (page: Page, key: string) => ed(page).locator(`.row[data-key="${key}"]`);
const pop = (page: Page) => page.getByRole('dialog', { name: 'Цвет' });
const file = async (page: Page, name: string) => JSON.parse((await page.evaluate(() => (window as any).__disk))[`/config/themes/${name}.json`] ?? 'null');
const css = (page: Page, sel: string, prop = 'color') => page.locator(sel).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test('«Редактировать „Nord“…» makes «Nord — моя» and opens it; the groups and the example are there', async ({ page }) => {
  await open(page);
  const dark = page.getByRole('radiogroup', { name: 'Тема при тёмном оформлении' });
  await dark.getByRole('radio', { name: 'Nord' }).click();
  await page.getByRole('button', { name: 'Редактировать «Nord»…' }).click();
  await expect(ed(page)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Название темы' })).toHaveValue('Nord — моя');
  await expect(ed(page)).toContainText('на основе Nord · для тёмного оформления');
  expect(await ed(page).locator('.cap').allInnerTexts()).toEqual(['ОСНОВА', 'ЗАГОЛОВКИ', 'РАЗМЕТКА', 'ПАЛИТРА СТАТУСОВ И ТЕГОВ']);
  await expect(row(page, 'h4')).toContainText('Уровень 4 и глубже');
  await expect(row(page, 'palette.red')).toContainText('Красный — TODO, дедлайны');
  await expect(row(page, 'palette.blue')).toContainText('Синий — NEXT, чекбоксы');
  await expect(row(page, 'bg')).toContainText('#2E3440');
  // the example in the theme's colours
  expect(await css(page, '.pvbody .cm-editor', 'background-color')).toBe('rgb(46, 52, 64)');
  await expect(ed(page).locator('.pvbody .cm-line', { hasText: 'Подготовить бюджет 2027' })).toBeVisible();
  // «Оформление» draws the example as rich text
  await ed(page).getByRole('radio', { name: 'Оформление' }).click();
  await expect(ed(page).locator('.pvbody .cm-rich')).toHaveCount(1);
});

test('a colour from the picker or as hex applies at once — the example, the open editor, the file', async ({ page }) => {
  await open(page);
  await page.getByRole('radiogroup', { name: 'Тема при тёмном оформлении' }).getByRole('button', { name: 'Новая тема' }).click();
  await row(page, 'h1').click();
  await expect(pop(page)).toBeVisible();
  const hex = pop(page).getByRole('textbox', { name: 'HEX' });
  await hex.fill('#ff8800');
  await hex.press('Enter');
  await expect(row(page, 'h1')).toContainText('#FF8800');
  expect(await css(page, '.pvbody .cm-h1')).toBe('rgb(255, 136, 0)');
  expect(await css(page, '.pane .cm-h1')).toBe('rgb(255, 136, 0)'); // the chosen theme: the window's editor too
  await expect.poll(async () => (await file(page, 'Классическая тёмная — моя'))?.colors.h1).toBe('#ff8800');
  // a colour of the palette; ⎋ closes the picker, not the settings
  await pop(page).getByRole('button', { name: /Цвет палитры/ }).first().click();
  await page.keyboard.press('Escape');
  await expect(pop(page)).toHaveCount(0);
  await expect(ed(page)).toBeVisible();
  // the field: a drag moves the colour
  await row(page, 'date').click();
  const box = (await pop(page).locator('.sv').boundingBox())!;
  await page.mouse.click(box.x + box.width - 2, box.y + 2);
  await expect(row(page, 'date')).not.toContainText('#F58AD4');
});

test('the current line and the selection have an alpha; «Сбросить» brings back the colours it is based on', async ({ page }) => {
  await open(page);
  await page.getByRole('radiogroup', { name: 'Тема при тёмном оформлении' }).getByRole('button', { name: 'Новая тема' }).click();
  await row(page, 'selection').click();
  await expect(pop(page).getByLabel('Прозрачность')).toBeVisible();
  await pop(page).getByRole('textbox', { name: 'HEX' }).fill('#11223380');
  await pop(page).getByRole('textbox', { name: 'HEX' }).press('Enter');
  await expect(row(page, 'selection')).toContainText('#11223380');
  await page.keyboard.press('Escape');
  await row(page, 'h1').click();
  await expect(pop(page).getByLabel('Прозрачность')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await ed(page).getByRole('button', { name: 'Сбросить' }).click();
  await expect(row(page, 'selection')).toContainText('#0A84FF73');
});

test('contrast below the norm is marked on the row and counted at the top', async ({ page }) => {
  await open(page);
  await page.getByRole('radiogroup', { name: 'Тема при тёмном оформлении' }).getByRole('button', { name: 'Новая тема' }).click();
  await expect(ed(page).locator('.warn')).toHaveCount(0);
  await row(page, 'dim').click();
  await pop(page).getByRole('textbox', { name: 'HEX' }).fill('#333338');
  await pop(page).getByRole('textbox', { name: 'HEX' }).press('Enter');
  await page.keyboard.press('Escape');
  await expect(row(page, 'dim').locator('.lw')).toHaveText(/^1,\d:1$/);
  await expect(ed(page).locator('.warn')).toHaveText('1 цвет с низким контрастом');
});

test('levels 5–9: hidden behind a link, inherit level 4 until set, «Как уровень 4» takes it back', async ({ page }) => {
  await open(page);
  await page.getByRole('radiogroup', { name: 'Тема при тёмном оформлении' }).getByRole('button', { name: 'Новая тема' }).click();
  await expect(row(page, 'h5')).toHaveCount(0);
  await ed(page).getByRole('button', { name: 'Настроить более низкие уровни (5–9)' }).click();
  await expect(row(page, 'h4')).toContainText('Уровень 4');
  await expect(row(page, 'h4')).not.toContainText('глубже');
  for (const n of [5, 6, 7, 8, 9]) await expect(row(page, `h${n}`)).toContainText('как уровень 4');
  await row(page, 'h5').click();
  await pop(page).getByRole('textbox', { name: 'HEX' }).fill('#00ff00');
  await pop(page).getByRole('textbox', { name: 'HEX' }).press('Enter');
  await page.keyboard.press('Escape');
  await expect(row(page, 'h5')).not.toContainText('как уровень 4');
  await expect(row(page, 'h6')).toContainText('#00FF00'); // 6 inherits 5 now
  expect(await css(page, '.pane .cm-h5')).toBe('rgb(0, 255, 0)');
  // level 4 changes the ones that still inherit it
  await row(page, 'h4').click();
  await pop(page).getByRole('textbox', { name: 'HEX' }).fill('#123456');
  await pop(page).getByRole('textbox', { name: 'HEX' }).press('Enter');
  await page.keyboard.press('Escape');
  await expect(row(page, 'h5')).toContainText('#00FF00');
  // «Как уровень 4»
  await row(page, 'h5').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Как уровень 4' }).click();
  await expect(row(page, 'h5')).toContainText('как уровень 4');
  await expect(row(page, 'h5')).toContainText('#123456');
  await expect.poll(async () => (await file(page, 'Классическая тёмная — моя'))?.colors.h5).toBeUndefined();
  // a theme with a deep level set opens unfolded
  await ed(page).getByRole('button', { name: 'Скрыть уровни 5–9' }).click();
  await expect(row(page, 'h5')).toHaveCount(0);
});

test('renaming at the top renames the file; the menu of a card has «Редактировать»', async ({ page }) => {
  await open(page);
  await page.getByRole('radiogroup', { name: 'Тема при тёмном оформлении' }).getByRole('button', { name: 'Новая тема' }).click();
  const nm = page.getByRole('textbox', { name: 'Название темы' });
  await nm.fill('Ночь');
  await nm.press('Enter');
  await expect.poll(async () => (await file(page, 'Ночь'))?.name).toBe('Ночь');
  await page.getByRole('button', { name: '‹ Оформление' }).click();
  await page.getByRole('radio', { name: 'Ночь' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Редактировать' }).click();
  await expect(nm).toHaveValue('Ночь');
});
