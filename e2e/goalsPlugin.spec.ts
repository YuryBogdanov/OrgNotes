import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet } from './tauriMock';
import { CONFIG, FILES, NOW } from './goalsFixture';

// ТЗ 27 (roadmap 2.1 B2): the goals of the quarter are the built-in plugin «quarter-goals». What the core kept under
// the old id moves to it (the sources' file, the thresholds, a tab of the layout, a changed shortcut, the navigator's
// mode); turned off, nothing of it is left and the files are plain Org.

const { goals: SOURCES, ...REST } = CONFIG;
const disk = (page: Page) => page.evaluate(() => (window as any).__disk as Record<string, string>);
const nav = (page: Page) => page.getByRole('navigation', { name: 'Цели' });
const modes = (page: Page) => page.getByRole('tablist', { name: 'Режимы навигатора' });

async function open(page: Page, files: Record<string, string>, init: Record<string, string> = {}, ready = '.cm-content') {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((kv) => { if (!localStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); localStorage.setItem('__seeded', '1'); } }, init);
  await installTauriMock(page, files);
  await page.goto('/');
  await expect(page.locator(ready).first()).toBeVisible();
}

test('the old place is read: the sources of goals.json, the thresholds, the tab, the shortcut, the mode; a change moves them', async ({ page }) => {
  await open(page, { ...FILES(REST), '/mock/.orgnotes/plugins/goals.json': JSON.stringify({ sources: SOURCES }) }, {
    'feature:goals': JSON.stringify({ silent: 21, soon: 8 }),
    'nav:mode': 'goals',
    keys: JSON.stringify({ preset: 'emacs', overrides: { navGoals: ['⌃⌥⌘G'] } }),
    'layout:/mock': JSON.stringify({ panes: [{ tabs: [{ kind: 'goals', data: '*' }], active: 0 }], active: 0 }),
  }, '.toolbar'); // only the goals' tab in the layout: no editor
  // the mode and the tab of the overview are the plugin's now
  await expect(modes(page).getByRole('tab', { name: 'Цели' })).toHaveAttribute('aria-selected', 'true');
  await expect(nav(page).locator('.mine')).toContainText('Мои цели');
  await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('Обзор квартала');
  await expect(page.locator('section.pane.active .goals h1')).toHaveText('Обзор квартала');
  // the thresholds: 21 days
  await openSettingsSheet(page, 'Агенды');
  await expect(page.getByLabel('Цель «молчит» через')).toHaveValue('21');
  // the shortcut changed for «Навигатор: цели» follows it
  await page.getByRole('dialog', { name: 'Настройки' }).getByRole('tab', { name: 'Клавиши' }).click();
  await expect(page.getByRole('dialog', { name: 'Настройки' }).locator('.row', { hasText: 'Навигатор: цели' })).toContainText('⌃⌥⌘G');
  await page.keyboard.press('Escape');
  // a change of the sources writes the plugin's file
  await nav(page).getByRole('button', { name: /Смирнов Олег/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Удалить из целей' }).click();
  await expect.poll(async () => JSON.parse((await disk(page))['/mock/.orgnotes/plugins/quarter-goals.json'] ?? 'null')?.data?.sources?.length).toBe(3);
});

test('the sources still in config.json (before 0.6) are read too and leave it on the first change', async ({ page }) => {
  await open(page, FILES(CONFIG));
  await page.keyboard.press('Control+Meta+4');
  await expect(nav(page).getByRole('button', { name: /Смирнов Олег/ })).toBeVisible();
  await nav(page).getByRole('button', { name: /Смирнов Олег/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Удалить из целей' }).click();
  await expect.poll(async () => JSON.parse((await disk(page))['/mock/.orgnotes/config.json']).goals).toBeUndefined();
});

test('turned off: no section, no commands, no block of settings; on again — back', async ({ page }) => {
  await open(page, FILES(CONFIG));
  await expect(modes(page).getByRole('tab', { name: 'Цели' })).toBeVisible();
  await openSettingsSheet(page, 'Плагины');
  const card = page.getByRole('dialog', { name: 'Настройки' }).getByRole('group', { name: 'Цели квартала' });
  await expect(card).toContainText('встроенный');
  await card.getByRole('switch').click();
  await page.getByRole('dialog', { name: 'Настройки' }).getByRole('tab', { name: 'Агенды' }).click();
  await expect(page.getByRole('dialog', { name: 'Настройки' })).not.toContainText('ЦЕЛИ КВАРТАЛА');
  await page.getByRole('dialog', { name: 'Настройки' }).getByRole('button', { name: 'Готово' }).click();
  await expect(modes(page).getByRole('tab', { name: 'Цели' })).toHaveCount(0);
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('новая цель');
  await expect(page.getByRole('dialog', { name: 'Командная палитра' })).not.toContainText('Новая цель…');
  await page.keyboard.press('Escape');
  await openSettingsSheet(page, 'Плагины');
  await card.getByRole('switch').click();
  await page.getByRole('dialog', { name: 'Настройки' }).getByRole('button', { name: 'Готово' }).click();
  await page.keyboard.press('Control+Meta+4');
  await expect(nav(page).locator('.mine')).toContainText('Мои цели');
});
