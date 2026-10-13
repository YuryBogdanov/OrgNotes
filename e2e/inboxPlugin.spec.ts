import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet } from './tauriMock';
import { FILES } from './reviewFixture';

// ТЗ 28 (roadmap 3.1 B): the Inbox and its review are the built-in plugin «inbox». Its settings of config.json, the
// shortcuts changed and the navigator's mode move to it; turned off, the quick entry still writes to the Inbox file.

const IB = '/mock/inbox.org';
const disk = (page: Page) => page.evaluate(() => (window as any).__disk as Record<string, string>);
const modes = (page: Page) => page.getByRole('tablist', { name: 'Режимы навигатора' });
const panel = (page: Page) => page.locator('.inbox');
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Настройки' });

async function open(page: Page, files: Record<string, string>, init: Record<string, string> = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((kv) => { if (!localStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); localStorage.setItem('__seeded', '1'); } }, init);
  await installTauriMock(page, files);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
}

test('the old settings of config.json, a changed shortcut and the mode are the plugin\'s; a change moves the settings', async ({ page }) => {
  await open(page, FILES({ order: 'file', counter: false, stale: 14, reviewOrder: 'new', add: 'end' }), {
    'nav:mode': 'inbox',
    keys: JSON.stringify({ preset: 'emacs', overrides: { review: ['⌃⌥⌘R'], reviewDone: ['⌘D'] } }),
  });
  // the mode: the Inbox section, its list as in the file, no count on its button
  await expect(modes(page).getByRole('tab', { name: 'Inbox' })).toHaveAttribute('aria-selected', 'true');
  await expect(panel(page).locator('.row .t').first()).toHaveText('Купить батарейки для мыши');
  await expect(modes(page).locator('.badge')).toHaveCount(0);
  // the review: newest first, the shortcuts as they were changed
  await page.keyboard.press('Control+Alt+Meta+r');
  await expect(page.locator('.review .card .k')).toHaveText('Задача 1 из 5');
  await expect(page.locator('.review .cm-line').first()).toContainText('Купить батарейки');
  await page.keyboard.press('Meta+d');
  await expect.poll(async () => (await disk(page))[IB]).toContain('* DONE Купить батарейки для мыши');
  // the settings show them; a change writes the plugin's file and leaves the core's keys in config.json
  await openSettingsSheet(page, 'Inbox');
  await expect(page.getByLabel('Считать задачу залежавшейся через')).toHaveValue('14');
  await expect(page.getByRole('radio', { name: 'Новые сначала' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('switch', { name: 'Показывать детали под заголовком' }).click();
  await expect.poll(async () => JSON.parse((await disk(page))['/mock/.orgnotes/plugins/inbox.json'] ?? 'null')?.settings).toEqual({ order: 'file', counter: false, stale: 14, reviewOrder: 'new', details: false });
  await expect.poll(async () => JSON.parse((await disk(page))['/mock/.orgnotes/config.json']).inbox).toEqual({ file: 'inbox.org', add: 'end' });
});

test('turned off: no section, no review, no block of settings; ⇧⌘I still writes to the Inbox file; on again — back', async ({ page }) => {
  await open(page, FILES());
  await expect(modes(page).getByRole('tab', { name: 'Inbox' })).toBeVisible();
  await openSettingsSheet(page, 'Плагины');
  const card = sheet(page).getByRole('group', { name: 'Inbox' });
  await expect(card).toContainText('встроенный');
  await card.getByRole('switch').click();
  await sheet(page).getByRole('tab', { name: 'Inbox' }).click();
  await expect(sheet(page)).toContainText('БЫСТРЫЙ ВВОД');
  await expect(sheet(page)).not.toContainText('РАЗБОР');
  await sheet(page).getByRole('button', { name: 'Готово' }).click();
  await expect(modes(page).getByRole('tab', { name: 'Inbox' })).toHaveCount(0);
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('разобрать inbox');
  await expect(page.getByRole('dialog', { name: 'Командная палитра' })).not.toContainText('Разобрать Inbox');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+Meta+i');
  await page.keyboard.type('Без раздела');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await disk(page))[IB]).toContain('* TODO Без раздела');
  await openSettingsSheet(page, 'Плагины');
  await card.getByRole('switch').click();
  await sheet(page).getByRole('button', { name: 'Готово' }).click();
  await page.keyboard.press('Control+Meta+2');
  await expect(panel(page).locator('.title')).toHaveText('INBOX · 7');
});
