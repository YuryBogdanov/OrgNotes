import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installTauriMock, pluginsReady } from './tauriMock';

// ТЗ 39, part A: the plugin «Холст» — an outside plugin (its own repository, panopticon-canvas next to this one),
// installed from the app's folder of plugins as a user would. Skipped when it is not built there.

const DIST = fileURLToPath(new URL('../../panopticon-canvas/dist/', import.meta.url));
const built = existsSync(DIST + 'main.js');
test.skip(!built, 'the plugin «Холст» is not built next to the app (../panopticon-canvas: npm run build)');

const PLAN = [
  '#+TITLE: План 2027',
  '#+TODO: TODO DOING | DONE',
  '',
  '* Найм :hiring:',
  '** TODO SRE × 2',
  '** Тимлид данных',
  '* Платформа',
  '** DOING Новый ДЦ',
  '*** Учения',
  '**** Сценарий',
  '** Алерты v2',
  '* Риски',
  '* Процессы',
  '',
].join('\n');

async function open(page: Page, files: Record<string, string> = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('plugins:updatesChecked', String(Date.now()));
    localStorage.setItem('plugins:enabled', JSON.stringify({ canvas: true }));
    localStorage.setItem('plugins:trusted', JSON.stringify({ canvas: JSON.stringify([['clipboard', 'files.edit', 'index.read'], []]) }));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => ((window as any).__clip = t) }, configurable: true });
  });
  await installTauriMock(page, {
    '/mock/plan.org': PLAN,
    '/config/plugins/canvas/manifest.json': readFileSync(DIST + 'manifest.json', 'utf8'),
    '/config/plugins/canvas/main.js': readFileSync(DIST + 'main.js', 'utf8'),
    ...files,
  });
  await page.goto('/');
  await pluginsReady(page);
  await expect(page.locator('.cm-content, .cv').first()).toBeVisible();
}
const text = (page: Page) => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.files.find((f: any) => f.name === 'plan.org').text as string);
const map = (page: Page) => page.getByRole('application', { name: 'Mindmap' });
const nodeOf = (page: Page, title: string) => map(page).locator('.mm-node', { has: page.locator('.mm-t', { hasText: new RegExp(`^${title}$`) }) });
async function showMap(page: Page) {
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('Холст: mindmap файла');
  await page.keyboard.press('Enter');
  await expect(map(page)).toBeVisible();
}

test('the map of a file: the root is #+TITLE, branches on both sides, three levels open, «+1» folded; the status and the tags', async ({ page }) => {
  await open(page);
  await showMap(page);
  await expect(map(page).locator('.mm-node.d0')).toHaveText('План 2027');
  await expect(map(page).locator('.mm-node.d1 .mm-t')).toHaveText(['Найм', 'Платформа', 'Риски', 'Процессы']);
  // weights 3 + 5 of 10: the first two to the right of the root, the rest to the left
  const rootBox = (await map(page).locator('.mm-node.d0').boundingBox())!;
  expect((await nodeOf(page, 'Найм').boundingBox())!.x).toBeGreaterThan(rootBox.x + rootBox.width);
  expect((await nodeOf(page, 'Платформа').boundingBox())!.x).toBeGreaterThan(rootBox.x + rootBox.width);
  expect((await nodeOf(page, 'Риски').boundingBox())!.x).toBeLessThan(rootBox.x);
  await expect(nodeOf(page, 'Учения').locator('.mm-fold')).toHaveText('+1');
  await expect(nodeOf(page, 'Сценарий')).toHaveCount(0);
  await expect(nodeOf(page, 'Новый ДЦ').locator('.mm-kw')).toHaveText('DOING');
  await expect(nodeOf(page, 'Найм').locator('.mm-tags')).toHaveText(':hiring:');
  await nodeOf(page, 'Учения').locator('.mm-fold').click();
  await expect(nodeOf(page, 'Сценарий')).toBeVisible();
  await expect(map(page).locator('.mm-hint')).toContainText('⇥ дочерний');
});

