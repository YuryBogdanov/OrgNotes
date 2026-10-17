import { expect, test, type Page } from '@playwright/test';
import { diskAll, openApp } from './helpers';
import { pluginsReady } from './tauriMock';
import { FILES, NOW } from './inboxFixture';

// ТЗ 41.1 (§1, on ТЗ 46): a review in the file — the Inbox's in the new interface is a mode of the inbox file's tab:
// narrowed to the task, the strip «Разбор inbox › …», the core's card «Разбор Inbox» first in the column (the number,
// «из 4 · осталось 3», the segments, the actions in a column with their keys, «← Назад», «Закончить ⎋»), «Очередь»
// for «Структура»; ⌘1… from the text; ⎋ ends it, the whole file again.

const store = (page: Page, code: string) => page.evaluate(async (c) => new Function('store', `return (async () => { ${c} })()`)((await import('/src/store.svelte.ts' as string)).store), code);
const col = (page: Page) => page.getByRole('complementary', { name: 'Структура' });
const scard = (page: Page) => col(page).getByRole('region', { name: 'Разбор Inbox' });
const strip = (page: Page) => page.getByRole('status', { name: 'Разбор Inbox' });
const queue = (page: Page) => col(page).getByRole('group', { name: 'Очередь разбора' });

async function open(page: Page, width = 1440) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: FILES(), plugins: { inbox: ['index.read', 'files.edit'], calendar: ['index.read', 'files.edit'] }, now: NOW, ready: false, viewport: { width, height: 900 } });
  await expect.poll(() => store(page, 'return store.loaded')).toBe(true);
  await pluginsReady(page);
}
async function start(page: Page) {
  await page.keyboard.press('Shift+Meta+r');
  await expect(scard(page)).toBeVisible();
}

test('⇧⌘R: no tab of its own — the inbox file narrowed to the first task, the strip, the card, the queue', async ({ page }) => {
  await open(page);
  await start(page);
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(page.getByRole('tab').first()).toContainText('inbox');
  await expect(strip(page)).toContainText('Разбор');
  await expect(strip(page)).toContainText('inbox › Идея: ежемесячный обзор рисков'); // the oldest first
  await expect(strip(page)).toContainText('⌘↩ дальше');
  await expect(strip(page).getByRole('button', { name: /Закончить/ })).toBeVisible();
  // the strip the whole width; the column under it
  const s = (await strip(page).boundingBox())!;
  expect(Math.round(s.x + s.width)).toBe(1440);
  expect((await col(page).boundingBox())!.y).toBeGreaterThanOrEqual(s.y + s.height - 1);
  // narrowed: only this task's lines
  await expect(page.locator('.cm-line', { hasText: 'Позвонить в банк' })).toHaveCount(0);
  // the card
  await expect(scard(page).locator('.count')).toHaveText('1из 4 · осталось 3');
  await expect(scard(page).locator('.segs span')).toHaveCount(4);
  await expect(scard(page).locator('.act .l')).toHaveText(['Выполнено', 'Отменить', 'Перенести…', 'Отложить…', 'Пропустить']);
  await expect(scard(page).locator('.act').first()).toContainText('DONE');
  await expect(scard(page).locator('.act').first()).toContainText('⌘1');
  await expect(scard(page).locator('.act.main')).toHaveText(/Перенести…/);
  // the queue in place of «Структура»; the Inbox's own card not shown
  await expect(col(page).getByRole('button', { name: /^Очередь/ })).toContainText('4');
  await expect(queue(page).locator('.row')).toHaveCount(4);
  await expect(queue(page).locator('.row.on')).toContainText('Идея');
  await expect(queue(page).locator('.row').first().locator('.note')).toHaveText(/^\d+ \S{3}$/); // the day it came: «13 окт»
  await expect(col(page).getByRole('region', { name: 'Inbox', exact: true })).toHaveCount(0);
  // the sidebar's «Входящие»: the plain list, the task on the card lit, no progress, no «Закончить» (ТЗ 46 §7)
  await page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: /Входящие/ }).click();
  const panel = page.locator('.inbox');
  await expect(panel.locator('.row.now')).toContainText('Идея');
  await expect(panel.locator('.prog .segs')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Закончить' })).toHaveCount(0);
});

test('⌘1 from the text: DONE written, the next task; its segment and its row say so; ⌘[ back', async ({ page }) => {
  await open(page);
  await start(page);
  await page.locator('.cm-content').click();
  const second = (await queue(page).locator('.row .t').nth(1).textContent())!;
  await page.keyboard.press('Meta+1');
  await expect(strip(page)).toContainText(second);
  await expect.poll(async () => (await diskAll(page))['/mock/inbox.org']).toContain('* DONE Идея: ежемесячный обзор рисков');
  await expect(scard(page).locator('.count')).toHaveText('2из 4 · осталось 2');
  const first = queue(page).locator('.row').first();
  await expect(first).toHaveClass(/faded/);
  await expect(first).toContainText('DONE');
  // letters are typed in the task's text
  await page.locator('.cm-content').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' R');
  await expect.poll(async () => (await diskAll(page))['/mock/inbox.org']).toContain(' R');
  await expect(strip(page)).toContainText(second); // typing is not an action
  await page.keyboard.press('Meta+[');
  await expect(strip(page)).toContainText('Идея: ежемесячный обзор рисков');
});

