import { expect, test, type Page } from '@playwright/test';
import { diskFile as disk, openApp } from './helpers';

// ТЗ 44.7 (§5): the cards of the built-in plugins — «Долгие дела» on a file of its sources (the groups, «Открыть
// список», under the caret the matter and its actions with their keys, off on a heading that is not one), not on a
// file outside them; «Канбан» on a file with statuses — one line (the board by the view switch, fix-49).

const NOW = new Date(2026, 9, 16, 11, 0);
const MID = [
  '#+TODO: TODO NEXT WAIT | DONE',
  '* NEXT Переезд хранилища',
  ':LOGBOOK:',
  '- Note taken on [2026-10-15 Чт 10:00] \\\\',
  '  замеры готовы',
  ':END:',
  '* Квартальный план команды',
  ':PROPERTIES:',
  ':WAITING_ON: бизнес',
  ':END:',
  '* TODO Миграция биллинга',
  '',
].join('\n');
const WORK = ['* Заметки', 'текст', ''].join('\n');
const MIDTERM = '/mock/Midterm.org';
const store = (page: Page, code: string) => page.evaluate(async (c) => new Function('store', `return (async () => { ${c} })()`)((await import('/src/store.svelte.ts' as string)).store), code);

async function open(page: Page) {
  const old = new Date(2026, 8, 1).getTime();
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript((m) => ((window as any).__mtimeInit = m), { [MIDTERM]: old, '/mock/Work.org': old });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { [MIDTERM]: MID, '/mock/Work.org': WORK }, plugins: { 'long-matters': ['index.read', 'files.edit'], kanban: ['index.read', 'files.edit'] }, now: NOW, ready: false, viewport: { width: 1440, height: 900 } });
  await expect.poll(() => store(page, 'return store.loaded')).toBe(true);
}
const tree = (page: Page, name: string) => page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name });
const col = (page: Page) => page.getByRole('complementary', { name: 'Структура' });
const card = (page: Page, name: string) => col(page).getByRole('region', { name });

test('«Долгие дела» on Midterm: the groups, «Открыть список»; under the caret the matter and its actions with the keys', async ({ page }) => {
  await open(page);
  await tree(page, 'Midterm').click();
  const c = card(page, 'Долгие дела');
  await expect(c).toBeVisible();
  await expect(c.getByRole('button', { name: /Долгие дела/ })).toHaveText(/Долгие дела\s*3/);
  await expect(c.locator('.fc-stat')).toHaveText(['2пора проверить', '0ждём', '1в норме']); // a waiting one past its day is due
  // under the caret
  await page.locator('.cm-line', { hasText: 'Переезд хранилища' }).click();
  await expect(c.locator('.lm-cur')).toHaveText(/NEXT\s*Переезд хранилища/);
  await expect(c.locator('.lm-facts')).toContainText('без касания · проверить');
  await expect(c.locator('.lm-facts')).toContainText('замеры готовы');
  await expect(c.getByRole('button', { name: /Проверить через…/ })).toHaveText('Проверить через…⌃C K R');
  await expect(c.getByRole('button', { name: /^Ждём…/ })).toHaveText('Ждём…⌃C K W');
  await expect(c.getByRole('button', { name: /Осмотрено/ })).toHaveText('Осмотрено⌃C K O');
  // «Осмотрено» from the card on an overdue one: it goes to «в норме»
  await page.locator('.cm-line', { hasText: 'Миграция биллинга' }).click();
  await expect(c.locator('.lm-cur')).toHaveText(/TODO\s*Миграция биллинга/);
  await c.getByRole('button', { name: /Осмотрено/ }).click();
  await expect(c.locator('.fc-stat')).toHaveText(['1пора проверить', '0ждём', '2в норме']);
  // a waiting one: «Больше не ждём»
  await page.locator('.cm-line', { hasText: 'Квартальный план' }).click();
  await expect(c.getByRole('button', { name: /Больше не ждём/ })).toBeVisible();
  // the file's first line is no matter: the actions are there, off
  await page.locator('.cm-line', { hasText: '#+TODO' }).click();
  await expect(c.locator('.lm-none')).toHaveText('Курсор не на долгом деле');
  await expect(c.getByRole('button', { name: /Проверить через…/ })).toBeDisabled();
  // «Открыть список»
  await c.getByRole('button', { name: 'Открыть список' }).click();
  await expect(page.getByRole('grid', { name: 'Долгие дела' })).toBeVisible();
  expect(await disk(page, MIDTERM)).toContain('* NEXT Переезд хранилища');
});

test('a file outside the sources: no card of «Долгие дела»; «Канбан» on a file with statuses: its line, the board by ⌥⌘B', async ({ page }) => {
  await open(page);
  await tree(page, 'Work').click();
  await expect(col(page)).toBeVisible();
  await expect(card(page, 'Долгие дела')).toHaveCount(0);
  await expect(card(page, 'Канбан')).toHaveCount(0); // no statuses
  await tree(page, 'Midterm').click();
  const k = card(page, 'Канбан');
  await expect(k).toBeVisible();
  // the cards higher than 45 % of a short column: the second folded (fix #296) — a click on its head opens it
  const head = k.locator('[aria-expanded="false"]');
  if (await head.count()) await head.first().click();
  await expect(k.locator('.kb-fcard > span')).toHaveText('Колонки — статусы файла');
  // no «Открыть доской» (fix-49): ⌥⌘B and «Показывать как ›» show the board
  await expect(k.getByRole('button', { name: /Открыть доской/ })).toHaveCount(0);
  // the cards in the sidebar's order: «Долгие дела» before «Канбан»
  const [a, b] = await Promise.all([card(page, 'Долгие дела').boundingBox(), k.boundingBox()]);
  expect(a!.y).toBeLessThan(b!.y);
  await page.keyboard.press('Alt+Meta+b');
  await expect(page.getByRole('application', { name: /^Доска/ })).toBeVisible();
});