test('⇥ a child, ↩ a sibling, typing renames, ⌫ removes with «Отменить»; each one ⌘Z', async ({ page }) => {
  await open(page);
  await showMap(page);
  await nodeOf(page, 'Риски').click();
  await page.keyboard.press('Tab');
  await page.keyboard.type('Сроки');
  await page.keyboard.press('Enter');
  await expect.poll(() => text(page)).toContain('* Риски\n** Сроки\n');
  await expect(nodeOf(page, 'Сроки')).toHaveClass(/sel/);
  await page.keyboard.press('Enter'); // a sibling
  await page.keyboard.type('Деньги');
  await page.keyboard.press('Enter');
  await expect.poll(() => text(page)).toContain('** Сроки\n** Деньги\n');
  await page.keyboard.type('Q4 бюджет'); // typing on the chosen node renames it
  await page.keyboard.press('Enter');
  await expect.poll(() => text(page)).toContain('** Сроки\n** Q4 бюджет\n');
  await page.keyboard.press('Backspace');
  await expect.poll(() => text(page)).not.toContain('Q4 бюджет');
  await expect(page.locator('.toast')).toContainText('Удалено: Q4 бюджет');
  await page.locator('.toast').getByRole('button', { name: 'Отменить' }).click();
  await expect.poll(() => text(page)).toContain('** Q4 бюджет\n');
  await map(page).focus();
  await page.keyboard.press('Meta+z');
  await expect.poll(() => text(page)).toContain('** Деньги\n');
  await page.keyboard.press('Meta+z');
  await expect.poll(() => text(page)).toContain('* Риски\n** Сроки\n* Процессы');
  await page.keyboard.press('Meta+z');
  await expect.poll(() => text(page)).toBe(PLAN);
});

test('F2, ⌘↑ ⌘↓, Space, the arrows; the text\'s edits show at once', async ({ page }) => {
  await open(page);
  await showMap(page);
  await nodeOf(page, 'Тимлид данных').click();
  await page.keyboard.press('Meta+ArrowUp');
  await expect.poll(() => text(page)).toContain('* Найм :hiring:\n** Тимлид данных\n** TODO SRE × 2\n');
  await page.keyboard.press('Meta+ArrowDown');
  await expect.poll(() => text(page)).toBe(PLAN);
  await expect(nodeOf(page, 'Тимлид данных')).toHaveClass(/sel/); // the moved one stays chosen
  await page.keyboard.press('ArrowLeft');
  await expect(nodeOf(page, 'Найм')).toHaveClass(/sel/);
  await page.keyboard.press('ArrowDown');
  await expect(nodeOf(page, 'Платформа')).toHaveClass(/sel/);
  await page.keyboard.press('Space');
  await expect(nodeOf(page, 'Платформа').locator('.mm-fold')).toHaveText('+4');
  await expect(nodeOf(page, 'Новый ДЦ')).toHaveCount(0);
  await page.keyboard.press('F2');
  await page.keyboard.type(' 2027');
  await page.keyboard.press('Enter');
  await expect.poll(() => text(page)).toContain('* Платформа 2027\n');
  // a change on disk shows on the map
  const now = await text(page);
  await page.evaluate((t) => (window as any).__setDisk('/mock/plan.org', t), now.replace('* Процессы', '* Процессы и ритуалы'));
  await expect(nodeOf(page, 'Процессы и ритуалы')).toBeVisible();
});

test('the colour of a branch: :COLOR: written, the children take it; the bar and its note', async ({ page }) => {
  await open(page);
  await showMap(page);
  await nodeOf(page, 'Платформа').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Цвет ветки…' }).click();
  const bar = map(page).getByRole('toolbar', { name: 'Цвет ветки' });
  await expect(bar).toBeVisible();
  await expect(map(page).locator('.mm-note')).toContainText('Цвет ветки хранится в заголовке');
  await bar.getByRole('button', { name: 'Зелёный' }).click();
  await expect.poll(() => text(page)).toContain('* Платформа\n:PROPERTIES:\n:COLOR: green\n:END:\n');
  await expect(nodeOf(page, 'Новый ДЦ')).toHaveCSS('border-top-color', 'rgb(48, 164, 108)');
  await expect(nodeOf(page, 'Платформа')).toHaveCSS('border-top-color', 'rgb(48, 164, 108)');
  await bar.getByRole('button', { name: 'Без цвета' }).click();
  await expect.poll(() => text(page)).toBe(PLAN);
});

