import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet, pluginsReady } from './tauriMock';

// ТЗ 37, PR B: the catalog in «Настройки → Плагины» — its list (the state of each plugin's button), the search, the
// categories, the order; installing (rights, size, on at once), a plugin's page; no network. GitHub is the mock's.

const man = (id: string, name: string, version: string, o: object = {}) => JSON.stringify({
  id, name, version, api: '^1.8', author: 'Автор', description: name, permissions: ['index.read'],
  contributes: { commands: [{ id: `${id}.ping`, title: `${name}: проверить` }], settings: [{ section: name, groups: [{ caption: 'X', fields: [{ key: 'n', type: 'switch', label: 'N', where: 'local' }] }] }] }, ...o,
});
const main = (id: string, v: string) => `export default { activate(ctx) { ctx.commands.on('${id}.ping', () => ctx.ui.notify('${id} ${v} работает')); } };`;
const ENTRY = (id: string, name: string, cats: string[], description: string) => ({ id, name, author: 'Олег Р.', description, repo: `o/${id}`, categories: cats });
const SOURCES = {
  catalog: {
    plugins: [
      ENTRY('pomo', 'Помидор', ['planning'], 'Таймер фокуса с записью в LOGBOOK задачи.'),
      ENTRY('week', 'Неделя', ['planning'], 'План недели и итоги.'),
      ENTRY('tpl', 'Шаблоны записей', ['planning'], 'Новые записи по шаблонам.'),
      ENTRY('md', 'Экспорт в Markdown', ['export'], 'Файл или поддерево в Markdown.'),
    ],
    stats: { pomo: { downloads: 2400, updated: '2026-10-01' }, week: { downloads: 210, updated: '2026-10-14' }, tpl: { downloads: 1100 }, md: { downloads: 530 } },
  },
  raw: {
    'o/pomo/manifest.json': man('pomo', 'Помидор', '2.1.0', { permissions: ['index.read', 'net'], net: ['api.pomo.app'] }),
    'o/pomo/README.md': '# Помидор\n\nТаймер **фокуса**: 25 минут работы, 5 — отдыха.\n\n- пишет в LOGBOOK\n- [сайт](https://pomo.app)\n',
    'o/week/manifest.json': man('week', 'Неделя', '0.3.0'),
    'o/tpl/manifest.json': man('tpl', 'Шаблоны записей', '0.4.0'),
    'o/md/manifest.json': man('md', 'Экспорт в Markdown', '0.8.0', { minAppVersion: '9.0.0' }),
  },
  releaseList: { 'o/pomo': [{ tag_name: '2.1.0', published_at: '2026-10-01T10:00:00Z', body: 'Звук по окончании', assets: [{ name: 'main.js', size: 80000 }, { name: 'manifest.json', size: 6000 }] }, { tag_name: '2.0.0', published_at: '2026-09-01T10:00:00Z', body: '', assets: [] }] },
  releases: { 'o/pomo@2.1.0': { 'manifest.json': man('pomo', 'Помидор', '2.1.0', { permissions: ['index.read', 'net'], net: ['api.pomo.app'] }), 'main.js': main('pomo', '2.1.0') } },
};
const installed = (id: string, name: string, v: string) => ({
  [`/config/plugins/${id}/manifest.json`]: man(id, name, v),
  [`/config/plugins/${id}/main.js`]: main(id, v),
  [`/config/plugins/${id}/.source.json`]: JSON.stringify({ kind: 'catalog', repo: `o/${id}`, version: v }),
});

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Настройки' });
const card = (page: Page, name: string) => sheet(page).getByRole('group', { name, exact: true });
async function open(page: Page, sources: object = SOURCES) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((s) => {
    (window as any).__sources = s;
    localStorage.setItem('plugins:updatesChecked', String(Date.now())); // no check on start: the catalog's own
  }, sources);
  await installTauriMock(page, { '/mock/work.org': '* TODO A\n', ...installed('week', 'Неделя', '0.3.0'), ...installed('tpl', 'Шаблоны записей', '0.3.1') });
  await page.goto('/');
  await pluginsReady(page);
  await openSettingsSheet(page, 'Плагины');
  await sheet(page).getByRole('button', { name: 'Каталог плагинов…' }).click();
}

