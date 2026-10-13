import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet, pluginsReady } from './tauriMock';
import { FILES, NOW } from './calendarFixture';

// ТЗ 29 (roadmap 3.2 B): the calendar is the built-in plugin «calendar». Its settings of before (flat, in its file and
// on this Mac), the layers and the hidden files, a changed shortcut and a calendar tab of a saved layout move to it;
// turned off, the agenda and the month under the Inbox review's card stay.

const disk = (page: Page) => page.evaluate(() => (window as any).__disk as Record<string, string>);
const modes = (page: Page) => page.getByRole('tablist', { name: 'Режимы навигатора' });
const panel = (page: Page) => page.getByRole('group', { name: 'Открыть в панели' });
const cal = (page: Page) => page.locator('section.pane.active .cal');
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Настройки' });

async function open(page: Page, files: Record<string, string>, init: Record<string, string> = {}, ready = '.cm-content') {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((kv) => { if (!localStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); localStorage.setItem('__seeded', '1'); } }, init);
  await installTauriMock(page, files);
  await page.goto('/');
  await expect(page.locator(ready).first()).toBeVisible();
  await pluginsReady(page);
}

test('the old settings, layers, hidden files, a shortcut and a calendar tab are the plugin\'s; a change writes its shape', async ({ page }) => {
  await open(page, { ...FILES(), '/mock/.orgnotes/config.json': JSON.stringify({ version: 1, inbox: { file: 'inbox.org' } }), '/mock/.orgnotes/plugins/calendar.json': JSON.stringify({ taskHeading: 'Календарь', last: { task: 'finance.org', event: null } }) }, {
    'feature:calendar': JSON.stringify({ weekends: false }),
    'cal:layers': JSON.stringify(['task', 'deadline']),
    'cal:hidden': JSON.stringify({ '/mock': ['inbox.org'] }),
    keys: JSON.stringify({ preset: 'emacs', overrides: { calendar: ['⌥⌘3'] } }),
    'layout:/mock': JSON.stringify({ panes: [{ tabs: [{ kind: 'calendar', data: { view: 'month', date: '2026-10-12' } }], active: 0 }], active: 0 }),
  }, '.cal');
  // the tab of the layout is the plugin's view, its settings and layers as they were
  await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('Календарь');
  await expect(cal(page).locator('.wd span')).toHaveText(['Пн', 'Вт', 'Ср', 'Чт', 'Пт']);
  await page.keyboard.press('Control+Meta+5');
  await expect(page.getByRole('checkbox', { name: 'События' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'inbox' })).not.toBeChecked();
  // the shortcut changed for «Календарь» follows it
  await page.locator('section.pane.active .tab.on .x').click({ force: true });
  await page.keyboard.press('Alt+Meta+3');
  await expect(cal(page)).toBeVisible();
  // a change writes the plugin's shape: the folder's settings and data, this Mac's
  await openSettingsSheet(page, 'Календарь');
  await expect(sheet(page).getByLabel('Заголовок для задач')).toHaveValue('Календарь');
  await sheet(page).getByRole('switch', { name: 'Номера недель' }).click();
  await sheet(page).getByLabel('Длительность события').selectOption('90');
  await expect.poll(async () => JSON.parse((await disk(page))['/mock/.orgnotes/plugins/calendar.json'])).toEqual({ settings: { taskHeading: 'Календарь', minutes: 90 }, data: { last: { task: 'finance.org', event: null } } });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('feature:calendar') ?? 'null'))).toEqual({
    settings: { weekends: false, weekNumbers: false }, data: { layers: ['task', 'deadline'], hidden: { '/mock': ['inbox.org'] } },
  });
});

test('turned off: no tab, no section, no button, no settings; the agenda and the month under a review\'s card stay; on again — back', async ({ page }) => {
  await open(page, { ...FILES(), '/mock/.orgnotes/config.json': JSON.stringify({ version: 1, inbox: { file: 'inbox.org' } }) });
  await expect(panel(page).getByRole('button', { name: 'Календарь' })).toBeVisible();
  await openSettingsSheet(page, 'Плагины');
  const card = sheet(page).getByRole('group', { name: 'Календарь' });
  await expect(card).toContainText('встроенный');
  await card.getByRole('switch').click();
  await expect(sheet(page).getByRole('tab', { name: 'Календарь' })).toHaveCount(0);
  await sheet(page).getByRole('button', { name: 'Готово' }).click();
  await expect(modes(page).getByRole('tab', { name: 'Календарь' })).toHaveCount(0);
  await expect(panel(page).getByRole('button', { name: 'Календарь' })).toHaveCount(0);
  await page.keyboard.press('Meta+3');
  await expect(page.locator('.cal')).toHaveCount(0);
  // the agenda works; the month under the Inbox review's card is the core's
  await panel(page).getByRole('button', { name: 'Агенда' }).click();
  await expect(page.locator('section.pane').nth(1).locator('.tab.on')).toContainText('Агенда');
  await page.keyboard.press('Shift+Meta+r');
  await page.locator('.rcal .toggle').click();
  await expect(page.getByRole('region', { name: 'Календарь' })).toContainText('Показываются запланированные задачи');
  // on again
  await openSettingsSheet(page, 'Плагины');
  await card.getByRole('switch').click();
  await sheet(page).getByRole('button', { name: 'Готово' }).click();
  await panel(page).getByRole('button', { name: 'Календарь' }).click(); // ⌘3 is «Перенести…» in the review shown
  await expect(page.locator('.cal')).toBeVisible();
});
