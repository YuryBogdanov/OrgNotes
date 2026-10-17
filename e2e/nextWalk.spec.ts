import { expect, test, type Page } from '@playwright/test';
import { diskAll, openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// ТЗ 41.2–41.3: «Обход долгих дел» in the new interface — ⌃⌘O (the card's «Обход», the palette) walks «Пора
// проверить» on the core's review in the file: the files in turn, «Очередь» by files, the age red; the card's field
// «Новый статус» (↩ a note, the focus stays) and the decisions ⌘1–⌘5 — the status typed goes in the same step;
// «Осмотрено» leaves the file as it is; «В архив» the core's command; nothing due — said, no walk.

const NOW = new Date(2026, 9, 16, 11, 0);
const MID = [
  '#+TODO: TODO NEXT WAIT | DONE',
  '* NEXT Миграция биллинга',
  'Описание.',
  '* WAIT Квартальный план команды',
  ':PROPERTIES:',
  ':WAITING_ON: бизнес',
  ':END:',
  '',
].join('\n');
const WORK = ['#+TODO: TODO NEXT WAIT | DONE', '* TODO Обновить онбординг :long:', '* TODO Просто задача', ''].join('\n');
const MIDTERM = '/mock/Midterm.org';
const WORKF = '/mock/work.org';

const col = (page: Page) => page.getByRole('complementary', { name: 'Структура' });
const scard = (page: Page) => col(page).getByRole('region', { name: 'Обход долгих дел' });
const strip = (page: Page) => page.getByRole('status', { name: 'Обход долгих дел' });
const queue = (page: Page) => col(page).getByRole('group', { name: 'Очередь разбора' });
const field = (page: Page) => scard(page).getByRole('textbox', { name: 'Новый статус' });
const disk = async (page: Page, p: string) => (await diskAll(page))[p];
const undo = (page: Page) => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.undoLast());

async function open(page: Page, o: { mid?: string; work?: string; old?: boolean } = {}) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  const old = new Date(2026, 8, 1).getTime(); // 45 days ago: all overdue
  if (o.old !== false) await page.addInitScript((m) => ((window as any).__mtimeInit = m), { [MIDTERM]: old, [WORKF]: old });
  await openApp(page, { files: { [MIDTERM]: o.mid ?? MID, [WORKF]: o.work ?? WORK }, now: NOW, ready: false, viewport: { width: 1440, height: 900 } });
  await pluginsReady(page);
}
async function start(page: Page) {
  await page.keyboard.press('Control+Meta+o');
  await expect(scard(page)).toBeVisible();
}
/** The titles of the queue, in order. */
const titles = (page: Page) => queue(page).locator('.row .t').allTextContents();

test('⌃⌘O: the first matter narrowed, the strip «Обход», the card — the line, the field, the decisions; «Очередь» by files, the age red', async ({ page }) => {
  await open(page);
  await start(page);
  await expect(strip(page)).toContainText('Обход');
  await expect(scard(page).locator('.count')).toHaveText('1из 3 · осталось 2');
  await expect(scard(page).locator('.act .l')).toHaveText(['Продолжаем', 'Ждём…', 'Осмотрено', 'В архив', 'Закрыть']);
  await expect(scard(page).locator('.act').nth(0)).toContainText('⌘1');
  await expect(scard(page).locator('.act.main')).toHaveText(/Продолжаем/);
  if ((await titles(page))[0].includes('Квартальный')) await expect(scard(page).locator('.act.main')).toContainText('WAIT → TODO'); // no :LOGBOOK: — the first open status
  await expect(scard(page).locator('.wk .facts')).toContainText('без касания');
  await expect(scard(page).locator('.wk .facts')).toContainText('проверить надо было');
  await expect(field(page)).toBeFocused();
  await expect(scard(page).getByRole('radio', { name: '2 нед.' })).toHaveAttribute('aria-checked', 'true');
  await expect(queue(page).locator('.grp')).toHaveText(['Midterm', 'work']);
  await expect(queue(page).locator('.row').nth(1).locator('.note')).toHaveClass(/late/);
  await expect(queue(page).locator('.row').nth(1).locator('.note')).toHaveText(/дн\.$/);
  // letters are typed in the field; a plain «1» is a letter
  await page.keyboard.type('жду 1 ответ');
  await expect(field(page)).toHaveValue('жду 1 ответ');
  await expect(scard(page).locator('.count')).toHaveText(/^1из/);
});

