import { expect, test, type Page } from '@playwright/test';
import { diskAll as disk, openApp } from './helpers';
import { RICH_ENABLED } from '../src/nextFlags';

// ТЗ 44.3 (§3): the new interface's menus — the heading's (§3.1: its items in order, «Сменить статус ›» as capsules,
// a plugin's section under its name, «Удалить заголовок»), the status menu behind a capsule (§3.2: rows of 30 pt, the
// current ticked, the chosen on `lampsoft`), the tags' popover (§3.3).

const PROBE = '/config/plugins/probe';
const MANIFEST = JSON.stringify({ id: 'probe', name: 'Зонд', version: '0.1.0', api: '^1.9', permissions: ['index.read'], contributes: {} });
const MAIN = `export default { activate(ctx) { ctx.ui.headingAction({ label: 'Показать ветку картой', when: (h) => h.level === 1, run: () => ctx.ui.notify('карта') }); } };`;
const WORK = '* TODO Подготовить бюджет :budget:\nСвести заявки.\n** Заявки\n* NEXT План найма\n';
const menu = (page: Page) => page.getByRole('menu').first();

async function open(page: Page, rich = false) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript((r) => (localStorage.setItem('ui:next', '1'), localStorage.setItem('editor:rich', r ? '1' : '0')), rich);
  await openApp(page, { files: { [PROBE + '/manifest.json']: MANIFEST, [PROBE + '/main.js']: MAIN, '/mock/work.org': WORK, '/mock/b.org': '* X :budget:\n' }, plugins: { probe: ['index.read'] }, ready: false, viewport: { width: 1440, height: 820 } });
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'work' }).click();
  await expect(page.locator('.cm-content')).toContainText('Подготовить бюджет');
}

test('the heading\'s menu: its items in order, the plugin\'s section, «Удалить заголовок» in `todo`', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: 'Подготовить бюджет' }).click({ button: 'right' });
  const labels = (await menu(page).locator('[role=menuitem] .l1, [role=menuitem] .capsule').allTextContents()).map((t) => t.trim());
  expect(labels.slice(0, 10)).toEqual(['Сменить статус', 'Запланировать…', 'Срок…', 'Теги…', 'Перенести в…', 'В архив', 'Сузить до заголовка', 'Добавить заметку…', 'Копировать ссылку', 'Открыть в мини-окне']);
  await expect(menu(page).locator('.head')).toHaveText('Зонд');
  await expect(menu(page).getByRole('menuitem', { name: 'Показать ветку картой' })).toBeVisible();
  const del = menu(page).getByRole('menuitem', { name: 'Удалить заголовок' });
  expect(await del.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(196, 67, 47)');
});

test('«Сменить статус ›»: capsules, the current ticked; a choice writes it', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: 'Подготовить бюджет' }).click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: /Сменить статус/ }).hover();
  const sub = page.getByRole('menu').nth(1);
  await expect(sub).toBeVisible();
  await expect(sub.locator('.capsule').first()).toHaveText('TODO');
  await expect(sub.getByRole('menuitem', { name: /TODO/ })).toContainText('сейчас');
  await expect(sub).toContainText('⇧← ⇧→ — предыдущий / следующий');
  await sub.getByRole('menuitem', { name: /DONE/ }).click();
  await expect(page.locator('.cm-line', { hasText: 'Подготовить бюджет' })).toContainText('DONE');
});

test('«Удалить заголовок»: the subtree goes in one step; ⌘Z brings it back', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: 'Подготовить бюджет' }).click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: 'Удалить заголовок' }).click();
  await expect.poll(() => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.files.find((f: { name: string }) => f.name === 'work.org').text)).toBe('* NEXT План найма\n');
  await page.keyboard.press('Meta+z');
  await expect(page.locator('.cm-content')).toContainText('Заявки');
});

test('a drawn capsule: the status menu — rows of 30 pt, the chosen on `lampsoft`; ↓ ↩ writes', async ({ page }) => {
  test.skip(!RICH_ENABLED, '«Оформление» выключено (fix-49)');
  await open(page, true);
  await page.locator('.cm-line', { hasText: 'План найма' }).locator('.cm-r-status').click();
  const m = page.getByRole('menu', { name: 'Статус' });
  await expect(m).toBeVisible();
  expect(Math.round((await m.getByRole('menuitem').first().boundingBox())!.height)).toBe(30);
  await page.keyboard.press('ArrowDown');
  expect(await m.locator('button.cur').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(227, 170, 60, 0.17)');
  await m.getByRole('menuitem', { name: /DONE/ }).click();
  await expect.poll(async () => (await disk(page))['/mock/work.org'] ?? (await page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.files.find((f: { name: string }) => f.name === 'work.org').text))).toContain('* DONE План найма');
});

test('⌃C Q: the tags\' popover — mono chips, «N заголовков», ↩ adds, ⌫ takes the last away', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: 'План найма' }).click();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('q');
  const pop = page.getByRole('dialog', { name: 'Теги заголовка' });
  await expect(pop).toBeVisible();
  await page.keyboard.type('bud');
  await expect(pop.locator('.row').first()).toContainText('budget');
  await expect(pop.locator('.row .n').first()).toHaveText('2 заголовка');
  await page.keyboard.press('Enter');
  await expect(pop.locator('.chip')).toHaveText(['budget×']);
  expect(await pop.locator('.chip').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('IBM Plex Mono');
  await page.keyboard.press('Backspace');
  await expect(pop.locator('.chip')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
});