test('leaving the tab keeps it; ⎋ ends it — the whole file, the strip gone, «Структура» back', async ({ page }) => {
  await open(page);
  await start(page);
  await page.locator('.cm-content').click();
  const second = (await queue(page).locator('.row .t').nth(1).textContent())!;
  await page.keyboard.press('Meta+5'); // «Пропустить»
  await expect(strip(page)).toContainText(second);
  await store(page, "store.open(store.files.findIndex((f) => f.path === '/mock/Работа/work.org'), 0, false)");
  await expect(scard(page)).toHaveCount(0);
  await store(page, "store.open(store.files.findIndex((f) => f.path === '/mock/inbox.org'), 0, false)");
  await expect(strip(page)).toContainText(second);
  await expect(queue(page).locator('.row').first()).toContainText('пропущена');
  await page.locator('.cm-content').click();
  await page.keyboard.press('Escape');
  await expect(scard(page)).toHaveCount(0);
  await expect(page.getByRole('status', { name: 'Сужено' })).toHaveCount(0);
  await expect(page.locator('.cm-line', { hasText: 'Проверить доступы подрядчика' })).toBeVisible();
  await expect(col(page).getByRole('button', { name: /^Структура/ })).toBeVisible();
});

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const cal = (page: Page) => col(page).getByRole('region', { name: 'Календарь' });

test('«Календарь» under the card: the month, today framed; a day — its list and «Отложить сюда»; ⌘K folds it', async ({ page }) => {
  await open(page);
  await start(page);
  await expect(cal(page)).toBeVisible();
  await expect(cal(page).locator('.cell.today')).toHaveText(String(NOW.getDate()));
  const tomorrow = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 1);
  if (tomorrow.getMonth() !== NOW.getMonth()) await cal(page).getByRole('button', { name: 'Следующий месяц' }).click();
  await cal(page).locator('.cell:not(.out)', { hasText: new RegExp(`^${tomorrow.getDate()}$`) }).click();
  const pop = page.getByRole('dialog', { name: /^День / });
  await expect(pop).toBeVisible();
  const second = (await queue(page).locator('.row .t').nth(1).textContent())!;
  await pop.getByRole('button', { name: 'Отложить сюда' }).click();
  await expect.poll(async () => (await diskAll(page))['/mock/inbox.org']).toMatch(new RegExp(`\\* TODO Идея: ежемесячный обзор рисков\\nSCHEDULED: <${ymd(tomorrow)}`));
  await expect(strip(page)).toContainText(second);
  await expect(queue(page).locator('.row').first()).toContainText('отложено до');
  // ⌘K from the text folds and unfolds it
  await page.locator('.cm-content').click();
  await page.keyboard.press('Meta+k');
  await expect(cal(page).locator('.grid')).toHaveCount(0);
  await page.keyboard.press('Meta+k');
  await expect(cal(page).locator('.grid')).toBeVisible();
});

test('⌘4 «Отложить…»: «Отложить до…» left of the card — the days with their dates; a choice writes SCHEDULED', async ({ page }) => {
  await open(page);
  await start(page);
  await page.locator('.cm-content').click();
  await page.keyboard.press('Meta+4');
  const m = page.getByRole('menu');
  await expect(m.getByRole('menuitem', { name: /Завтра/ })).toBeVisible();
  await expect(m.getByRole('menuitem', { name: /Выбрать дату/ })).toBeVisible();
  expect((await m.boundingBox())!.x + (await m.boundingBox())!.width).toBeLessThanOrEqual((await scard(page).boundingBox())!.x + 2);
  await m.getByRole('menuitem', { name: /Завтра/ }).click();
  const tomorrow = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 1);
  await expect.poll(async () => (await diskAll(page))['/mock/inbox.org']).toContain(`SCHEDULED: <${ymd(tomorrow)}`);
  await expect(scard(page).locator('.count')).toHaveText(/^2из 4/);
});

test('the summary: the outcomes, «Разобрать пропущенные» goes through them again; ⎋ «Готово»', async ({ page }) => {
  await open(page);
  await start(page);
  await page.locator('.cm-content').click();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Meta+5');
    if (i < 3) await expect(scard(page).locator('.count')).toHaveText(new RegExp(`^${i + 2}из`));
  }
  const done = col(page).getByRole('region', { name: 'Разбор окончен' });
  await expect(done).toBeVisible();
  await expect(done.locator('.sum')).toHaveText(['4пропущено']);
  await expect(page.getByRole('status', { name: 'Разбор Inbox' })).toHaveCount(0); // the whole file
  await done.getByRole('button', { name: /Разобрать пропущенные/ }).click();
  await expect(scard(page).locator('.count')).toHaveText('1из 4 · осталось 3');
  await page.locator('.cm-content').click();
  await page.keyboard.press('Escape');
  await expect(scard(page)).toHaveCount(0);
});

test('the column hidden: «1 из 4» and «Действия ▾» in the strip, the actions there with their keys', async ({ page }) => {
  await open(page, 860);
  await start2(page);
  await expect(strip(page).locator('.cnt')).toHaveText('1 из 4');
  await strip(page).getByRole('button', { name: /Действия/ }).click();
  const m = page.getByRole('menu');
  await expect(m.getByRole('menuitem', { name: /Выполнено/ })).toContainText('⌘1');
  await m.getByRole('menuitem', { name: /Пропустить/ }).click();
  await expect(strip(page).locator('.cnt')).toHaveText('2 из 4');
});
async function start2(page: Page) {
  await page.keyboard.press('Shift+Meta+r');
  await expect(strip(page)).toBeVisible();
}