test('a branch as a mindmap from the heading\'s menu: the tab «plan › Платформа», its heading the root; double click opens the text at the side', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: '* Платформа' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Показать ветку как mindmap' }).click();
  await expect(page.locator('.tab.on')).toContainText('plan › Платформа');
  await expect(map(page).locator('.mm-node.d0')).toHaveText('Платформа');
  await expect(map(page).locator('.mm-node.d1 .mm-t')).toHaveText(['Новый ДЦ', 'Алерты v2']);
  await nodeOf(page, 'Новый ДЦ').dblclick();
  const side = page.getByRole('dialog', { name: 'Текст заголовка' });
  await expect(side).toBeVisible();
  await expect(side.locator('.mm-pt')).toHaveText('Новый ДЦ');
  await expect(side.locator('.cm-content')).toContainText('Учения');
  await page.keyboard.press('Escape');
  await expect(side).toHaveCount(0);
  // the root renamed: the tab follows it
  await map(page).locator('.mm-node.d0').click();
  await page.keyboard.press('F2');
  await page.keyboard.type(' и SRE');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tab.on')).toContainText('plan › Платформа и SRE');
});

test('drag a node onto another: it goes under it', async ({ page }) => {
  await open(page);
  await showMap(page);
  const from = (await nodeOf(page, 'Алерты v2').boundingBox())!;
  const to = (await nodeOf(page, 'Найм').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 30, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
  await expect(nodeOf(page, 'Найм')).toHaveClass(/into/);
  await page.mouse.up();
  await expect.poll(() => text(page)).toContain('** Тимлид данных\n** Алерты v2\n* Платформа');
});

// ---- part B: the free canvas (.canvas, JSON Canvas) ----
const BOARD = JSON.stringify({
  nodes: [
    { id: 'g1', type: 'group', x: 0, y: 0, width: 660, height: 286, label: 'Переключение', color: '5' },
    { id: 'n1', type: 'text', text: 'Окно — после QBR', x: 22, y: 66, width: 250, height: 66, color: '3' },
    { id: 'c1', type: 'file', file: 'plan.org', subpath: '#Новый ДЦ', x: 330, y: 66, width: 300, height: 150 },
    { id: 'l1', type: 'link', url: 'https://wiki.company.local/dc/plan', x: 770, y: 66, width: 280, height: 80 },
  ],
  edges: [{ id: 'e1', fromNode: 'n1', fromSide: 'right', toNode: 'c1', toSide: 'left', toEnd: 'arrow', label: 'зачем' }],
  extra: { from: 'obsidian' },
}, null, '\t');
const board = (page: Page) => page.getByRole('application', { name: 'Холст' });
const cardOf = (page: Page, text: string) => board(page).locator('.cv-node', { hasText: text });
const json = async (page: Page, p = '/mock/board.canvas') => JSON.parse((await page.evaluate((x) => (window as any).__disk[x] as string, p)) || '{}');
async function openBoard(page: Page) {
  await open(page, { '/mock/board.canvas': BOARD });
  await page.getByRole('treeitem', { name: /^board$/ }).click();
  await expect(board(page)).toBeVisible();
}

test('a .canvas from Obsidian: the group, the note, the live card of a heading, the link, the edge with its label', async ({ page }) => {
  await openBoard(page);
  await expect(board(page).locator('.cv-glabel')).toHaveText('Переключение');
  await expect(cardOf(page, 'Окно — после QBR')).toBeVisible();
  const card = cardOf(page, 'Новый ДЦ');
  await expect(card.locator('.cv-kw')).toHaveText('DOING');
  await expect(card.locator('.cv-src')).toContainText('plan.org › Платформа');
  await expect(cardOf(page, 'wiki.company.local')).toContainText('/dc/plan');
  await expect(board(page).locator('.cv-elabel')).toHaveText('зачем');
  // the card is live: the heading renamed in the file shows at once
  const now = (await page.evaluate(() => (window as any).__disk['/mock/plan.org'])) as string;
  await page.evaluate((t) => (window as any).__setDisk('/mock/plan.org', t), now.replace('** DOING Новый ДЦ', '** DONE Новый ДЦ'));
  await expect(card.locator('.cv-kw')).toHaveText('DONE');
});

test('a note: «Заметка» in the bar, typed, written; moved with the grid; the group carries what is in it; ⌘Z', async ({ page }) => {
  await openBoard(page);
  await board(page).getByRole('toolbar', { name: 'Добавить на холст' }).getByRole('button', { name: 'Заметка' }).click();
  await expect(board(page).getByRole('textbox', { name: 'Текст заметки' })).toBeFocused();
  await page.keyboard.type('Спросить про бюджет');
  await page.keyboard.press('Escape');
  await expect(cardOf(page, 'Спросить про бюджет')).toBeVisible();
  await expect.poll(async () => (await json(page)).nodes.find((n: any) => n.text === 'Спросить про бюджет')?.color).toBe('3');
  expect((await json(page)).extra).toEqual({ from: 'obsidian' }); // unknown fields kept
  // the group dragged: the note and the card inside go with it
  const label = board(page).locator('.cv-glabel');
  const b = (await label.boundingBox())!;
  await page.mouse.move(b.x + 200, b.y + 4);
  await page.mouse.down();
  await page.mouse.move(b.x + 230, b.y + 30, { steps: 5 });
  await page.mouse.move(b.x + 244, b.y + 48, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await json(page)).nodes.find((n: any) => n.id === 'c1')?.x).not.toBe(330);
  const j = await json(page);
  const g = j.nodes.find((n: any) => n.id === 'g1');
  const c = j.nodes.find((n: any) => n.id === 'c1');
  expect(g.x % 22).toBe(0);
  expect(c.x - g.x).toBe(330);
  expect(j.nodes.find((n: any) => n.id === 'l1').x).toBe(770); // outside the group: stays
  await board(page).focus();
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => (await json(page)).nodes.find((n: any) => n.id === 'c1')?.x).toBe(330);
});

