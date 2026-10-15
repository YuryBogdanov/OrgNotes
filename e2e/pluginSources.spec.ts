import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet, pluginsReady } from './tauriMock';
import { diskFile as disk, settingsSheet as sheet } from './helpers';

// ТЗ 37, PR A: where an installed plugin came from (the catalog, a git link), its update — the plugin restarted
// alone, other rights asked first — and «Удалить…» (its menu and «Вернуть»: the fix of ТЗ 37). The network and git are the mock's fixtures (window.__sources).

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

const row = (page: Page, name: string) => sheet(page).getByRole('group', { name });
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
  // «⋯» → «Удалить плагин…» (fix of ТЗ 37)
  await okr.getByRole('button', { name: 'Ещё: OKR команды' }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Проверить обновления', 'Показать в Finder', 'Удалить плагин…']); // by a link: no catalog page
  await page.getByRole('menuitem', { name: 'Удалить плагин…' }).click();
  const ask = page.getByRole('alertdialog', { name: 'Удалить плагин' });
  await expect(ask).toContainText('Удалить «OKR команды»?');
  await ask.getByRole('button', { name: 'Удалить' }).click();
  await expect(okr).toHaveCount(0);
  await expect(row(page, 'Помидор')).toBeVisible();
  expect(await disk(page, '/config/plugins/okr/main.js')).toBeUndefined();
  await expect(page.locator('.toast').last()).toContainText('«OKR команды» удалён · плагин в Корзине');
});

// ---- the fix of ТЗ 37: the menu of a plugin, its removal, «Вернуть» ----
const POMO_SETTINGS = { contributes: { commands: [{ id: 'pomo.ping', title: 'pomo: версия', keys: ['⌃⌘P'] }], settings: [{ section: 'Помидор', groups: [{ fields: [{ key: 'minutes', type: 'text', where: 'local', label: 'Минут' }] }] }] } };
async function withPomo(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('feature:pomo', JSON.stringify({ settings: { minutes: '50' } }));
    localStorage.setItem('keys', JSON.stringify({ preset: 'emacs', overrides: { 'pomo.ping': ['⌃⌘O'] } }));
  });
  await open(page, plugin('pomo', '0.3.0', { kind: 'catalog', repo: 'oleg/pomo', version: '0.3.0' }, POMO_SETTINGS), { raw: { 'oleg/pomo/manifest.json': manifest('pomo', '0.3.0', POMO_SETTINGS) } }, { pomo: READ });
  await openSettingsSheet(page, 'Плагины');
}
const local = (page: Page, k: string) => page.evaluate((x) => localStorage.getItem(x), k);

test('«⋯»: only for the installed; its settings, a check, its catalog page, Finder, «Удалить плагин…»', async ({ page }) => {
  await withPomo(page);
  await expect(row(page, 'Цели квартала').getByRole('button', { name: /^Ещё/ })).toHaveCount(0); // built in: only off
  const r = row(page, 'Помидор');
  const dots = r.getByRole('button', { name: 'Ещё: Помидор' });
  await expect(dots).toHaveAttribute('title', 'Ещё');
  await dots.click();
  await expect(page.getByRole('menuitem')).toHaveText(['Настройки плагина', 'Проверить обновления', 'Страница в каталоге', 'Показать в Finder', 'Удалить плагин…']);
  await expect(dots).toHaveClass(/on/);
  await page.getByRole('menuitem', { name: 'Показать в Finder' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__log.some((l: any) => l[0] === 'plugin_reveal' && l[1].id === 'pomo'))).toBe(true);
  // its settings page ends with «Удалить плагин…»
  await dots.click();
  await page.getByRole('menuitem', { name: 'Настройки плагина' }).click();
  await sheet(page).getByRole('button', { name: 'Удалить плагин…' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Удалить плагин' })).toContainText('Удалить «Помидор»?');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('removed without its settings: to the Trash, its command and shortcut gone, settings kept; «Вернуть» brings it back on', async ({ page }) => {
  await withPomo(page);
  await row(page, 'Помидор').getByRole('button', { name: 'Ещё: Помидор' }).click();
  await page.getByRole('menuitem', { name: 'Удалить плагин…' }).click();
  const ask = page.getByRole('alertdialog', { name: 'Удалить плагин' });
  await expect(ask).toContainText('Плагин уйдёт в Корзину macOS, его команды и сочетания пропадут. Ваши org-файлы не изменятся — включая записи, созданные плагином.');
  await expect(ask.getByRole('checkbox', { name: /Удалить и настройки плагина/ })).not.toBeChecked();
  await ask.getByRole('button', { name: 'Удалить' }).click();
  await expect(row(page, 'Помидор')).toHaveCount(0);
  expect(await disk(page, '/Trash/pomo/main.js')).toBeTruthy();
  const toast = page.locator('.toast', { hasText: '«Помидор» удалён · плагин в Корзине' });
  await expect(toast).toBeVisible();
  expect(await local(page, 'feature:pomo')).toContain('50'); // kept
  expect(await local(page, 'keys')).toContain('⌃⌘O');
  expect(await disk(page, '/mock/work.org')).toBe('* TODO A\n'); // the notes as they were
  await toast.getByRole('button', { name: 'Вернуть' }).click();
  await expect(row(page, 'Помидор')).toBeVisible();
  await expect(row(page, 'Помидор').getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  expect(await disk(page, '/config/plugins/pomo/main.js')).toBeTruthy();
  await expect(page.locator('.toast').last()).toContainText('«Помидор» снова установлен');
});

test('removed with its settings: they go (and the shortcuts given to it); «Вернуть» brings them back too; an emptied Trash says so', async ({ page }) => {
  await withPomo(page);
  await row(page, 'Помидор').getByRole('button', { name: 'Ещё: Помидор' }).click();
  await page.getByRole('menuitem', { name: 'Удалить плагин…' }).click();
  const ask = page.getByRole('alertdialog', { name: 'Удалить плагин' });
  await ask.getByRole('checkbox', { name: /Удалить и настройки плагина/ }).check();
  await ask.getByRole('button', { name: 'Удалить' }).click();
  await expect(row(page, 'Помидор')).toHaveCount(0);
  expect(await local(page, 'feature:pomo')).toBeNull();
  expect(await local(page, 'keys')).not.toContain('⌃⌘O');
  await page.locator('.toast', { hasText: 'удалён' }).getByRole('button', { name: 'Вернуть' }).click();
  await expect(row(page, 'Помидор')).toBeVisible();
  expect(await local(page, 'feature:pomo')).toContain('50');
  expect(await local(page, 'keys')).toContain('⌃⌘O');
  // once more, and the Trash emptied before «Вернуть»
  await row(page, 'Помидор').getByRole('button', { name: 'Ещё: Помидор' }).click();
  await page.getByRole('menuitem', { name: 'Удалить плагин…' }).click();
  await page.getByRole('alertdialog', { name: 'Удалить плагин' }).getByRole('button', { name: 'Удалить' }).click();
  await page.evaluate(() => { const d = (window as any).__disk; for (const k of Object.keys(d)) if (k.startsWith('/Trash/')) delete d[k]; });
  await page.locator('.toast', { hasText: 'удалён' }).getByRole('button', { name: 'Вернуть' }).click();
  await expect(page.locator('.toast').last()).toContainText('Корзину уже очистили — «Помидор» можно снова поставить из каталога');
  await expect(row(page, 'Помидор')).toHaveCount(0);
});