test('the status typed and ⌘1 «Продолжаем»: the note and :NEXT_REVIEW: — one step; ⌘Z takes both back', async ({ page }) => {
  await open(page);
  await start(page);
  const first = (await titles(page))[0];
  const file = first.includes('онбординг') ? WORKF : MIDTERM;
  const before = await disk(page, file);
  await field(page).fill('согласовали объём');
  await page.keyboard.press('Meta+1');
  await expect(scard(page).locator('.count')).toHaveText(/^2из 3/);
  await expect.poll(() => disk(page, file)).toContain('согласовали объём');
  expect(await disk(page, file)).toContain(':NEXT_REVIEW: [2026-10-30');
  await expect(queue(page).locator('.row').first().locator('.note')).toContainText('2 нед.');
  await expect(field(page)).toHaveValue('');
  await undo(page);
  await expect.poll(() => disk(page, file)).toBe(before);
});

test('↩ in the field writes the note, the focus stays; ⌘3 «Осмотрено» leaves the file as it is; the next matter in the other file', async ({ page }) => {
  await open(page);
  await start(page);
  const ts = await titles(page);
  await field(page).fill('всё по плану');
  await page.keyboard.press('Enter');
  await expect(scard(page).locator('.hint')).toHaveText('Записано в журнал');
  await expect(field(page)).toBeFocused();
  await expect(field(page)).toHaveValue('');
  const mid = await disk(page, MIDTERM);
  const work = await disk(page, WORKF);
  expect(mid + work).toContain('всё по плану');
  await page.keyboard.press('Meta+3');
  await expect(strip(page)).toContainText(ts[1]);
  expect(await disk(page, MIDTERM)).toBe(mid);
  expect(await disk(page, WORKF)).toBe(work);
  await expect(queue(page).locator('.row').first().locator('.note')).toHaveText('осмотрено');
  // to the matter in work.org: the same tab, «другой файл»
  await queue(page).locator('.row', { hasText: 'Обновить онбординг' }).click();
  await expect(strip(page)).toContainText('work › Обновить онбординг');
  await expect(page.getByRole('tab')).toHaveCount(1);
});

test('⌘4 «В архив»: the matter with the status typed to «Midterm.org_archive»; ⌘5 «Закрыть» — DONE', async ({ page }) => {
  await open(page);
  await start(page);
  await queue(page).locator('.row', { hasText: 'Миграция биллинга' }).click();
  await expect(strip(page)).toContainText('Миграция биллинга');
  await field(page).fill('отменили проект');
  await page.keyboard.press('Meta+4');
  await expect.poll(() => disk(page, '/mock/Midterm.org_archive')).toMatch(/\* NEXT Миграция биллинга\n:PROPERTIES:\n:ARCHIVE_TIME:[\s\S]*отменили проект/);
  expect(await disk(page, MIDTERM)).not.toContain('Миграция биллинга');
  await expect(queue(page).locator('.row', { hasText: 'Миграция биллинга' }).locator('.note')).toHaveText('в архив');
  await queue(page).locator('.row', { hasText: 'Обновить онбординг' }).click();
  await expect(strip(page)).toContainText('Обновить онбординг');
  await page.keyboard.press('Meta+5');
  await expect.poll(() => disk(page, WORKF)).toContain('* DONE Обновить онбординг');
});

test('the summary «Обход окончен»: the figures, «Пора проверить: …»; nothing due — said, no walk', async ({ page }) => {
  await open(page);
  await start(page);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Meta+Enter');
    if (i < 2) await expect(scard(page).locator('.count')).toHaveText(new RegExp(`^${i + 2}из`));
  }
  const done = col(page).getByRole('region', { name: 'Разбор окончен' });
  await expect(done).toBeVisible();
  await expect(done.locator('.head .t')).toHaveText('Обход окончен');
  await expect(done.locator('.sum')).toHaveText(['3пропущено']);
  await expect(done.locator('.enote')).toContainText('Пора проверить: 3.');
  await page.keyboard.press('Escape');
  await expect(done).toHaveCount(0);
});

test('nothing due: «Проверять нечего. Ближайшая проверка — …», no walk', async ({ page }) => {
  const later = (d: string) => `:PROPERTIES:\n:NEXT_REVIEW: [${d}]\n:END:\n`;
  await open(page, { mid: `#+TODO: TODO NEXT WAIT | DONE\n* NEXT Миграция биллинга\n${later('2026-10-23 Пт')}`, work: `* TODO Обновить онбординг :long:\n${later('2026-11-02 Пн')}` });
  await page.keyboard.press('Control+Meta+o');
  await expect(page.getByText('Проверять нечего. Ближайшая проверка — пт, 23 окт')).toBeVisible();
  await expect(scard(page)).toHaveCount(0);
});
