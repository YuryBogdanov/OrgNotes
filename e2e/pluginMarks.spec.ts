import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet, pluginsReady } from './tauriMock';
import { settingsSheet as sheet } from './helpers';

// The mockups of ТЗ 37: the settings in three groups — what comes with Panopticon, «ПЛАГИНЫ», «НАСТРОЙКИ ПЛАГИНОВ»
// (a plugin's section with its head); in the palette a plugin's command has a purple mark and its plugin's name.

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('plugins:updatesChecked', String(Date.now())));
  await installTauriMock(page, { '/mock/work.org': '* TODO A\n' });
  await page.goto('/');
  await pluginsReady(page);
}

test('the settings: the app\'s sections, then «ПЛАГИНЫ», then «НАСТРОЙКИ ПЛАГИНОВ» with the plugins\' own; a plugin\'s section has its head', async ({ page }) => {
  await open(page);
  await openSettingsSheet(page, 'Плагины');
  const side = sheet(page).getByRole('tablist', { name: 'Разделы настроек' });
  const order = await side.locator('.shead, [role=tab]').allInnerTexts();
  const iPl = order.indexOf('ПЛАГИНЫ');
  const iSet = order.indexOf('НАСТРОЙКИ ПЛАГИНОВ');
  expect(order.slice(0, iPl)).toEqual(expect.arrayContaining(['Основные', 'Сегодня', 'Оформление', 'Статусы', 'Агенды', 'Inbox', 'Клавиши', 'Мини-окно']));
  expect(order[iPl + 1]).toBe('Плагины');
  expect(iSet).toBe(iPl + 2);
  expect(order.slice(iSet + 1)).toEqual(['Календарь', 'Канбан']); // the built-in plugins' sections that are on, by name
  // the gear of a plugin in the list opens its section
  await sheet(page).getByRole('button', { name: 'Настройки плагина Канбан' }).click();
  await expect(side.getByRole('tab', { name: 'Канбан' })).toHaveAttribute('aria-selected', 'true');
  const head = sheet(page).getByRole('group', { name: 'Плагин «Канбан»' });
  await expect(head).toContainText('1.0.0 · Panopticon');
  await expect(head).toContainText('Права: чтение заметок, правка заметок');
  await expect(head.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await head.getByRole('button', { name: '‹ Плагины' }).click();
  await expect(side.getByRole('tab', { name: 'Плагины' })).toHaveAttribute('aria-selected', 'true');
});

test('the palette: a plugin\'s command has a purple mark and its plugin\'s name; the app\'s own have none', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('календарь');
  const cal = page.getByRole('option', { name: /^Календарь, плагин «Календарь»/ });
  await expect(cal.locator('.plug')).toHaveText('Календарь');
  await expect(cal.locator('.pm')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('новая задача');
  const task = page.getByRole('option', { name: /^Новая задача/ });
  await expect(task).toBeVisible();
  await expect(task.locator('.plug')).toHaveCount(0);
  await expect(task.locator('.pm')).toHaveCount(0);
});
