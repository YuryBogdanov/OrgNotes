import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet } from './tauriMock';

// ТЗ 26, roadmap 1.1: the example plugin «Привет» — built only on the API — adds a command with its keys, a section
// of the navigator, a kind of tab and a section of the settings; its edit is one step of ⌘Z. Off by default.

const WORK = '/mock/Work.org';
const FILES = { [WORK]: '* TODO Подготовить бюджет\n* TODO Позвонить\n* DONE Старое\n', '/mock/Дом.org': '* Покупки\n' };
const disk = (page: Page) => page.evaluate(() => (window as any).__disk as Record<string, string>);
const modes = (page: Page) => page.getByRole('tablist', { name: 'Режимы навигатора' });
const toast = (page: Page) => page.locator('.toast');

async function open(page: Page, on: boolean) {
  await page.setViewportSize({ width: 1440, height: 900 });
  if (on) await page.addInitScript(() => localStorage.setItem('plugins:enabled', JSON.stringify({ hello: true })));
  await installTauriMock(page, FILES);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
}

test('off by default: no section, no commands', async ({ page }) => {
  await open(page, false);
  await expect(modes(page).getByRole('tab', { name: 'Привет' })).toHaveCount(0);
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('Привет');
  await expect(page.getByRole('dialog', { name: 'Командная палитра' })).not.toContainText('Привет: поздороваться');
});

test('the command with its keys asks the index; the board keeps its state; its edit goes with ⌘Z', async ({ page }) => {
  await open(page, true);
  await page.keyboard.press('Control+Meta+h');
  await expect(toast(page)).toContainText('Привет! Открытых задач: 2.');
  await toast(page).getByRole('button', { name: 'Доска' }).click();
  const tab = page.locator('section.pane.active .tab.on');
  await expect(tab).toContainText('Доска');
  const board = page.locator('.hello-board');
  await expect(board.locator('.hello-first')).toHaveText('Первая открытая задача: Подготовить бюджет');
  await board.getByRole('button', { name: 'Нажать' }).click();
  await board.getByRole('button', { name: 'Нажать' }).click();
  await expect(board.locator('.hello-count')).toHaveText('Нажатий: 2');
  await expect(tab).toContainText('Доска · 2');
  // a transaction of the plugin: written, the board follows the file; ⌘Z takes it back
  await board.getByRole('button', { name: 'Отметить первую выполненной' }).click();
  await expect.poll(async () => (await disk(page))[WORK]).toContain('* DONE Подготовить бюджет');
  await expect(board.locator('.hello-first')).toHaveText('Первая открытая задача: Позвонить');
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => (await disk(page))[WORK]).toContain('* TODO Подготовить бюджет');
  // the state is kept with the layout
  await page.reload();
  await expect(page.locator('.hello-board .hello-count')).toHaveText('Нажатий: 2');
});

test('the section of the navigator (⌃⌘7) lists the files; a click opens one', async ({ page }) => {
  await open(page, true);
  await page.keyboard.press('Control+Meta+7');
  await expect(modes(page).getByRole('tab', { name: 'Привет' })).toHaveAttribute('aria-selected', 'true');
  const nav = page.locator('.hello-files');
  await expect(nav.getByRole('button')).toHaveText(['Дом', 'Work']); // as the index has them
  await nav.getByRole('button', { name: 'Дом' }).click();
  await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('Дом');
});

test('the settings by the manifest: the folder\'s in its file, this Mac\'s local; «Клавиши» and the palette know its commands', async ({ page }) => {
  await open(page, true);
  await openSettingsSheet(page, 'Привет');
  const s = page.getByRole('dialog', { name: 'Настройки' });
  await expect(s.getByLabel('Слово приветствия')).toHaveValue('Привет');
  await s.getByLabel('Слово приветствия').fill('Здравствуйте');
  await s.getByLabel('Слово приветствия').press('Tab');
  await s.getByRole('switch', { name: 'Считать открытые задачи' }).click();
  await expect.poll(async () => JSON.parse((await disk(page))['/mock/.orgnotes/plugins/hello.json'] ?? 'null')).toEqual({ settings: { greeting: 'Здравствуйте' } });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('feature:hello') ?? 'null'))).toEqual({ settings: { count: false } });
  await s.getByRole('tab', { name: 'Клавиши' }).click();
  await expect(s.getByText('ПРИВЕТ', { exact: true })).toBeVisible();
  await expect(s.locator('.row', { hasText: 'Привет: поздороваться' })).toContainText('⌃⌘H');
  await s.getByRole('button', { name: 'Готово' }).click();
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('поздороваться');
  await page.keyboard.press('Enter');
  await expect(toast(page).locator('span').first()).toHaveText('Здравствуйте!'); // no count: switched off
});
