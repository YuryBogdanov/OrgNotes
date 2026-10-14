import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet, pluginsReady } from './tauriMock';

// ТЗ 26 §4, §7 (roadmap 1.2): installed plugins from the app's folder of plugins — listed off, turned on and off at
// once, a broken or incompatible one says why and leaves the others working; «Перезагрузить плагины»; a tab of a
// plugin that is off offers «Включить».

const JIRA = '/config/plugins/jira';
const manifest = (o: object = {}) => JSON.stringify({
  id: 'jira', name: 'Jira', version: '0.3.0', description: 'Задачи из Jira', author: 'Команда', api: '^1.0',
  permissions: ['index.read'], contributes: { commands: [{ id: 'jira.ping', title: 'Jira: проверить связь', keys: ['⌃⌥⌘J'] }] }, ...o,
});
const MAIN = "export default { activate(ctx) { ctx.commands.on('jira.ping', async () => ctx.ui.notify('Jira: на связи, задач ' + (await ctx.index.query({ conds: [{ field: 'done', op: 'no' }] })).length)); } };";
const FILES = { '/mock/Work.org': '* TODO Бюджет\n* TODO Отчёт\n' };
const toast = (page: Page) => page.locator('.toast');
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Настройки' });
const card = (page: Page, name: string) => sheet(page).getByRole('group', { name });

// a plugin let in with these rights (as the sheet «Включить плагин» does)
const TRUSTED = { jira: JSON.stringify([['index.read'], []]) };
async function open(page: Page, files: Record<string, string>, enabled: Record<string, boolean> = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(([e, t]) => {
    if (!localStorage.getItem('plugins:enabled')) localStorage.setItem('plugins:enabled', JSON.stringify(e));
    if (Object.keys(e).length && !localStorage.getItem('plugins:trusted')) localStorage.setItem('plugins:trusted', JSON.stringify(t));
  }, [enabled, TRUSTED] as const);
  await installTauriMock(page, { ...FILES, ...files });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
}
async function ping(page: Page) {
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('проверить связь');
}