test('the catalog: a card each with the state of its button; the search, the categories, the order', async ({ page }) => {
  await open(page);
  await expect(sheet(page).locator('.t2')).toHaveText('Плагины › Каталог');
  await expect(sheet(page)).toContainText('Из репозитория Panopticon-Org-Notes/plugins');
  await expect(card(page, 'Помидор')).toContainText('v2.1.0 · ⬇ 2,4 тыс.');
  await expect(card(page, 'Помидор').getByRole('button', { name: 'Установить' })).toBeVisible();
  await expect(card(page, 'Неделя')).toContainText('✓ Установлен');
  await expect(card(page, 'Шаблоны записей').getByRole('button', { name: 'Обновить · 0.4.0' })).toBeVisible();
  await expect(card(page, 'Экспорт в Markdown')).toContainText('Нужно приложение 9.0.0');
  // popular first; by name
  expect(await sheet(page).locator('.card .name').allInnerTexts()).toEqual(['Помидор', 'Шаблоны записей', 'Экспорт в Markdown', 'Неделя']);
  await sheet(page).getByLabel('Сортировка').selectOption('name');
  expect(await sheet(page).locator('.card .name').allInnerTexts()).toEqual(['Неделя', 'Помидор', 'Шаблоны записей', 'Экспорт в Markdown']);
  await sheet(page).getByLabel('Найти в каталоге').fill('logbook');
  await expect(sheet(page).locator('.card')).toHaveCount(1);
  await sheet(page).getByLabel('Найти в каталоге').fill('');
  await sheet(page).getByRole('tab', { name: 'Экспорт' }).click();
  await expect(sheet(page).locator('.card .name')).toHaveText(['Экспорт в Markdown']);
  await sheet(page).getByRole('button', { name: '‹ Плагины' }).click();
  await expect(sheet(page).locator('.t2')).toHaveText('Плагины');
});

test('installing: the rights and the size first; on at once — its commands work, it is «из каталога»', async ({ page }) => {
  await open(page);
  await card(page, 'Помидор').getByRole('button', { name: 'Установить' }).click();
  const ask = page.getByRole('dialog', { name: 'Установка плагина' });
  await expect(ask).toContainText('Установить «Помидор»?');
  await expect(ask.locator('li.net')).toContainText('api.pomo.app');
  await expect(ask).toContainText('Скачается релиз v2.1.0 из github.com/o/pomo (84 КБ)');
  await expect(ask.getByRole('checkbox')).toBeChecked();
  await ask.getByRole('button', { name: 'Установить' }).click();
  await expect(card(page, 'Помидор')).toContainText('✓ Установлен');
  await expect(page.locator('.toast').last()).toContainText('«Помидор» установлен и включён · команды — в палитре');
  await expect(page.locator('.toast').last().getByRole('button', { name: 'Настройки плагина' })).toBeVisible();
  await sheet(page).getByRole('button', { name: '‹ Плагины' }).click();
  const row = sheet(page).getByRole('group', { name: 'Помидор' });
  await expect(row.locator('.src')).toHaveText('из каталога');
  await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await sheet(page).getByRole('button', { name: 'Готово' }).click();
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('Помидор: проверить');
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast').last()).toContainText('pomo 2.1.0 работает');
});

test("a plugin's page: its README, rights, compatibility, versions", async ({ page }) => {
  await open(page);
  await card(page, 'Помидор').locator('.desc').click();
  await expect(sheet(page).locator('.t2')).toHaveText('Плагины › Каталог › Помидор');
  const md = sheet(page).locator('.md');
  await expect(md.locator('h2')).toHaveText('Помидор');
  await expect(md.locator('b')).toHaveText('фокуса');
  await expect(md.locator('a')).toHaveAttribute('href', 'https://pomo.app');
  await expect(sheet(page).getByLabel('Права')).toContainText('Сеть: api.pomo.app');
  await expect(sheet(page).getByLabel('Совместимость')).toContainText('Подходит вашей версии');
  await sheet(page).getByRole('tab', { name: 'Версии' }).click();
  await expect(sheet(page).locator('.rel .rh b')).toHaveText(['2.1.0', '2.0.0']);
  await expect(sheet(page).locator('.rel').first()).toContainText('Звук по окончании');
  await sheet(page).getByRole('button', { name: '‹ Каталог' }).click();
  await expect(card(page, 'Помидор')).toBeVisible();
});

test('no network and nothing kept: says so, «Повторить»', async ({ page }) => {
  await open(page, { ...SOURCES, catalog: undefined });
  await expect(sheet(page).getByRole('alert')).toContainText('Не удалось загрузить каталог: нет связи с GitHub');
  await expect(sheet(page).getByRole('button', { name: 'Повторить' })).toBeVisible();
});