test('select, ⌘D, ⌘G, colour, delete; an edge drawn from a side dot', async ({ page }) => {
  await openBoard(page);
  const note = cardOf(page, 'Окно — после QBR');
  await note.click();
  await page.keyboard.press('Meta+d');
  await expect.poll(async () => (await json(page)).nodes.filter((n: any) => n.text === 'Окно — после QBR').length).toBe(2);
  await page.keyboard.press('Backspace');
  await expect.poll(async () => (await json(page)).nodes.filter((n: any) => n.text === 'Окно — после QBR').length).toBe(1);
  // colour
  await note.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Цвет…' }).click();
  await expect(board(page).locator('.cv-note')).toContainText('«color» в JSON Canvas');
  await board(page).getByRole('toolbar', { name: 'Цвет' }).getByRole('button', { name: 'Красный' }).click();
  await expect.poll(async () => (await json(page)).nodes.find((n: any) => n.id === 'n1').color).toBe('1');
  // an edge: from the link's left dot to the note
  const link = cardOf(page, 'wiki.company.local');
  await link.hover();
  const dot = link.locator('.cv-dot.bottom');
  const d = (await dot.boundingBox())!;
  const t = (await note.boundingBox())!;
  await page.mouse.move(d.x + 5, d.y + 5);
  await page.mouse.down();
  await page.mouse.move(t.x + t.width / 2, t.y + t.height - 5, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await json(page)).edges.length).toBe(2);
  expect((await json(page)).edges[1]).toMatchObject({ fromNode: 'l1', fromSide: 'bottom', toNode: 'n1', toSide: 'bottom', toEnd: 'arrow' });
  // ⌘G: a group around the note and the card
  await note.click();
  await cardOf(page, 'Новый ДЦ').click({ modifiers: ['Shift'] });
  await page.keyboard.press('Meta+g');
  await expect(board(page).getByRole('textbox', { name: 'Подпись группы' })).toBeFocused();
  await page.keyboard.type('Сроки');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await json(page)).nodes[0]).toMatchObject({ type: 'group', label: 'Сроки' });
});

