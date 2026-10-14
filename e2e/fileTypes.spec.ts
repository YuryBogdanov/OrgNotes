import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';

// API 1.10 (ТЗ 39, PR B): a plugin's own file type — listed in the navigator with its icon, opened in its view (never
// the Org editor), made from a folder's menu with its template, renamed with its extension, written and taken back
// by ⌘Z as any file, left out of the search; a heading's :ID: made and found; what the app's lists give when dragged.

const PROBE = '/config/plugins/probe';
const MANIFEST = JSON.stringify({
  id: 'probe', name: 'Зонд', version: '0.1.0', api: '^1.10', permissions: ['index.read', 'files.edit'],
  contributes: {
    commands: [{ id: 'probe.id', title: 'Зонд: ID' }],
    fileViews: [{ id: 'probe.sketch', title: 'Эскиз' }],
    fileTypes: [{ ext: 'sketch', title: 'Эскиз', icon: 'M4 4h12v12H4z', view: 'probe.sketch', template: '{"items":[]}\n', newLabel: 'Новый эскиз' }],
  },
});
const MAIN = `export default { activate(ctx) {
  ctx.ui.fileView('probe.sketch', {
    render(el, file) {
      const out = document.createElement('pre'); out.className = 'probe-text';
      const add = document.createElement('button'); add.textContent = 'Добавить';
      const drop = document.createElement('div'); drop.className = 'probe-drop'; drop.textContent = 'сюда';
      const show = async () => (out.textContent = file.path + ': ' + (await ctx.files.read(file.path)));
      add.onclick = () => ctx.edit.transaction('Добавить', (tx) => tx.update(file.path, (t) => t.replace('[]', '["x"]')));
      drop.ondragover = (e) => e.preventDefault();
      drop.ondrop = (e) => { e.preventDefault(); drop.textContent = e.dataTransfer.getData('application/x-panopticon'); };
      const off = ctx.events.on('file.changed', (p) => p.path === file.path && show());
      void show();
      el.append(out, add, drop);
      return off;
    },
  });
  ctx.commands.on('probe.id', async () => {
    const [h] = await ctx.index.outline('work.org');
    let id = null;
    await ctx.edit.transaction('ID', (tx) => { id = tx.ensureId(h.ref); });
    const again = [];
    await ctx.edit.transaction('ID', (tx) => { again.push(tx.ensureId(h.ref)); });
    const found = await ctx.index.byId(id);
    ctx.ui.notify('ID ' + (id === again[0] ? 'тот же' : 'другой') + ' · найден: ' + (found ? found.title : 'нет'));
  });
} };`;
const WORK = ['* Платформа', '** Переезд', 'Текст про items.', ''].join('\n');

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('plugins:updatesChecked', String(Date.now()));
    localStorage.setItem('plugins:enabled', JSON.stringify({ probe: true }));
    localStorage.setItem('plugins:trusted', JSON.stringify({ probe: JSON.stringify([['files.edit', 'index.read'], []]) }));
    localStorage.setItem('nav:headings', '1');
  });
  await installTauriMock(page, { [PROBE + '/manifest.json']: MANIFEST, [PROBE + '/main.js']: MAIN, '/mock/work.org': WORK, '/mock/plan.sketch': '{"items":[]}\n' });
  await page.goto('/');
  await pluginsReady(page);
}
const disk = (page: Page, p: string) => page.evaluate((x) => (window as any).__disk[x] as string | undefined, p);
const tree = (page: Page, name: string | RegExp) => page.getByRole('treeitem', { name });

test('a plugin\'s file: in the navigator with its icon and without its extension; opened in the plugin\'s view; written and taken back', async ({ page }) => {
  await open(page);
  const row = tree(page, /^plan$/);
  await expect(row).toBeVisible();
  await expect(row.locator('svg.ic')).toHaveAttribute('data-type', 'sketch');
  await row.click();
  await expect(page.locator('.tab.on')).toContainText('plan');
  await expect(page.locator('.probe-text')).toHaveText('plan.sketch: {"items":[]}\n');
  await expect(page.locator('.cm-content')).toHaveCount(0); // never the Org editor
  await page.getByRole('button', { name: 'Добавить' }).click();
  await expect.poll(() => disk(page, '/mock/plan.sketch')).toBe('{"items":["x"]}\n');
  await expect(page.locator('.probe-text')).toHaveText('plan.sketch: {"items":["x"]}\n');
  await page.locator('.probe-text').click();
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page, '/mock/plan.sketch')).toBe('{"items":[]}\n');
  // the tab's menu has no «Показать как ›»: the file has its one view
  await page.locator('.tab.on').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /Показать как/ })).toHaveCount(0);
});

test('«Новый эскиз» in a folder\'s menu makes the file with its template; a rename keeps the extension; the search leaves it out', async ({ page }) => {
  await open(page);
  await page.locator('.list').click({ button: 'right', position: { x: 100, y: 400 } });
  await page.getByRole('menuitem', { name: 'Новый эскиз' }).click();
  const name = page.getByRole('textbox', { name: 'Имя нового файла' });
  await expect(name).toHaveAttribute('placeholder', 'Новый эскиз');
  await name.fill('Идеи');
  await page.keyboard.press('Enter');
  await expect.poll(() => disk(page, '/mock/Идеи.sketch')).toBe('{"items":[]}\n');
  await expect(page.locator('.probe-text')).toHaveText('Идеи.sketch: {"items":[]}\n');
  await tree(page, /^Идеи$/).dblclick();
  await page.getByRole('textbox', { name: 'Новое имя' }).fill('Идеи 2');
  await page.keyboard.press('Enter');
  await expect.poll(() => disk(page, '/mock/Идеи 2.sketch')).toBe('{"items":[]}\n');
  // «items» is in work.org and in the sketches: only the note is found
  await page.keyboard.press('Shift+Meta+f');
  await page.keyboard.type('items');
  await page.keyboard.press('Enter');
  await expect(page.locator('.file .fn')).toHaveText(['work']);
});

test('tx.ensureId writes an :ID: once; index.byId finds the heading', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('Зонд: ID');
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toContainText('ID тот же · найден: Платформа');
  expect(await disk(page, '/mock/work.org')).toMatch(/^\* Платформа\n:PROPERTIES:\n:ID: +[0-9a-f-]{36}\n:END:\n/);
});

test('a heading dragged from the navigator gives its place and :ID: to a plugin\'s view', async ({ page }) => {
  await open(page);
  await tree(page, /^plan$/).click();
  await expect(page.locator('.probe-drop')).toBeVisible();
  await tree(page, /work$/).locator('.chev').click({ force: true }); // its headings, the sketch still shown
  await page.evaluate(() => {
    const dt = new DataTransfer();
    const row = [...document.querySelectorAll('[role=treeitem]')].find((r) => r.textContent?.includes('Платформа'))!;
    row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    document.querySelector('.probe-drop')!.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await expect(page.locator('.probe-drop')).toHaveText('{"kind":"heading","ref":{"path":"work.org","line":0,"title":"Платформа"}}');
});