test('an installed plugin comes in off; on at once: its command in the palette and «Клавиши»; off at once', async ({ page }) => {
  await open(page, { [JIRA + '/manifest.json']: manifest(), [JIRA + '/main.js']: MAIN });
  await openSettingsSheet(page, 'Плагины');
  const jira = card(page, 'Jira');
  await expect(jira).toContainText('Задачи из Jira');
  await expect(jira).toContainText('Чтение заметок');
  await expect(jira.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await expect(card(page, 'Привет')).toContainText('встроенный');
  await jira.getByRole('switch').click();
  // first time: what it gets, and that it is trusted fully
  const ask = page.getByRole('alertdialog', { name: 'Включить плагин «Jira»' });
  await expect(ask).toContainText('получит доступ: чтение заметок');
  await expect(ask).toContainText('не от намеренно вредного кода');
  await ask.getByRole('button', { name: 'Включить' }).click();
  await expect(jira.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await sheet(page).getByRole('tab', { name: 'Клавиши' }).click();
  await expect(sheet(page).locator('.row', { hasText: 'Jira: проверить связь' })).toContainText('⌃⌥⌘J');
  await sheet(page).getByRole('button', { name: 'Готово' }).click();
  await page.keyboard.press('Control+Alt+Meta+j');
  await expect(toast(page)).toContainText('Jira: на связи, задач 2');
  // after a restart: on, its keys at once (declared from the list kept on this Mac)
  await page.reload();
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.keyboard.press('Control+Alt+Meta+j');
  await expect(toast(page)).toContainText('Jira: на связи');
  // off: the command goes
  await openSettingsSheet(page, 'Плагины');
  await card(page, 'Jira').getByRole('switch').click();
  await sheet(page).getByRole('button', { name: 'Готово' }).click();
  await ping(page);
  await expect(page.getByRole('dialog', { name: 'Командная палитра' })).not.toContainText('Jira: проверить связь');
});

test('a broken plugin is off with its reason, the others work; an incompatible or wrong one cannot be turned on', async ({ page }) => {
  await open(page, {
    [JIRA + '/manifest.json']: manifest(), [JIRA + '/main.js']: "export default { activate() { throw new Error('нет токена'); } };",
    '/config/plugins/new-api/manifest.json': manifest({ id: 'new-api', name: 'Из будущего', api: '^2.0', contributes: {} }),
    '/config/plugins/bad/manifest.json': '{ "id": "bad"',
    '/config/plugins/empty/readme.txt': 'нет манифеста',
  }, { jira: true, hello: true });
  await expect(toast(page)).toContainText('Плагин «Jira» выключен: нет токена');
  await pluginsReady(page); // the others started
  await page.keyboard.press('Control+Meta+h'); // «Привет» works
  await expect(toast(page)).toContainText('Привет!');
  await openSettingsSheet(page, 'Плагины');
  await expect(card(page, 'Jira').getByRole('alert')).toContainText('Выключен после ошибки: нет токена');
  await card(page, 'Jira').getByRole('button', { name: 'Подробнее' }).click();
  await expect(card(page, 'Jira').locator('.stack')).toContainText('нет токена');
  await expect(card(page, 'Из будущего')).toContainText('нужно API 2.0, в приложении 1.9.0');
  await expect(card(page, 'Из будущего').getByRole('switch')).toBeDisabled();
  await expect(card(page, 'bad')).toContainText('manifest.json — не JSON');
  await expect(card(page, 'empty')).toContainText('в папке нет manifest.json');
  // fixed on disk: «Перезагрузить плагины» starts it again
  await page.evaluate((p) => ((window as any).__disk[p] = "export default { activate(ctx) { ctx.commands.on('jira.ping', () => ctx.ui.notify('Jira: исправлено')); } };"), JIRA + '/main.js');
  await sheet(page).getByRole('button', { name: 'Перезагрузить плагины' }).click();
  await expect(card(page, 'Jira').getByRole('alert')).toHaveCount(0);
  await sheet(page).getByRole('button', { name: 'Готово' }).click();
  await page.keyboard.press('Control+Alt+Meta+j');
  await expect(toast(page)).toContainText('Jira: исправлено');
});

test('«Перезагрузить плагины» finds a new folder; a built-in plugin on and off at once; its tab offers «Включить»', async ({ page }) => {
  await open(page, {});
  await openSettingsSheet(page, 'Плагины');
  await expect(sheet(page)).toContainText('Плагинов пока нет');
  await page.evaluate(([p, m, c]) => {
    (window as any).__disk[p + '/manifest.json'] = m;
    (window as any).__disk[p + '/main.js'] = c;
  }, [JIRA, manifest(), MAIN]);
  await sheet(page).getByRole('button', { name: 'Перезагрузить плагины' }).click();
  await expect(card(page, 'Jira').getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  // «Привет» on: its section comes without a restart
  await card(page, 'Привет').getByRole('switch').click();
  await sheet(page).getByRole('button', { name: 'Готово' }).click();
  const modes = page.getByRole('tablist', { name: 'Режимы навигатора' });
  await expect(modes.getByRole('tab', { name: 'Привет' })).toBeVisible();
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('привет: доска');
  await expect(page.getByRole('dialog', { name: 'Командная палитра' })).toContainText('Привет: доска'); // once its code runs
  await page.keyboard.press('Enter');
  await expect(page.locator('.hello-board')).toBeVisible();
  // off: the section goes, the tab stays as a placeholder with «Включить»
  await openSettingsSheet(page, 'Плагины');
  await card(page, 'Привет').getByRole('switch').click();
  await sheet(page).getByRole('button', { name: 'Готово' }).click();
  await expect(modes.getByRole('tab', { name: 'Привет' })).toHaveCount(0);
  const off = page.locator('section.pane.active .content.off');
  await expect(off).toContainText('Плагин «Привет» выключен');
  await off.getByRole('button', { name: 'Включить' }).click();
  await expect(page.locator('.hello-board')).toBeVisible();
});