test('a heading dropped from the navigator becomes a live card with its :ID:; ⌘V of a link adds a link; double click opens it at the side', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nav:headings', '1'));
  await openBoard(page);
  await page.getByRole('treeitem', { name: /plan$/ }).locator('.chev').click({ force: true });
  await page.evaluate(() => {
    const dt = new DataTransfer();
    const row = [...document.querySelectorAll('[role=treeitem]')].find((r) => r.textContent?.trim().endsWith('Риски'))!;
    row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    const st = document.querySelector('.cv-stage')!;
    const r = st.getBoundingClientRect();
    st.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 200, clientY: r.top + 500 }));
  });
  await expect(cardOf(page, 'Риски')).toBeVisible();
  const j = await json(page);
  const card = j.nodes.find((n: any) => n.subpath === '#Риски');
  expect(card).toMatchObject({ type: 'file', file: 'plan.org' });
  expect(card.orgId).toMatch(/^[0-9a-f-]{36}$/);
  await expect.poll(() => text(page)).toMatch(new RegExp(`\\* Риски\\n:PROPERTIES:\\n:ID: +${card.orgId}\\n:END:\\n`));
  // the card at the side: the heading's text, edited in the file
  await cardOf(page, 'Новый ДЦ').dblclick();
  const side = page.getByRole('dialog', { name: 'Карточка заголовка' });
  await expect(side).toContainText('Карточка из plan.org — правки сразу идут в файл');
  await expect(side.locator('.cm-content')).toContainText('Учения');
  await page.keyboard.press('Escape');
  // ⌘V of an address: a link
  await board(page).focus();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'https://jira.company.local/browse/OPS-1');
    document.querySelector('.cv')!.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  });
  await expect.poll(async () => (await json(page)).nodes.some((n: any) => n.type === 'link' && n.url.includes('OPS-1'))).toBe(true);
});

test('«Новый холст» in a folder\'s menu: an empty JSON Canvas file; «Холст: новый» in the palette', async ({ page }) => {
  await open(page);
  await page.locator('.list').click({ button: 'right', position: { x: 100, y: 400 } });
  await page.getByRole('menuitem', { name: 'Новый холст' }).click();
  await page.getByRole('textbox', { name: 'Имя нового файла' }).fill('Идеи');
  await page.keyboard.press('Enter');
  await expect(board(page)).toBeVisible();
  expect(await page.evaluate(() => (window as any).__disk['/mock/Идеи.canvas'])).toBe('{\n  "nodes": [],\n  "edges": []\n}\n');
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('Холст: новый');
  await page.keyboard.press('Enter');
  await page.getByLabel('Название').fill('Ретро');
  await page.getByRole('dialog').getByRole('button', { name: 'Создать' }).click();
  await expect(page.locator('.tab.on')).toContainText('Ретро');
  await expect.poll(() => page.evaluate(() => (window as any).__disk['/mock/Ретро.canvas'])).toBe('{\n  "nodes": [],\n  "edges": []\n}\n');
});

// ---- part C: export, «Разложить на холсте» ----
const savePick = (page: Page, ...paths: string[]) => page.evaluate((p) => ((window as any).__savePicks = p), paths);
const disk = (page: Page, p: string) => page.evaluate((x) => (window as any).__disk[x] as string | undefined, p);

test('«Экспорт ▾» of a mindmap: the menu; a .excalidraw file — rectangles with their text, lines without heads; SVG', async ({ page }) => {
  await open(page);
  await showMap(page);
  await map(page).getByRole('button', { name: 'Экспорт ▾' }).click();
  await expect(page.getByRole('menuitem')).toHaveText([/Excalidraw — файл \.excalidraw…/, /Копировать для Excalidraw/, 'PNG…', 'SVG…']);
  await savePick(page, '/out/План 2027.excalidraw');
  await page.getByRole('menuitem', { name: /Excalidraw — файл/ }).click();
  await expect.poll(() => disk(page, '/out/План 2027.excalidraw')).toBeTruthy();
  const x = JSON.parse((await disk(page, '/out/План 2027.excalidraw'))!);
  expect(x).toMatchObject({ type: 'excalidraw', version: 2, source: 'panopticon', files: {} });
  const rects = x.elements.filter((e: any) => e.type === 'rectangle');
  const texts = x.elements.filter((e: any) => e.type === 'text');
  const lines = x.elements.filter((e: any) => e.type === 'arrow');
  expect(rects.length).toBe(10); // the root and the nine headings shown (three levels open: «Сценарий» folded)
  expect(texts.map((t: any) => t.text)).toContain('План 2027');
  expect(texts.find((t: any) => t.text === 'DOING Новый ДЦ').containerId).toBe(rects.find((r: any) => r.boundElements.some((b: any) => b.type === 'text' && texts.find((t: any) => t.id === b.id)?.text === 'DOING Новый ДЦ')).id);
  expect(lines.length).toBe(9);
  expect(lines.every((l: any) => l.endArrowhead === null && l.startBinding && l.endBinding)).toBe(true);
  expect(await page.evaluate(() => (window as any).__log.find((l: any) => l[0] === 'save_panel')[1])).toMatchObject({ defaultPath: 'План 2027.excalidraw', filters: [{ name: 'Excalidraw', extensions: ['excalidraw'] }] });
  // SVG: everything is visible, no question
  await savePick(page, '/out/plan.svg');
  await map(page).getByRole('button', { name: 'Экспорт ▾' }).click();
  await page.getByRole('menuitem', { name: 'SVG…' }).click();
  await expect.poll(() => disk(page, '/out/plan.svg')).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  expect(await disk(page, '/out/plan.svg')).toContain('>План 2027</text>');
});

