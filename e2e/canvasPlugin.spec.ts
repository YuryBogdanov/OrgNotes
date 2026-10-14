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
    localStorage.setItem('plugins:trusted', JSON.stringify({ canvas: JSON.stringify([['files.edit', 'index.read'], []]) }));
  });
  await installTauriMock(page, {
    '/mock/plan.org': PLAN,
    '/config/plugins/canvas/manifest.json': readFileSync(DIST + 'manifest.json', 'utf8'),
    '/config/plugins/canvas/main.js': readFileSync(DIST + 'main.js', 'utf8'),
    ...files,
  });
  await page.goto('/');
  await pluginsReady(page);
  await expect(page.locator('.cm-content')).toBeVisible();
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
