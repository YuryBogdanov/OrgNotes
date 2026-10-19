import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 54.1: the settings' sheet of the new interface — its head, the column of the sections (the core's by `order`,
// «Настройки плагинов», «Плагины» at the foot), the section on the grid with its title, the whole window dimmed;
// ⎋, ⌘[ ⌘], ↑↓; a narrow window — the sections in a strip on top.

const F: Record<string, string> = { '/mock/Midterm.org': '* TODO Переезд\n' };
async function open(page: Page, width = 1400) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: F, ready: false, viewport: { width, height: 860 } });
  await expect(page.getByRole('tree', { name: 'Файлы' })).toBeVisible();
  await page.keyboard.press('Meta+,');
  await expect(page.getByRole('dialog', { name: 'Настройки' })).toBeVisible();
}
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Настройки' });
const sections = (page: Page) => sheet(page).getByRole('tablist', { name: 'Разделы настроек' });

test('the head, the column in its order, the plugins\' group, «Плагины» at the foot; the title; the window dimmed', async ({ page }) => {
  await open(page);
  const s = sheet(page);
  await expect(s.locator('header .t1')).toHaveText('Настройки');
  await expect(s.locator('header .t2')).toHaveText('Основные');
  await expect(s.locator('header')).toContainText('Изменения применяются сразу');
  await expect(s.getByRole('button', { name: 'Готово' })).toBeVisible();
  const names = await sections(page).getByRole('tab').allTextContents();
  expect(names.slice(0, 10).map((x) => x.trim())).toEqual(['Основные', 'Сегодня', 'Оформление', 'Статусы', 'Теги', 'Агенды', 'Inbox', 'Файлы', 'Мини-окно', 'Клавиши']);
  expect(names.at(-1)?.trim()).toBe('Плагины');
  await expect(sections(page).locator('.sgrp')).toHaveText('Настройки плагинов');
  // «Плагины» at the very foot of the column
  const col = await sections(page).boundingBox();
  const last = await sections(page).getByRole('tab', { name: 'Плагины' }).boundingBox();
  expect(col!.y + col!.height - (last!.y + last!.height)).toBeLessThan(20);
  await expect(s.locator('h1')).toHaveText('Основные');
  expect(await s.locator('h1').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Yeseva');
  // the dim over everything, the sidebar's rail too
  const dim = await page.locator('.dim').first().boundingBox();
  expect(dim).toEqual({ x: 0, y: 0, width: 1400, height: 860 });
  const hit = await page.evaluate(() => document.elementFromPoint(20, 400)?.className);
  expect(String(hit)).toContain('dim');
  // the chosen row
  await expect(sections(page).getByRole('tab', { name: 'Основные' })).toHaveAttribute('aria-selected', 'true');
});

test('⌘] ⌘[ and ↑↓ go over the sections (not «Файлы», not made); ⎋ and «Готово» close', async ({ page }) => {
  await open(page);
  const s = sheet(page);
  await page.keyboard.press('Meta+BracketRight');
  await expect(s.locator('h1')).toHaveText('Сегодня');
  await page.keyboard.press('Meta+BracketLeft');
  await page.keyboard.press('Meta+BracketLeft');
  await expect(s.locator('h1')).toHaveText('Плагины');
  await sections(page).getByRole('tab', { name: 'Inbox' }).click();
  await page.keyboard.press('ArrowDown');
  await expect(s.locator('h1')).toHaveText('Мини-окно'); // «Файлы» passed by
  await expect(sections(page).getByRole('tab', { name: 'Мини-окно' })).toBeFocused();
  await expect(s.locator('header .t2')).toHaveText('Мини-окно');
  await page.keyboard.press('Escape');
  await expect(s).toHaveCount(0);
  await page.keyboard.press('Meta+,');
  await expect(s.locator('h1')).toHaveText('Мини-окно'); // the section kept
  await s.getByRole('button', { name: 'Готово' }).click();
  await expect(s).toHaveCount(0);
});

test('a narrow window: the sections in a strip on top', async ({ page }) => {
  await open(page, 760);
  const col = await sections(page).boundingBox();
  const content = await sheet(page).locator('.content').boundingBox();
  expect(col!.y + col!.height).toBeLessThanOrEqual(content!.y + 1);
  expect(col!.width).toBeGreaterThan(500);
  await expect(sheet(page).locator('.live')).toBeHidden();
});