test('a canvas: «Копировать для Excalidraw» — its clipboard with frames and bound arrows; PNG; «Показать файл .canvas в Finder»', async ({ page }) => {
  await openBoard(page);
  await board(page).getByRole('button', { name: 'Экспорт ▾' }).click();
  await expect(page.getByRole('menuitem')).toHaveText([/Excalidraw — файл/, /Копировать для Excalidraw/, 'PNG…', 'SVG…', /Показать файл \.canvas в Finder/]);
  await page.getByRole('menuitem', { name: /Копировать для Excalidraw/ }).click();
  await expect(page.locator('.toast')).toContainText('Скопировано для Excalidraw');
  const c = JSON.parse(await page.evaluate(() => (window as any).__clip));
  expect(c.type).toBe('excalidraw/clipboard');
  const frame = c.elements.find((e: any) => e.type === 'frame');
  expect(frame.name).toBe('Переключение');
  const note = c.elements.find((e: any) => e.type === 'text' && e.text === 'Окно — после QBR');
  const noteBox = c.elements.find((e: any) => e.id === note.containerId);
  expect(noteBox.frameId).toBe(frame.id);
  const arrow = c.elements.find((e: any) => e.type === 'arrow');
  expect(arrow).toMatchObject({ endArrowhead: 'arrow', startBinding: { elementId: noteBox.id } });
  expect(c.elements.find((e: any) => e.type === 'text' && e.containerId === arrow.id).text).toBe('зачем');
  const card = c.elements.find((e: any) => e.type === 'text' && e.text.startsWith('plan.org'));
  expect(card.text).toContain('DOING Новый ДЦ');
  // PNG: bytes in base64, the PNG's signature
  await savePick(page, '/out/board.png');
  await board(page).getByRole('button', { name: 'Экспорт ▾' }).click();
  await page.getByRole('menuitem', { name: 'PNG…' }).click();
  await expect.poll(() => disk(page, '/out/board.png'), { timeout: 10000 }).toMatch(/^base64:iVBORw0KGgo/);
  await board(page).getByRole('button', { name: 'Экспорт ▾' }).click();
  await page.getByRole('menuitem', { name: /Показать файл \.canvas в Finder/ }).click();
  await expect.poll(() => page.evaluate(() => JSON.stringify((window as any).__log.filter((l: any) => l[0] === 'reveal')))).toContain('board.canvas');
});

test('«Разложить на холсте…» from a heading\'s menu: a new canvas named as it, its children as cards with arrows and :ID:', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: '* Платформа' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Разложить на холсте…' }).click();
  await page.getByRole('option', { name: /Новый холст «Платформа»/ }).click();
  await expect(board(page)).toBeVisible();
  await expect(page.locator('.tab.on')).toContainText('Платформа');
  const j = await json(page, '/mock/Платформа.canvas');
  expect(j.nodes.map((n: any) => n.subpath)).toEqual(['#Платформа', '#Новый ДЦ', '#Учения', '#Алерты v2']); // two levels
  expect(j.edges.length).toBe(3);
  expect(j.nodes.every((n: any) => /^[0-9a-f-]{36}$/.test(n.orgId))).toBe(true);
  await expect(cardOf(page, 'Учения')).toBeVisible();
  expect(await text(page)).toMatch(/\* Платформа\n:PROPERTIES:\n:ID: +[0-9a-f-]{36}\n:END:\n/);
});
