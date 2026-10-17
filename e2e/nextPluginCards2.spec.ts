import { expect, test, type Page } from '@playwright/test';
import { diskAll, openApp } from './helpers';
import { CONFIG, FILES, NOW, PETROV } from './goalsFixture';

// ТЗ 44.7 (§5), the second half: the cards of the Inbox (its file: how many and how old, «Разобрать ⇧⌘R»; under the
// caret the task and the core's actions with their keys) and of «Цели квартала» (a person's file: the goals of the
// quarter, the silent one in `todo` and in words, «Разбор целей на 1-1», «Отметить прогресс…»).

const INBOX = ['* TODO Позвонить в типографию', ':PROPERTIES:', ':CREATED: [2026-10-08 Чт 10:00]', ':END:', '* TODO Купить бумагу', ':PROPERTIES:', ':CREATED: [2026-10-11 Вс 09:00]', ':END:', ''].join('\n');
const store = (page: Page, code: string) => page.evaluate(async (c) => new Function('store', `return (async () => { ${c} })()`)((await import('/src/store.svelte.ts' as string)).store), code);

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { ...FILES({ ...CONFIG, inbox: { file: 'inbox.org' } }), '/mock/inbox.org': INBOX }, plugins: { inbox: ['index.read', 'files.edit'], 'quarter-goals': ['index.read', 'files.edit'] }, now: NOW, ready: false, viewport: { width: 1440, height: 900 } });
  await expect.poll(() => store(page, 'return store.loaded')).toBe(true);
}
const col = (page: Page) => page.getByRole('complementary', { name: 'Структура' });
const card = (page: Page, name: string) => col(page).getByRole('region', { name });
const show = (page: Page, path: string) => store(page, `store.open(store.files.findIndex((f) => f.path === '${path}'), 0)`);

test('the Inbox\'s card: 2 записи, the oldest 4 days; under the caret its actions with the keys; «Удалить» takes it out', async ({ page }) => {
  await open(page);
  await show(page, '/mock/inbox.org');
  const c = card(page, 'Inbox');
  await expect(c).toBeVisible();
  await expect(c.locator('.fc-stat')).toHaveText(['2записи', '4 дн.самой старой']);
  await expect(c.getByRole('button', { name: /Разобрать/ })).toHaveText('Разобрать⇧⌘R');
  await page.locator('.cm-line', { hasText: 'Купить бумагу' }).click();
  await expect(c.locator('.ib-cur')).toHaveText('Купить бумагу');
  await expect(c.getByRole('button', { name: /Перенести/ })).toHaveText('Перенести⌃C ⌃W');
  await expect(c.getByRole('button', { name: /Запланировать/ })).toHaveText('Запланировать⌃C S');
  await expect(c.getByRole('button', { name: /Теги/ })).toHaveText('Теги⌃C Q');
  await c.getByRole('button', { name: 'Удалить' }).click();
  await expect.poll(async () => (await diskAll(page))['/mock/inbox.org']).not.toContain('Купить бумагу');
  await expect(c.locator('.fc-stat').first()).toHaveText('1запись');
  // not the Inbox file: no card
  await show(page, PETROV);
  await expect(card(page, 'Цели квартала')).toBeVisible();
  await expect(card(page, 'Inbox')).toHaveCount(0);
});

test('«Цели квартала» on a person\'s file: the goals, the silent one, «Разбор целей на 1-1»', async ({ page }) => {
  await open(page);
  await show(page, PETROV);
  const c = card(page, 'Цели квартала');
  await expect(c.getByRole('button', { name: /Цели квартала/ })).toHaveText(/Цели квартала\s*3/);
  const rows = c.getByRole('group', { name: 'Цели квартала' }).getByRole('button');
  await expect(rows).toHaveText(['Внедрить дежурства по on-callэта нед.', 'Сократить время сборки CI до 10 минут2 нед.', 'Наставничество для двух мидловнет отметок']);
  await expect(rows.nth(1).locator('.qg-dot')).toHaveClass(/silent/);
  await expect(c.locator('.qg-note')).toHaveText('«Сократить время сборки CI до 10 минут» не обсуждали 2 недели.');
  // a row goes to its goal
  await rows.nth(2).click();
  await expect.poll(() => store(page, 'return store.tab.cursor.line')).toBeGreaterThan(30);
  await c.getByRole('button', { name: 'Разбор целей на 1-1' }).click();
  await expect(page.getByText('Разбор целей').first()).toBeVisible();
});
