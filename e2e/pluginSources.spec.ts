import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet, pluginsReady } from './tauriMock';

// ТЗ 37, PR A: where an installed plugin came from (the catalog, a git link), its update — the plugin restarted
// alone, other rights asked first — and «Удалить…». The network and git are the mock's fixtures (window.__sources).

const manifest = (id: string, version: string, o: object = {}) => JSON.stringify({
  id, name: id === 'pomo' ? 'Помидор' : 'OKR команды', version, api: '^1.8', author: 'Олег Р.', description: 'Таймер фокуса',
  permissions: ['index.read'], icon: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12z', contributes: { commands: [{ id: `${id}.ping`, title: `${id}: версия` }] }, ...o,
});
const main = (id: string, v: string) => `export default { activate(ctx) { ctx.commands.on('${id}.ping', () => ctx.ui.notify('${id} ${v}')); } };`;
const plugin = (id: string, version: string, source: object, o: object = {}) => ({
  [`/config/plugins/${id}/manifest.json`]: manifest(id, version, o),
  [`/config/plugins/${id}/main.js`]: main(id, version),
  [`/config/plugins/${id}/.source.json`]: JSON.stringify(source),
});
const files = (id: string, version: string, o: object = {}) => ({ 'manifest.json': manifest(id, version, o), 'main.js': main(id, version) });
const OKR = 'git@git.company.local:team/panopticon-okr.git';

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Настройки' });
const row = (page: Page, name: string) => sheet(page).getByRole('group', { name });
const disk = (page: Page, p: string) => page.evaluate((x) => (window as any).__disk[x] as string | undefined, p);
async function open(page: Page, installed: Record<string, string>, sources: object, rights: Record<string, string>) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(([s, r]) => {
    (window as any).__sources = s;
    localStorage.setItem('plugins:enabled', JSON.stringify(Object.fromEntries(Object.keys(r).map((k) => [k, true]))));
    localStorage.setItem('plugins:trusted', JSON.stringify(r));
  }, [sources, rights] as const);
  await installTauriMock(page, { '/mock/work.org': '* TODO A\n', ...installed });
  await page.goto('/');
  await pluginsReady(page);
}
async function ping(page: Page, id: string) {
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type(`${id}: версия`);
  await page.keyboard.press('Enter');
}
const READ = JSON.stringify([['index.read'], []]);

