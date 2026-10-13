import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet, pluginsReady } from './tauriMock';

// ТЗ 29 §1 (roadmap 3.2 A): what the calendar needs of the core, shown by «Привет»: a view's button in «Открыть в
// панели» after the core's (the second pane, or out of it), the view's own inspector, the Inbox's «в начало / в конец».

const FILES = {
  '/mock/Work.org': '* TODO Подготовить бюджет\n',
  '/mock/inbox.org': '',
  '/mock/.orgnotes/config.json': JSON.stringify({ version: 1, inbox: { file: 'inbox.org', add: 'end' } }),
};
const group = (page: Page) => page.getByRole('group', { name: 'Открыть в панели' });
const insp = (page: Page) => page.locator('.insp');

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('plugins:enabled', JSON.stringify({ hello: true })));
  await installTauriMock(page, FILES);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await pluginsReady(page);
}

test('the view\'s button after the core\'s: the board in the second pane with its inspector, out again; gone with the plugin', async ({ page }) => {
  await open(page);
  expect(await group(page).getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Второй редактор', 'Агенда', 'Календарь', 'Доска']);
  await group(page).getByRole('button', { name: 'Доска' }).click();
  await expect(group(page).getByRole('button', { name: 'Доска' })).toHaveAttribute('aria-pressed', 'true');
  const second = page.locator('section.pane').nth(1);
  await expect(second.locator('.tab.on')).toContainText('Доска');
  // its inspector, following its state
  await expect(insp(page).locator('.hello-insp')).toContainText('Нажатий на доске: 0');
  await second.getByRole('button', { name: 'Нажать' }).click();
  await expect(insp(page).locator('.hello-insp')).toContainText('Нажатий на доске: 1');
  // a file tab: the file's inspector again
  await page.locator('section.pane').first().locator('.cm-content').click();
  await expect(insp(page).locator('.hello-insp')).toHaveCount(0);
  await expect(insp(page).getByRole('tablist', { name: 'Инспектор' })).toBeVisible();
  // pressed again: out of the second pane
  await expect(group(page).getByRole('button', { name: 'Доска' })).toHaveAttribute('aria-pressed', 'true');
  await group(page).getByRole('button', { name: 'Доска' }).click();
  await expect(page.locator('section.pane')).toHaveCount(1);
  // the plugin off: no button
  await openSettingsSheet(page, 'Плагины');
  await page.getByRole('dialog', { name: 'Настройки' }).getByRole('group', { name: 'Привет' }).getByRole('switch').click();
  await page.getByRole('dialog', { name: 'Настройки' }).getByRole('button', { name: 'Готово' }).click();
  await expect(group(page).getByRole('button', { name: 'Доска' })).toHaveCount(0);
});

test('the Inbox file tells where a new task goes', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Shift+Meta+p');
  await page.getByRole('dialog', { name: 'Командная палитра' }).getByRole('combobox').fill('Привет: про Inbox');
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toContainText('Inbox: inbox.org · новые в конец');
});
