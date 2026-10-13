import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';
import { FILES, stamp } from './kanbanFixture';

// ТЗ 33 (part B): the board's actions — a card dragged to another column (its status, its place in the file) or within
// one (the order), a repeated task finished goes back with its date moved; ⇧← ⇧→ ⌥↑ ⌥↓; a new card; ← → ↑ ↓, ⌘F.

const P = '/mock/work/platform.org';
const disk = (page: Page) => page.evaluate((x) => (window as any).__disk[x] as string, P);
const board = (page: Page) => page.locator('.kanban');
const col = (page: Page, kw: string) => board(page).getByRole('listitem', { name: kw, exact: true });
const cards = (page: Page, kw: string) => col(page, kw).locator('.kb-card .kb-t');
const card = (page: Page, title: string) => board(page).locator('.kb-card', { hasText: title });
const tops = async (page: Page) => (await disk(page)).split('\n').filter((l) => /^\* /.test(l));

async function open(page: Page, extra: string[] = []) {
  await page.setViewportSize({ width: 2300, height: 900 }); // every column in view: a drop is a point of the window
  await installTauriMock(page, FILES(true, extra));
  await page.goto('/');
  await pluginsReady(page);
  await page.getByRole('treeitem', { name: /work/ }).click();
  await page.getByRole('treeitem', { name: /platform/ }).click();
  await expect(board(page)).toBeVisible();
}
/** Drag a card by the pointer onto a point of the window. */
async function dragTo(page: Page, title: string, to: { x: number; y: number }) {
  const b = (await card(page, title).boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x + 30, b.y + 20, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  return () => page.mouse.up();
}

test('a card dragged to another column: the tilted copy and the dashed place while dragged; its status and its place in the file; ⌘Z', async ({ page }) => {
  await open(page);
  const before = await disk(page);
  const doing = (await col(page, 'DOING').locator('.kb-card').first().boundingBox())!;
  const drop = await dragTo(page, 'Обновить Kafka до 3.8', { x: doing.x + 40, y: doing.y + doing.height + 20 });
  await expect(page.locator('.kb-drag')).toBeVisible();
  await expect(card(page, 'Обновить Kafka до 3.8')).toHaveClass(/ghost/);
  await expect(col(page, 'DOING').locator('.kb-ph')).toHaveCount(1);
  await drop();
  await expect(cards(page, 'DOING')).toHaveText(['Переезд в новый ДЦ', 'Обновить Kafka до 3.8']);
  // right after the card above it there (with its subtree)
  await expect.poll(async () => (await tops(page)).map((l) => l.replace(/\s+:.*$/, ''))).toEqual([
    '* BACKLOG [#C] Миграция логов в ClickHouse', '* BACKLOG Алерты v2: дизайн', '* TODO [#A] Нагрузочное тестирование биллинга', '* TODO Дашборд SLA для поддержки',
    '* DOING [#A] Переезд в новый ДЦ [2/5]', '* DOING Обновить *Kafka* до 3.8', '* REVIEW RFC логирования', '* Заметки по ДЦ', '* NEXT Позвонить провайдеру',
    '* DONE Дашборд SLA в проде', '* DONE Старая задача', '* CANCELLED Отменённое',
  ]);
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page)).toBe(before);
});

