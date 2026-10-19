import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 50.5: a block's summary (`setSummary`, API 1.15) — «Долгие дела» give how many are due, red, in their row of
// the compact day (with no screen open) and as the number of the screen's contents; fix #311: every plugin's block
// has its row in the screen's order, one without a summary with «›» (a block its plugin hides has none).

const NOW = new Date(2026, 9, 16, 11);
const MID = ['* TODO Квартальный план команды', '* TODO Регламент дежурств', ''].join('\n');
const panel = (page: Page) => page.getByRole('region', { name: 'Панель: Сегодня' });
async function open(page: Page, touched: Date) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript((m) => { (window as any).__mtimeInit = m; localStorage.setItem('ui:next', '1'); }, { '/mock/Midterm.org': touched.getTime() });
  await openApp(page, { files: { '/mock/Midterm.org': MID }, now: NOW, ready: false, viewport: { width: 1440, height: 820 } });
  await expect(page.getByRole('tree', { name: 'Файлы' })).toBeVisible(); // the window up before its key
  await page.keyboard.press('Shift+Meta+h');
  await expect(panel(page)).toBeVisible();
}

test('due matters: «Долгие дела» with their number, red; a block without a summary — its name and «›»', async ({ page }) => {
  await open(page, new Date(2026, 8, 1));
  const g = panel(page).locator('.plugrow', { hasText: 'Долгие дела' });
  await expect(g.locator('.sum')).toHaveText('2');
  await expect(g.locator('.sum')).toHaveClass(/alert/);
  // the screen's contents: the same number
  await page.keyboard.press('Shift+Meta+h');
  const row = panel(page).getByRole('navigation', { name: 'На экране' }).locator('.trow', { hasText: 'Долгие дела' });
  await expect(row.locator('.tc')).toHaveText('2');
  await expect(row.locator('.tc')).toHaveClass(/alert/);
});

test('nothing due: the block hidden by its plugin — no row; an empty day says so', async ({ page }) => {
  await open(page, new Date(2026, 9, 14));
  // nothing on the day at all: the word in the middle, «Полная версия» once
  await expect(panel(page).locator('.empty')).toContainText('На сегодня ничего не запланировано');
  await expect(panel(page).getByRole('button', { name: 'Полная версия' })).toHaveCount(1);
  await expect(panel(page).locator('.plugrow', { hasText: 'Долгие дела' })).toHaveCount(0);
});
