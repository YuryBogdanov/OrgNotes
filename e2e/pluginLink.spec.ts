import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet, pluginsReady } from './tauriMock';

// ТЗ 37, PR C: «Установить по ссылке…» — a git repository of the organisation: its newest tag or its branch, the
// plugin found there (rights, fits), installed with the link kept for its updates; errors in words. git is the mock's.

const OKR = 'git@git.company.local:team/panopticon-okr.git';
const man = (version: string, o: object = {}) => JSON.stringify({
  id: 'okr', name: 'OKR команды', version, api: '^1.8', permissions: ['index.read', 'files.edit', 'net'], net: ['okr.company.local'],
  contributes: { commands: [{ id: 'okr.ping', title: 'OKR: проверить' }] }, ...o,
});
const files = (version: string, o: object = {}) => ({ 'manifest.json': man(version, o), 'main.js': `export default { activate(ctx) { ctx.commands.on('okr.ping', () => ctx.ui.notify('okr ${version}')); } };` });
const GIT = {
  [OKR]: {
    refs: { head: 'main', tags: [['v2.1.0-rc1', 'c3'], ['v2.0.1', 'c2'], ['v2.0.0', 'c1']], branches: [['main', 'm9']] },
    refsFor: { 'v2.0.1': files('2.0.1'), main: files('2.2.0-dev') },
  },
  'https://git.company.local/team/old.git': { refs: { head: 'main', tags: [['v1.0.0', 'o1']], branches: [['main', 'o2']] }, refsFor: { 'v1.0.0': { ...files('1.0.0', { id: 'old', name: 'Старый', minAppVersion: '9.0.0', contributes: { commands: [] } }) } } },
  'https://git.company.local/team/src.git': { refs: { head: 'main', tags: [], branches: [['main', 's1']] }, refsFor: {} },
};
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Настройки' });
const dlg = (page: Page) => page.getByRole('dialog', { name: 'Установка по ссылке' });
const disk = (page: Page, p: string) => page.evaluate((x) => (window as any).__disk[x] as string | undefined, p);
async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((g) => {
    (window as any).__sources = { catalog: { plugins: [], stats: {} }, git: g };
    localStorage.setItem('plugins:updatesChecked', String(Date.now()));
  }, GIT);
  await installTauriMock(page, { '/mock/work.org': '* TODO A\n' });
  await page.goto('/');
  await pluginsReady(page);
  await openSettingsSheet(page, 'Плагины');
  await sheet(page).getByRole('button', { name: 'Каталог плагинов…' }).click();
  await sheet(page).getByRole('button', { name: 'Установить по ссылке…' }).click();
}
async function check(page: Page, url: string) {
  await dlg(page).getByLabel('Ссылка на git-репозиторий').fill(url);
  await dlg(page).getByRole('button', { name: 'Проверить' }).click();
}

test('the newest tag (not a release candidate): the plugin found, its rights; installed and on, its link kept for updates', async ({ page }) => {
  await open(page);
  await expect(dlg(page).getByRole('button', { name: 'Установить' })).toBeDisabled();
  await check(page, OKR);
  await expect(dlg(page).getByRole('radio', { name: 'Последний тег · v2.0.1' })).toHaveAttribute('aria-checked', 'true');
  const found = dlg(page).getByLabel('Найденный плагин');
  await expect(found).toContainText('OKR команды');
  await expect(found).toContainText('v2.0.1 · manifest.json найден');
  await expect(found.locator('.net')).toContainText('okr.company.local');
  await expect(found).toContainText('Подходит вашей версии приложения');
  await expect(dlg(page)).toContainText('Плагин не из каталога');
  await expect(dlg(page).getByRole('checkbox')).toBeChecked();
  await dlg(page).getByRole('button', { name: 'Установить' }).click();
  await expect(dlg(page)).toHaveCount(0);
  await expect(page.locator('.toast').last()).toContainText('«OKR команды» установлен и включён');
  expect(JSON.parse((await disk(page, '/config/plugins/okr/.source.json'))!)).toMatchObject({ kind: 'git', url: OKR, track: 'tag', ref: 'v2.0.1', commit: 'c2', checkUpdates: true });
  await sheet(page).getByRole('button', { name: '‹ Плагины' }).click();
  const row = sheet(page).getByRole('group', { name: 'OKR команды' });
  await expect(row.locator('.src')).toHaveText('git.company.local/team/panopticon-okr');
  await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'true'); // its rights were shown: let in
});

test('the branch instead: its own manifest; no updates asked', async ({ page }) => {
  await open(page);
  await check(page, OKR);
  await dlg(page).getByRole('radio', { name: 'Ветка main' }).click();
  await expect(dlg(page).getByRole('radio', { name: 'Ветка main' })).toHaveAttribute('aria-checked', 'true');
  await expect(dlg(page).getByLabel('Найденный плагин')).toContainText('v2.2.0-dev');
  await dlg(page).getByRole('checkbox').uncheck();
  await dlg(page).getByRole('button', { name: 'Установить' }).click();
  await expect(dlg(page)).toHaveCount(0);
  expect(JSON.parse((await disk(page, '/config/plugins/okr/.source.json'))!)).toMatchObject({ track: 'branch', ref: 'main', commit: 'm9', checkUpdates: false });
});

test('errors in words; a plugin for a newer app cannot be installed', async ({ page }) => {
  await open(page);
  await check(page, 'https://git.company.local/team/nothing.git');
  await expect(dlg(page).getByRole('alert')).toHaveText('Репозиторий не найден или нет доступа: проверьте ссылку, ключ SSH или вход в git на этом Mac');
  await check(page, 'https://git.company.local/team/src.git'); // only sources, nothing built
  await expect(dlg(page).getByRole('alert')).toContainText('нет manifest.json');
  await check(page, 'https://git.company.local/team/old.git');
  await expect(dlg(page).getByLabel('Найденный плагин')).toContainText('нужно приложение 9.0.0');
  await expect(dlg(page).getByRole('button', { name: 'Установить' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dlg(page)).toHaveCount(0);
  await expect(sheet(page)).toBeVisible(); // ⎋ closes the dialog, not the settings
});