test('within a column the order of the file changes; to a finished one — CLOSED', async ({ page }) => {
  await open(page);
  const first = (await col(page, 'TODO').locator('.kb-card').first().boundingBox())!;
  await (await dragTo(page, 'Дашборд SLA для поддержки', { x: first.x + 40, y: first.y + 5 }))();
  await expect(cards(page, 'TODO')).toHaveText(['Дашборд SLA для поддержки', 'Нагрузочное тестирование биллинга', 'Обновить Kafka до 3.8']);
  const done = (await col(page, 'DONE').locator('.kb-card').first().boundingBox())!;
  await (await dragTo(page, 'Обновить Kafka до 3.8', { x: done.x + 40, y: done.y + 5 }))();
  await expect.poll(() => disk(page)).toMatch(/\* DONE Обновить \*Kafka\* до 3\.8 +:infra:\nCLOSED: \[/);
  await expect(card(page, 'Обновить Kafka до 3.8')).toHaveClass(/done/);
});

test('a repeated task to DONE: its date moves, it goes back to the first status and the window says the next date', async ({ page }) => {
  await open(page, ['* TODO Еженедельный отчёт', `SCHEDULED: <${stamp(0)} +1w>`]);
  const done = (await col(page, 'DONE').locator('.kb-card').first().boundingBox())!;
  await (await dragTo(page, 'Еженедельный отчёт', { x: done.x + 40, y: done.y + 5 }))();
  await expect.poll(() => disk(page)).toContain(`* BACKLOG Еженедельный отчёт\nSCHEDULED: <${stamp(7)} +1w>`);
  await expect(cards(page, 'BACKLOG')).toContainText(['Еженедельный отчёт']);
  await expect(page.locator('.toast')).toContainText('Повторяющаяся задача: следующая дата —');
});

test('the keys: ← → ↑ ↓ choose, ⇧→ ⇧← the status, ⌥↓ ⌥↑ the place, ⎋ lets go; ⌘F the filter', async ({ page }) => {
  await open(page);
  await card(page, 'Миграция логов в ClickHouse').click();
  await expect(card(page, 'Миграция логов в ClickHouse')).toHaveClass(/sel/);
  await page.keyboard.press('Escape'); // a click opens it at the side (part C): back to the board, the card still chosen
  await expect(card(page, 'Миграция логов в ClickHouse')).toHaveClass(/sel/);
  await page.keyboard.press('ArrowRight');
  await expect(card(page, 'Нагрузочное тестирование биллинга')).toHaveClass(/sel/);
  await page.keyboard.press('ArrowDown');
  await expect(card(page, 'Обновить Kafka до 3.8')).toHaveClass(/sel/);
  await page.keyboard.press('Shift+ArrowRight');
  await expect(cards(page, 'DOING')).toContainText(['Обновить Kafka до 3.8']);
  await expect.poll(() => disk(page)).toContain('* DOING Обновить *Kafka* до 3.8');
  await expect(card(page, 'Обновить Kafka до 3.8')).toHaveClass(/sel/); // still chosen
  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(() => disk(page)).toContain('* TODO Обновить *Kafka* до 3.8');
  await page.keyboard.press('Alt+ArrowUp');
  await expect(cards(page, 'TODO')).toHaveText(['Обновить Kafka до 3.8', 'Нагрузочное тестирование биллинга', 'Дашборд SLA для поддержки']);
  await page.keyboard.press('Alt+ArrowDown');
  await expect(cards(page, 'TODO').first()).toHaveText('Нагрузочное тестирование биллинга');
  await page.keyboard.press('Escape');
  await expect(board(page).locator('.kb-card.sel')).toHaveCount(0);
  await page.keyboard.press('Meta+f');
  await expect(board(page).getByLabel('Фильтр карточек')).toBeFocused();
});

test('a new card: «+» or «+ Карточка» — ↩ makes it after the column\'s last heading, the field stays; ⎋ leaves; none in a finished column', async ({ page }) => {
  await open(page);
  await expect(col(page, 'DONE').getByRole('button', { name: '+ Карточка' })).toHaveCount(0);
  await col(page, 'BACKLOG').getByRole('button', { name: 'Добавить карточку в BACKLOG' }).click();
  const field = col(page, 'BACKLOG').getByLabel('Новая карточка в BACKLOG');
  await field.fill('Скрипт ротации секретов');
  await page.keyboard.press('Enter');
  await expect(field).toHaveValue('');
  await expect.poll(() => disk(page)).toContain('* BACKLOG Алерты v2: дизайн                     :alerts:\n* BACKLOG Скрипт ротации секретов\n* TODO');
  await field.fill('Ещё одна');
  await page.keyboard.press('Escape');
  await expect(field).toHaveCount(0);
  expect(await disk(page)).not.toContain('Ещё одна');
  await expect(cards(page, 'BACKLOG')).toHaveText(['Миграция логов в ClickHouse', 'Алерты v2: дизайн', 'Скрипт ротации секретов']);
  // an empty column: at the end of the file; the palette has «Доска: новая карточка»
  await col(page, 'REVIEW').getByRole('button', { name: '+ Карточка' }).click();
  await page.keyboard.type('Ревью алертов');
  await page.keyboard.press('Enter');
  await expect.poll(() => disk(page)).toContain('* REVIEW RFC логирования                        :docs:\n- [X] раз\n- [X] два\n* REVIEW Ревью алертов\n');
});
