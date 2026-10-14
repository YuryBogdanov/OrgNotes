import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';

// API 1.9 (ТЗ 39, PR A): a plugin's item in the menu of a heading (the editor's, the navigator's), a file's view on
// one branch in a tab of its own («work.org › Платформа»), the heading the user is at.

const PROBE = '/config/plugins/probe';
const MANIFEST = JSON.stringify({
  id: 'probe', name: 'Зонд', version: '0.1.0', api: '^1.9', permissions: ['index.read'],
  contributes: { commands: [{ id: 'probe.here', title: 'Зонд: ветка здесь' }], fileViews: [{ id: 'probe.map', title: 'Карта' }] },
});
const MAIN = `export default { activate(ctx) {
  ctx.ui.fileView('probe.map', {
    render(el, file, view) {
      const d = document.createElement('div');
      d.className = 'probe-map';
      d.textContent = file.path + (file.heading ? ' › ' + file.heading.title + ' @' + file.heading.line : '');
      const t = document.createElement('button'); t.textContent = 'Текст'; t.onclick = () => view.showText();
      const r = document.createElement('button'); r.textContent = 'Переименовать'; r.onclick = () => view.setHeading({ ...file.heading, title: 'Платформа 2' });
      el.append(d, t, r);
    },
  });
  ctx.ui.headingAction({
    label: 'Показать ветку картой',
    when: (h) => h.level === 1,
    run: (h) => ctx.ui.openFileView('probe.map', { path: h.path, heading: h }),
  });
  ctx.commands.on('probe.here', () => {
    const h = ctx.ui.currentHeading();
    ctx.ui.notify('Здесь: ' + (h ? h.path + ' · ' + h.title + ' @' + h.line : 'нет'));
  });
} };`;
const WORK = ['* Платформа', '** Переезд в ДЦ', '** SLA', '* Найм', ''].join('\n');

async function open(page: Page, navHeadings = false) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((nav) => {
    localStorage.setItem('plugins:updatesChecked', String(Date.now()));
    if (nav) localStorage.setItem('nav:headings', '1');
    localStorage.setItem('plugins:enabled', JSON.stringify({ probe: true }));
    localStorage.setItem('plugins:trusted', JSON.stringify({ probe: JSON.stringify([['index.read'], []]) }));
  }, navHeadings);
  await installTauriMock(page, { [PROBE + '/manifest.json']: MANIFEST, [PROBE + '/main.js']: MAIN, '/mock/work.org': WORK });
  await page.goto('/');
  await pluginsReady(page);
  await expect(page.locator('.cm-content')).toBeVisible();
}
const menu = (page: Page) => page.getByRole('menu');

test('the editor\'s menu on a heading: the plugin\'s item where `when` says so; it opens the branch in a tab «work.org › Платформа»', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line').nth(1).click({ button: 'right' }); // a level-2 heading: not offered
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole('menuitem', { name: 'Показать ветку картой' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('.cm-line').nth(0).click();
  await page.locator('.cm-line').nth(0).click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: 'Показать ветку картой' }).click();
  await expect(page.locator('.tab.on')).toContainText('work › Платформа');
  await expect(page.locator('.probe-map')).toHaveText('work.org › Платформа @0');
  await expect(page.locator('.tab', { hasText: 'work' })).toHaveCount(2); // the file's own tab stays
  // asked again: the same tab
  await page.locator('.tab', { hasText: 'work' }).filter({ hasNotText: '›' }).click();
  await page.locator('.cm-line').nth(0).click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: 'Показать ветку картой' }).click();
  await expect(page.locator('.tab', { hasText: 'work' })).toHaveCount(2);
  // setHeading: the tab's name follows
  await page.getByRole('button', { name: 'Переименовать' }).click();
  await expect(page.locator('.tab.on')).toContainText('work › Платформа 2');
});

test('the navigator\'s menu on a heading; «Текст» turns the tab into the file\'s text at that heading; currentHeading', async ({ page }) => {
  await open(page, true);
  await page.getByRole('treeitem', { name: /Найм/ }).click({ button: 'right' });
  await expect(menu(page).getByRole('menuitem')).toHaveText([/Копировать ссылку на заголовок/, 'Показать ветку картой']);
  await menu(page).getByRole('menuitem', { name: 'Показать ветку картой' }).click();
  await expect(page.locator('.probe-map')).toHaveText('work.org › Найм @3');
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('Зонд: ветка');
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toContainText('Здесь: work.org · Найм @3');
  await page.locator('.probe-map + button').click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.locator('.tab.on')).not.toContainText('›');
  await expect(page.locator('.cm-activeLine')).toHaveText('* Найм');
});