test('from the catalog: «из каталога», a newer version in its repository — «Обновить · 0.4.0» and the dot; the update restarts the plugin', async ({ page }) => {
  await open(page, plugin('pomo', '0.3.0', { kind: 'catalog', repo: 'oleg/pomo', version: '0.3.0' }), {
    raw: { 'oleg/pomo/manifest.json': manifest('pomo', '0.4.0') },
    releases: { 'oleg/pomo@0.4.0': files('pomo', '0.4.0') },
  }, { pomo: READ });
  await ping(page, 'pomo');
  await expect(page.locator('.toast').last()).toContainText('pomo 0.3.0');
  await openSettingsSheet(page, 'Плагины');
  await expect(sheet(page).getByRole('tab', { name: /Плагины/ }).locator('.updot')).toBeVisible(); // checked on start
  const r = row(page, 'Помидор');
  await expect(r.locator('.ver')).toHaveText('0.3.0');
  await expect(r.locator('.src')).toHaveText('из каталога');
  await expect(r.locator('svg.ic')).toBeVisible();
  await r.getByRole('button', { name: 'Обновить · 0.4.0' }).click();
  await expect(r.locator('.ver')).toHaveText('0.4.0');
  await expect(r.getByRole('button', { name: /Обновить/ })).toHaveCount(0);
  await expect(page.locator('.toast').last()).toContainText('«Помидор» обновлён до 0.4.0');
  expect(JSON.parse((await disk(page, '/config/plugins/pomo/.source.json'))!)).toMatchObject({ kind: 'catalog', version: '0.4.0' });
  await expect(r.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await sheet(page).getByRole('button', { name: 'Готово' }).click();
  await ping(page, 'pomo');
  await expect(page.locator('.toast').last()).toContainText('pomo 0.4.0'); // the new code runs
});

test('a new version asking for other rights: asked first; «Отмена» keeps the old one', async ({ page }) => {
  const net = { permissions: ['index.read', 'net'], net: ['api.pomo.app'] };
  await open(page, plugin('pomo', '0.3.0', { kind: 'catalog', repo: 'oleg/pomo', version: '0.3.0' }), {
    raw: { 'oleg/pomo/manifest.json': manifest('pomo', '0.5.0', net) },
    releases: { 'oleg/pomo@0.5.0': files('pomo', '0.5.0', net) },
  }, { pomo: READ });
  await openSettingsSheet(page, 'Плагины');
  const r = row(page, 'Помидор');
  await r.getByRole('button', { name: 'Обновить · 0.5.0' }).click();
  const ask = page.getByRole('alertdialog', { name: 'Обновить плагин «Помидор»' });
  await expect(ask).toContainText('Обновить «Помидор» до 0.5.0?');
  await expect(ask).toContainText('api.pomo.app');
  await ask.getByRole('button', { name: 'Отмена' }).click();
  await expect(r.locator('.ver')).toHaveText('0.3.0');
  await r.getByRole('button', { name: 'Обновить · 0.5.0' }).click();
  await ask.getByRole('button', { name: 'Обновить' }).click();
  await expect(r.locator('.ver')).toHaveText('0.5.0');
  await expect(r.getByRole('switch')).toHaveAttribute('aria-checked', 'true'); // its new rights let in: still on
});

test('by a git link: the link shown, a newer tag to update to; «Удалить…» asks, the folder goes, the others stay; the search', async ({ page }) => {
  await open(page, {
    ...plugin('okr', '2.0.0', { kind: 'git', url: OKR, track: 'tag', ref: 'v2.0.0', commit: 'aaa', checkUpdates: true }),
    ...plugin('pomo', '0.3.0', { kind: 'catalog', repo: 'oleg/pomo', version: '0.3.0' }),
  }, {
    raw: { 'oleg/pomo/manifest.json': manifest('pomo', '0.3.0') },
    git: { [OKR]: { refs: { head: 'main', tags: [['v2.1.0-rc1', 'ccc'], ['v2.0.1', 'bbb'], ['v2.0.0', 'aaa']], branches: [['main', 'ddd']] }, refsFor: { 'v2.0.1': files('okr', '2.0.1') } } },
  }, { okr: READ, pomo: READ });
  await openSettingsSheet(page, 'Плагины');
  const okr = row(page, 'OKR команды');
  await expect(okr.locator('.src')).toHaveText('git.company.local/team/panopticon-okr');
  await expect(okr.getByRole('button', { name: 'Обновить · 2.0.1' })).toBeVisible(); // not the release candidate
  await expect(row(page, 'Помидор').getByRole('button', { name: /Обновить/ })).toHaveCount(0);
  await okr.getByRole('button', { name: 'Обновить · 2.0.1' }).click();
  await expect(okr.locator('.ver')).toHaveText('2.0.1');
  expect(JSON.parse((await disk(page, '/config/plugins/okr/.source.json'))!)).toMatchObject({ kind: 'git', ref: 'v2.0.1', commit: 'bbb' });
  // the search
  await sheet(page).getByLabel('Найти плагин').fill('таймер');
  await expect(sheet(page).locator('.pl')).toHaveCount(2); // both say «Таймер фокуса»; no built-in one
  await sheet(page).getByLabel('Найти плагин').fill('okr');
  await expect(sheet(page).locator('.pl')).toHaveCount(1);
  await sheet(page).getByLabel('Найти плагин').fill('');
  // «…» → «Удалить…»
  await okr.getByRole('button', { name: 'Ещё: OKR команды' }).click();
  await expect(page.getByRole('menuitem', { name: /Исходный код/ })).toContainText('git.company.local/team/panopticon-okr');
  await page.getByRole('menuitem', { name: 'Удалить…' }).click();
  const ask = page.getByRole('alertdialog', { name: 'Удаление плагина' });
  await expect(ask).toContainText('Удалить «OKR команды»?');
  await ask.getByRole('button', { name: 'Удалить' }).click();
  await expect(okr).toHaveCount(0);
  await expect(row(page, 'Помидор')).toBeVisible();
  expect(await disk(page, '/config/plugins/okr/main.js')).toBeUndefined();
  await expect(page.locator('.toast').last()).toContainText('«OKR команды» удалён — папка в Корзине');
});
