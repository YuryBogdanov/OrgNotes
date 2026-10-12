import { expect, test, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { installTauriMock, openSettingsSheet } from './tauriMock';

// Roadmap 2.3: the template of a plugin (templates/plugin) is built as its README says, put into the folder of
// plugins and works — TypeScript and Svelte bundled into one main.js, a command, a section, a setting.

let main = '';
let manifest = '';
test.beforeAll(() => {
  execSync('npx vite build --config templates/plugin/vite.config.js', { stdio: 'pipe' });
  main = readFileSync('templates/plugin/dist/main.js', 'utf8');
  manifest = readFileSync('templates/plugin/dist/manifest.json', 'utf8');
});

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Настройки' });

test('the built template comes in, is let in and works: its command, its section on Svelte, its setting', async ({ page }) => {
  expect(main).not.toMatch(/^import /m); // one module, nothing to import at run time
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, {
    '/mock/Work.org': '* TODO Подготовить бюджет\n* DONE Старое\n* TODO Позвонить\n',
    '/config/plugins/example/manifest.json': manifest,
    '/config/plugins/example/main.js': main,
  });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await openSettingsSheet(page, 'Плагины');
  await sheet(page).getByRole('group', { name: 'Пример' }).getByRole('switch').click();
  await page.getByRole('alertdialog', { name: 'Включить плагин «Пример»' }).getByRole('button', { name: 'Включить' }).click();
  // its setting
  await sheet(page).getByRole('tab', { name: 'Пример', exact: true }).click();
  await sheet(page).getByLabel('Слово в разделе').fill('дел');
  await sheet(page).getByLabel('Слово в разделе').press('Tab');
  await sheet(page).getByRole('button', { name: 'Готово' }).click();
  // its command
  await page.keyboard.press('Control+Alt+Meta+e');
  await expect(page.locator('.toast')).toContainText('Открытых задач: 2');
  // its section (Svelte): the open tasks; a click shows one
  await page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Пример' }).click();
  const panel = page.locator('.example');
  await expect(panel.locator('h3')).toHaveText('Открытых дел: 2');
  await expect(panel.getByRole('button')).toHaveText(['TODO Подготовить бюджет', 'TODO Позвонить']);
  await panel.getByRole('button', { name: 'TODO Позвонить' }).click();
  await expect(page.locator('section.pane.active .status')).toContainText('Стр. 3');
});
