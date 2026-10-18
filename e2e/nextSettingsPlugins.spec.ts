import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';

// ТЗ 54.5: «Плагины» of the new settings — the installed ones in rows (on / off, «⋯» with «Удалить плагин…» — a sheet
// of ТЗ 44), the catalog's not installed ones with «★ N» and «Установить» (the rights in a sheet, then the row moves
// up), the search over both; «Установить по ссылке…» a sheet.

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


async function open(page: Page) {
  await page.addInitScript((s) => {
    (window as any).__sources = s;
    localStorage.setItem('plugins:updatesChecked', String(Date.now()));
    localStorage.setItem('ui:next', '1');
  }, SOURCES);
  await installTauriMock(page, { '/mock/work.org': '* TODO A\n', ...installed('week', 'Неделя', '0.3.0'), ...installed('tpl', 'Шаблоны записей', '0.3.1') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await pluginsReady(page);
  await page.keyboard.press('Meta+,');
  const s = page.getByRole('dialog', { name: 'Настройки' });
  await s.getByRole('tab', { name: 'Плагины', exact: true }).click();
  return s;
}
const grp = (page: Page, cap: string) => page.getByRole('dialog', { name: 'Настройки' }).getByRole('region', { name: cap });

test('the installed and the catalog; installing through the rights\' sheet; the search', async ({ page }) => {
  const s = await open(page);
  const inst = grp(page, 'Установлены');
  const cat = grp(page, 'Каталог');
  await expect(inst.getByRole('group', { name: 'Неделя', exact: true })).toContainText('0.3.0');
  await expect(inst.getByRole('group', { name: 'Неделя', exact: true })).toContainText('из каталога');
  await expect(cat.getByRole('group', { name: 'Неделя', exact: true })).toHaveCount(0); // installed: not offered
  await expect(cat.getByRole('group', { name: 'Помидор' })).toContainText('★ 2,4 тыс.');
  await expect(cat.getByRole('group', { name: 'Экспорт в Markdown' })).toContainText('Нужно приложение 9.0.0');
  await s.getByRole('textbox', { name: 'Найти в каталоге' }).fill('помид');
  await expect(cat.getByRole('group')).toHaveCount(1);
  await expect(inst.getByRole('group')).toHaveCount(0);
  await cat.getByRole('group', { name: 'Помидор' }).getByRole('button', { name: 'Установить' }).click();
  const sh = page.getByRole('dialog', { name: 'Установка плагина' });
  await expect(sh).toContainText('сеть: api.pomo.app');
  await sh.getByRole('button', { name: 'Установить' }).click();
  await expect(inst.getByRole('group', { name: 'Помидор' })).toBeVisible({ timeout: 10000 });
  await expect(inst.getByRole('group', { name: 'Помидор' }).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await expect(s).toBeVisible();
});

test('«⋯» → «Удалить плагин…»: a sheet over the settings, ⎋ closes it first; «Удалить» — gone', async ({ page }) => {
  const s = await open(page);
  const row = grp(page, 'Установлены').getByRole('group', { name: 'Шаблоны записей' });
  await row.getByRole('button', { name: 'Ещё: Шаблоны записей' }).click();
  await page.getByRole('menuitem', { name: 'Удалить плагин…' }).click();
  const sh = page.getByRole('alertdialog', { name: 'Удалить плагин' });
  await expect(sh).toContainText('Удалить «Шаблоны записей»?');
  await page.keyboard.press('Escape');
  await expect(sh).toHaveCount(0);
  await expect(s).toBeVisible();
  await row.getByRole('button', { name: 'Ещё: Шаблоны записей' }).click();
  await page.getByRole('menuitem', { name: 'Удалить плагин…' }).click();
  await sh.getByRole('button', { name: 'Удалить' }).click();
  await expect(row).toHaveCount(0);
  // a plugin not allowed yet: turned on through its rights' sheet
  const week = grp(page, 'Установлены').getByRole('group', { name: 'Неделя', exact: true }).getByRole('switch');
  await expect(week).toHaveAttribute('aria-checked', 'false');
  await week.click();
  await page.getByRole('alertdialog', { name: 'Включить плагин «Неделя»' }).getByRole('button', { name: 'Включить' }).click();
  await expect(week).toHaveAttribute('aria-checked', 'true');
  // «Установить по ссылке…»: its sheet
  await s.getByRole('button', { name: 'Установить по ссылке…' }).click();
  await expect(page.getByRole('dialog', { name: 'Установка по ссылке' }).getByRole('button', { name: 'Установить' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(s).toBeVisible();
});
