import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet } from './tauriMock';

// ТЗ 26 §6–7 (roadmap 1.3): what a plugin may do is what its manifest asks and the user let in. The window itself
// goes nowhere (CSP); net.fetch goes only to the manifest's hosts; the clipboard needs its right; an installed plugin
// is let in by a sheet, and again when it asks for other rights.

const P = '/config/plugins/';
const man = (id: string, permissions: string[], o: object = {}) => JSON.stringify({
  id, name: id.toUpperCase(), version: '1.0.0', api: '^1.0', permissions,
  contributes: { commands: [{ id: id + '.run', title: id.toUpperCase() + ': запустить' }] }, ...o,
});
// one command that tries everything and says what came out
const MAIN = (id: string) => `export default { activate(ctx) { ctx.commands.on('${id}.run', async () => {
  const out = [];
  const t = async (name, f) => { try { out.push(name + ': ' + (await f())); } catch (e) { out.push(name + ': ' + e.message); } };
  await t('net', async () => { if (!ctx.net) return 'нет'; const r = await ctx.net.fetch('https://api.example.com/x', { method: 'POST', body: '{}' }); return r.status + ' ' + r.text; });
  await t('чужой', async () => { if (!ctx.net) return 'нет'; await ctx.net.fetch('https://evil.com/'); return 'прошёл'; });
  await t('окно', async () => { await fetch('https://example.com/'); return 'прошёл'; });
  await t('буфер', async () => { if (!ctx.clipboard) return 'нет'; await ctx.clipboard.write('сводка'); return 'записан'; });
  await t('правка', async () => (ctx.edit ? 'есть' : 'нет'));
  ctx.ui.notify(out.join(' | '));
}); } };`;
const rights = (perms: string[], net: string[] = []) => JSON.stringify([[...perms].sort(), [...net].sort()]);

async function open(page: Page, files: Record<string, string>, enabled: Record<string, boolean> = {}, trusted: Record<string, string> = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(([e, t]) => {
    if (localStorage.getItem('plugins:enabled')) return;
    localStorage.setItem('plugins:enabled', JSON.stringify(e));
    localStorage.setItem('plugins:trusted', JSON.stringify(t));
    (window as any).__copied = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (s: string) => void (window as any).__copied.push(s) } });
  }, [enabled, trusted] as const);
  await installTauriMock(page, { '/mock/Work.org': '* TODO A\n', ...files });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
}
const run = async (page: Page, id: string) => {
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type(id.toUpperCase() + ': запустить');
  await page.keyboard.press('Enter');
};

test('the window goes nowhere by itself', async ({ page }) => {
  await open(page, {});
  expect(await page.evaluate(() => fetch('https://example.com/').then(() => 'прошёл', () => 'закрыт'))).toBe('закрыт');
});

test('with net and clipboard: only the manifest\'s hosts, through the core; the clipboard written; no edit without the right', async ({ page }) => {
  await open(page, { [P + 'jira/manifest.json']: man('jira', ['net', 'clipboard'], { net: ['api.example.com'] }), [P + 'jira/main.js']: MAIN('jira') },
    { jira: true }, { jira: rights(['net', 'clipboard'], ['api.example.com']) });
  await run(page, 'jira');
  const t = page.locator('.toast');
  await expect(t).toContainText('net: 200 {"ok":true}');
  await expect(t).toContainText('чужой: хоста evil.com нет в манифесте');
  await expect(t).toContainText('окно:');
  await expect(t).not.toContainText('окно: прошёл');
  await expect(t).toContainText('буфер: записан');
  await expect(t).toContainText('правка: нет');
  const log = await page.evaluate(() => (window as any).__log.filter((x: unknown[]) => x[0] === 'net'));
  expect(log).toEqual([['net', 'jira', 'POST', 'https://api.example.com/x']]); // the other host never reached the core
  expect(await page.evaluate(() => (window as any).__copied)).toEqual(['сводка']);
});

test('without the rights: no net, no clipboard', async ({ page }) => {
  await open(page, { [P + 'notes/manifest.json']: man('notes', ['index.read']), [P + 'notes/main.js']: MAIN('notes') }, { notes: true }, { notes: rights(['index.read']) });
  await run(page, 'notes');
  const t = page.locator('.toast');
  await expect(t).toContainText('net: нет');
  await expect(t).toContainText('буфер: нет');
});

test('the sheet lets a plugin in; «Отмена» leaves it off; other rights in a new version: off again until let in', async ({ page }) => {
  await open(page, { [P + 'jira/manifest.json']: man('jira', ['net'], { net: ['api.example.com'] }), [P + 'jira/main.js']: MAIN('jira') });
  await openSettingsSheet(page, 'Плагины');
  const card = page.getByRole('dialog', { name: 'Настройки' }).getByRole('group', { name: 'JIRA' });
  await card.getByRole('switch').click();
  const ask = page.getByRole('alertdialog', { name: 'Включить плагин «JIRA»' });
  await expect(ask).toContainText('получит доступ: сеть (api.example.com)');
  await ask.getByRole('button', { name: 'Отмена' }).click();
  await expect(card.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await card.getByRole('switch').click();
  await ask.getByRole('button', { name: 'Включить' }).click();
  await expect(card.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  // a new version wants the clipboard too
  await page.evaluate((p) => ((window as any).__disk[p] = JSON.stringify({ id: 'jira', name: 'JIRA', version: '1.1.0', api: '^1.0', permissions: ['net', 'clipboard'], net: ['api.example.com'], contributes: { commands: [{ id: 'jira.run', title: 'JIRA: запустить' }] } })), P + 'jira/manifest.json');
  await page.getByRole('dialog', { name: 'Настройки' }).getByRole('button', { name: 'Перезагрузить плагины' }).click();
  await expect(card.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await expect(card).toContainText('Права плагина изменились — включите его снова');
  await card.getByRole('switch').click();
  await expect(ask).toContainText('сеть (api.example.com), запись в буфер обмена');
});
