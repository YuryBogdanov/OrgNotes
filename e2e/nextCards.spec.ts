import { expect, test, type Page } from '@playwright/test';
import { openApp, settingsSheet } from './helpers';

// ТЗ 44.5 (§5–§8): the cards of a file — over «Структура», the column 268 pt with one (220 without); the head with the
// plugin's icon, title and count folds the card, kept on this Mac; the body is the plugin's, drawn again on the
// heading under the caret; the plugin's setting «Показывать карточку…» takes it away; its plugin failing — «Карточка
// не загрузилась»; nothing in the old interface. On the example plugin «Привет» (a card where there are open tasks).

const WORK = ['* TODO Бюджет', 'текст', '* NEXT Найм', '* DONE Отчёт', ''].join('\n');
const PLAIN = ['* Заметки', 'текст', ''].join('\n');
const host = (page: Page, code: string) => page.evaluate(async (c) => new Function('plugins', 'store', `return (async () => { ${c} })()`)((await import('/src/api/host.svelte.ts' as string)).plugins, (await import('/src/store.svelte.ts' as string)).store), code);

async function open(page: Page, next = true) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  if (next) await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/Work.org': WORK, '/mock/Plain.org': PLAIN }, plugins: { hello: ['index.read', 'files.edit'] }, ready: !next, viewport: { width: 1440, height: 860 } });
}
const tree = (page: Page, name: string) => page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name });
const column = (page: Page) => page.getByRole('complementary', { name: 'Структура' });
const card = (page: Page) => column(page).getByRole('region', { name: 'Привет' });
const width = async (page: Page) => Math.round((await column(page).boundingBox())!.width);

test('a card over «Структура»: 268 pt, the head with the count, the body the plugin\'s, «Под курсором» follows the caret', async ({ page }) => {
  await open(page);
  await tree(page, 'Work').click();
  await expect(card(page)).toBeVisible();
  expect(await card(page).evaluate((e) => !e.closest('.compat'))).toBe(true); // the core's frame, the body in the layer
  await expect(card(page).locator('.compat .fc-stat')).toHaveText(['2открыто', '1сделано']);
  expect(await width(page)).toBe(268);
  const head = card(page).getByRole('button', { name: /Привет/ });
  await expect(head).toHaveText(/Привет\s*2\s*⌄/);
  // the cards first, then «Структура»
  const [c, s] = await Promise.all([card(page).boundingBox(), column(page).getByText('Структура', { exact: true }).boundingBox()]);
  expect(c!.y + c!.height).toBeLessThan(s!.y);
  // the heading under the caret
  await page.locator('.cm-line', { hasText: 'Найм' }).click();
  await expect(card(page).locator('.hello-under')).toHaveText('Найм');
  await page.locator('.cm-line', { hasText: 'текст' }).click();
  await expect(card(page).locator('.hello-under')).toHaveText('Бюджет');
  // a file with nothing to say: no card, 220 pt
  await tree(page, 'Plain').click();
  await expect(card(page)).toHaveCount(0);
  expect(await width(page)).toBe(220);
});

test('a click on the head folds it, kept after a restart; the setting takes the card away', async ({ page }) => {
  await open(page);
  await tree(page, 'Work').click();
  const head = card(page).getByRole('button', { name: /Привет/ });
  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await expect(head).toHaveText(/›/);
  await expect(card(page).locator('.fc-stat')).toHaveCount(0);
  await page.reload();
  await expect(card(page).getByRole('button', { name: /Привет/ })).toHaveAttribute('aria-expanded', 'false');
  await card(page).getByRole('button', { name: /Привет/ }).click();
  await expect(card(page).locator('.fc-stat')).toHaveCount(2);
  // «Настройки → Привет»: the core's switch
  await page.keyboard.press('Meta+,');
  await settingsSheet(page).getByRole('tab', { name: 'Привет', exact: true }).click();
  await settingsSheet(page).getByRole('switch', { name: 'Показывать карточку в редакторе, если есть что сказать по файлу' }).click();
  await page.keyboard.press('Escape');
  await expect(card(page)).toHaveCount(0);
  expect(await width(page)).toBe(220);
});

test('its plugin failing: «Карточка не загрузилась» in its place; the old interface shows no card', async ({ page }) => {
  await open(page);
  await tree(page, 'Work').click();
  await expect(card(page).locator('.fc-stat')).toHaveCount(2);
  await host(page, "plugins.fail('hello', new Error('сломалось'))");
  await expect(card(page).getByRole('alert')).toContainText('Карточка не загрузилась');
  await expect(card(page).getByRole('alert')).toContainText('сломалось');
  await expect(card(page).getByRole('button', { name: 'Подробнее' })).toBeVisible();
  await tree(page, 'Plain').click();
  await tree(page, 'Work').click();
  await expect(card(page)).toHaveCount(0); // gone with another file shown
});

test('the old interface: the card registered, nothing shown', async ({ page }) => {
  await open(page, false);
  await page.locator('.nav .row[data-key="/mock/Work.org"]').click();
  await expect(page.locator('.cm-content').first()).toContainText('Бюджет');
  expect(await host(page, "return plugins.fileCards.has('hello.card')")).toBe(true);
  await expect(page.locator('.fcard')).toHaveCount(0);
});

test('`editor.heading`: the heading under the caret of the file shown, once per change', async ({ page }) => {
  const main = "export default { activate(ctx) { ctx.events.on('editor.heading', (p) => ctx.ui.notify('под курсором: ' + (p.heading ? p.heading.title : '—') + ' · ' + p.path)); } };";
  const manifest = JSON.stringify({ id: 'caret', name: 'Курсор', version: '1.0.0', api: '^1.14', main: 'main.js', permissions: [], contributes: {} });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/Work.org': WORK, '/config/plugins/caret/manifest.json': manifest, '/config/plugins/caret/main.js': main }, plugins: { caret: [] }, ready: false, viewport: { width: 1440, height: 860 } });
  await tree(page, 'Work').click();
  await page.locator('.cm-line', { hasText: 'Найм' }).click();
  await expect(page.getByRole('status')).toContainText('под курсором: Найм · Work.org');
  await page.locator('.cm-line', { hasText: 'текст' }).click();
  await expect(page.getByRole('status')).toContainText('под курсором: Бюджет · Work.org');
});
