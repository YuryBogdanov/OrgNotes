import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 57.4: the theme's editor — «+ Новая тема» opens a copy of the theme in effect: «Основа» with the contrast,
// «Палитра» with the user's statuses, «Детали»; a colour by its hex applies to the whole window at once (the accent:
// the buttons, `lampink` kept at 4.5:1); ⎋ closes the picker first; «Сбросить» back to as it was; «‹ Все темы».

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': '* TODO Задача\n' }, ready: false, viewport: { width: 1440, height: 900 } });
  await expect(page.getByRole('tree', { name: 'Файлы' })).toBeVisible();
  await page.keyboard.press('Meta+,');
  const s = page.getByRole('dialog', { name: 'Настройки' });
  await s.getByRole('tab', { name: 'Оформление', exact: true }).click();
  return s;
}

const css = (page: Page, v: string) => page.evaluate((n) => getComputedStyle(document.querySelector('.next')!).getPropertyValue(n).trim(), v);
const hexIn = async (page: Page, v: string) => {
  const hex = page.getByRole('dialog', { name: 'Цвет' }).getByRole('textbox', { name: 'HEX' });
  await hex.fill(v);
  await hex.press('Enter');
};

test('«+ Новая тема»: the editor of a copy; the accent recolours the window at once, lampink readable; ⎋ the picker first; «Сбросить»', async ({ page }) => {
  const s = await open(page);
  await s.getByRole('button', { name: '+ Новая тема' }).click();
  const ed = s.getByRole('region', { name: 'Редактор темы' });
  await expect(ed).toBeVisible();
  await expect(ed.locator('h1')).toHaveText('Тема «Новая тема»');
  await expect(s.locator('header .t2')).toHaveText('Оформление › Тема');
  await expect(ed.getByRole('textbox', { name: 'Название темы' })).toHaveValue('Новая тема');
  await expect(ed.locator('.look')).toHaveText('светлая — по фону');
  // «Основа»: the contrast of the text and of the accent's ink
  const base = ed.getByRole('region', { name: 'Основа' });
  await expect(base.locator('.row[data-key="ink"] .cr')).toHaveText(/^\d+\.\d:1 ✓$/);
  await expect(base.locator('.row[data-key="accent"] .hex')).toHaveText('#E3AA3C');
  // the accent: the window's lamp at once; its ink darkened till it reads
  await base.getByRole('button', { name: /^Акцент:/ }).click();
  await hexIn(page, '#ffe066');
  await expect.poll(() => css(page, '--lamp')).toBe('#ffe066');
  await expect(base.locator('.row[data-key="accent"] .cr')).toHaveText(/✓$/);
  expect(await css(page, '--lampink')).not.toBe('#ffe066');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Цвет' })).toHaveCount(0);
  await expect(ed).toBeVisible();
  // the ground dark: «тёмная — по фону», the window dark
  await base.getByRole('button', { name: /^Фон:/ }).click();
  await hexIn(page, '#1b1b22');
  await expect(ed.locator('.look')).toHaveText('тёмная — по фону');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.appearance)).toBe('dark');
  await page.keyboard.press('Escape');
  // «Палитра»: the eight, the user's statuses in them
  const pal = ed.getByRole('region', { name: 'Палитра' });
  await expect(pal.locator('.pc')).toHaveCount(8);
  await expect(pal.locator('.capsule').first()).toHaveText('TODO');
  // «Детали»: the grid, the headings by levels with four swatches
  const det = ed.getByRole('region', { name: 'Детали' });
  await det.getByRole('radio', { name: 'Нет' }).click();
  await expect.poll(() => css(page, '--grid')).toMatch(/,0\)$/);
  await det.getByRole('radio', { name: 'По уровням' }).click();
  await expect(det.locator('.lvc')).toHaveCount(4);
  await det.getByRole('radio', { name: 'Свой цвет' }).click();
  await expect(det.getByRole('button', { name: /^Сайдбар:/ })).toBeVisible();
  // «Сбросить»: as it was when the editor opened
  await ed.getByRole('button', { name: 'Сбросить' }).click();
  await expect(ed.locator('.look')).toHaveText('светлая — по фону');
  await expect.poll(() => css(page, '--lamp')).toBe('#e3aa3c');
  await expect(det.locator('.lvc')).toHaveCount(0);
  await ed.getByRole('button', { name: '‹ Все темы' }).click();
  await expect(s.locator('h1')).toHaveText('Оформление');
  await expect(s.getByRole('radiogroup', { name: 'Темы' }).getByRole('radio', { name: 'Новая тема' })).toHaveAttribute('aria-checked', 'true');
});

test('a built-in theme is not edited: «Дублировать и изменить…» makes «… — копия»; the copy\'s file is of the new format once changed', async ({ page }) => {
  const s = await open(page);
  const cards = s.getByRole('radiogroup', { name: 'Темы' });
  await cards.getByRole('radio', { name: 'Синька' }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Изменить…', exact: true })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Дублировать и изменить…' }).click();
  const ed = s.getByRole('region', { name: 'Редактор темы' });
  await expect(ed.locator('h1')).toHaveText('Тема «Синька — копия»');
  await expect(ed.locator('.look')).toHaveText('тёмная — по фону');
  await ed.getByRole('textbox', { name: 'Название темы' }).fill('Сепия');
  await ed.getByRole('textbox', { name: 'Название темы' }).press('Enter');
  await expect(ed.locator('h1')).toHaveText('Тема «Сепия»');
  await ed.getByRole('region', { name: 'Основа' }).getByRole('button', { name: /^Текст:/ }).click();
  await hexIn(page, '#f0e6d2');
  await expect.poll(() => css(page, '--ink')).toBe('#f0e6d2');
});
