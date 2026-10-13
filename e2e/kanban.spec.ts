import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet, pluginsReady } from './tauriMock';
import { FILES } from './kanbanFixture';

// ТЗ 33 (part A): the plugin «Канбан» — an Org file shown as a board through the API's view of a file: «Показать как ›»
// in a tab's menu, ⌥⌘B, the choice of a workflow (#+BOARD), the columns and the cards, the filter, folding, the
// headings not on it, «Открыть доску» right of #+BOARD in the text.

const P = '/mock/work/platform.org';
const disk = (page: Page, p = P) => page.evaluate((x) => (window as any).__disk[x] as string, p);
const board = (page: Page) => page.locator('.kanban');
const col = (page: Page, kw: string) => board(page).getByRole('listitem', { name: kw, exact: true });
const cards = (page: Page, kw: string) => col(page, kw).locator('.kb-card .kb-t');

async function open(page: Page, files: Record<string, string> = FILES()) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, files);
  await page.goto('/');
  await pluginsReady(page);
  await page.getByRole('treeitem', { name: /work/ }).click();
  await page.getByRole('treeitem', { name: /platform/ }).click();
}

test('a file with #+BOARD opens as its board: the columns of the workflow, the cards of level 1 in the file\'s order', async ({ page }) => {
  await open(page);
  await expect(board(page)).toBeVisible();
  await expect(page.locator('.tab.on [data-view="kanban.board"]')).toBeVisible(); // the tab's icon says the view
  await expect(board(page).locator('.kb-name')).toHaveText('platform.org');
  await expect(board(page).getByRole('button', { name: /Workflow:/ })).toContainText('Разработка');
  await expect(board(page).locator('.kb-col').locator('.kb-kw')).toHaveText(['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'DONE', 'CANCELLED']);
  await expect(cards(page, 'TODO')).toHaveText(['Нагрузочное тестирование биллинга', 'Обновить Kafka до 3.8', 'Дашборд SLA для поддержки']);
  await expect(cards(page, 'TODO').nth(1).locator('b')).toHaveText('Kafka');
  const load = col(page, 'TODO').locator('.kb-card').first();
  await expect(load.locator('.kb-pr')).toHaveText('#A');
  await expect(load.locator('.kb-date')).toHaveClass(/late/);
  await expect(col(page, 'DOING').locator('.kb-prog')).toHaveText('2/5');
  await expect(col(page, 'REVIEW').locator('.kb-prog')).toHaveText('2/2');
  await expect(col(page, 'DOING').locator('.kb-tags')).toHaveText(':infra:dc:');
  // finished: the recent ones and «Ещё 1 старая ›»; CANCELLED folded
  await expect(cards(page, 'DONE')).toHaveText(['Дашборд SLA в проде']);
  await col(page, 'DONE').getByRole('button', { name: 'Ещё 1 старая ›' }).click();
  await expect(cards(page, 'DONE')).toHaveCount(2);
  await expect(board(page).getByRole('listitem', { name: 'CANCELLED: 1, свёрнута' })).toBeVisible();
});

test('the filter by words and :tags: — the counts say how many of all; folding a column is kept', async ({ page }) => {
  await open(page);
  await board(page).getByLabel('Фильтр карточек').fill(':infra:');
  await expect(cards(page, 'TODO')).toHaveText(['Обновить Kafka до 3.8']);
  await expect(col(page, 'TODO').locator('.kb-n')).toHaveText('1 из 3');
  await board(page).getByLabel('Фильтр карточек').fill('');
  await col(page, 'BACKLOG').getByRole('button', { name: /BACKLOG/ }).click();
  await expect(board(page).getByRole('listitem', { name: 'BACKLOG: 2, свёрнута' })).toBeVisible();
  await page.reload();
  await expect(board(page).getByRole('listitem', { name: 'BACKLOG: 2, свёрнута' })).toBeVisible();
  await board(page).getByRole('listitem', { name: 'CANCELLED: 1, свёрнута' }).click();
  await expect(cards(page, 'CANCELLED')).toHaveText(['Отменённое']);
});

test('«Не на доске»: the headings of no status or another set; one opens the text at it', async ({ page }) => {
  await open(page);
  await board(page).getByRole('button', { name: /Не на доске: 2 заголовка/ }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Заметки по ДЦ', 'NEXT Позвонить провайдеру']);
  await page.getByRole('menuitem', { name: 'NEXT Позвонить провайдеру' }).click();
  await expect(board(page)).toHaveCount(0);
  await expect(page.locator('.cm-activeLine')).toContainText('Позвонить провайдеру');
});

test('«Текст ⌥⌘B», ⌥⌘B, «Показать как ›» in the tab\'s menu; the link right of #+BOARD; the view is kept per file', async ({ page }) => {
  await open(page);
  await board(page).getByRole('button', { name: /Текст/ }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.locator('.cm-line-link')).toHaveText('Открыть доску ⌥⌘B');
  await page.locator('.cm-line-link').click();
  await expect(board(page)).toBeVisible();
  await page.keyboard.press('Alt+Meta+b');
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.locator('.tab.on').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Показать как' }).hover();
  await expect(page.getByRole('menuitem', { name: /Текст/ })).toBeVisible();
  await expect(page.getByText('Виды добавляют плагины')).toBeVisible();
  await page.getByRole('menuitem', { name: /Доска/ }).click();
  await expect(board(page)).toBeVisible();
  // the text chosen is remembered for the file
  await page.keyboard.press('Alt+Meta+b');
  await page.getByRole('treeitem', { name: /inbox/ }).click();
  await page.getByRole('treeitem', { name: /platform/ }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(board(page)).toHaveCount(0);
});

test('the first board of a file: the choice of a workflow with the counts; «Показать доску» writes #+BOARD, ⌘Z takes it back', async ({ page }) => {
  await open(page, FILES(false));
  await expect(page.locator('.cm-content')).toBeVisible(); // no #+BOARD: the text
  await page.keyboard.press('Alt+Meta+b');
  const sheet = page.getByRole('dialog', { name: 'Показать как доску' });
  await expect(sheet).toContainText('Показать platform.org как доску');
  await expect(sheet.getByRole('radio', { name: /Разработка/ })).toBeChecked(); // the most headings
  await expect(sheet.getByRole('radio', { name: /Разработка/ })).toContainText('10 из 12 заголовков');
  await expect(sheet.getByRole('radio', { name: /Задачи/ })).toContainText('1 из 12 заголовков'); // a status is in one set only: TODO and DONE are «Разработка»'s
  await sheet.getByRole('radio', { name: /Задачи/ }).click();
  await expect(sheet).toContainText('#+BOARD: Задачи');
  await sheet.getByRole('button', { name: 'Показать доску' }).click();
  await expect.poll(() => disk(page)).toContain('#+TITLE: Платформа\n#+BOARD: Задачи\n');
  await expect(board(page).locator('.kb-kw').first()).toHaveText('NEXT');
  // ⌘Z takes the line back, and the board goes back to the text
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page)).not.toContain('#+BOARD');
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.keyboard.press('Alt+Meta+b');
  await page.getByRole('dialog', { name: 'Показать как доску' }).getByRole('button', { name: 'Показать доску' }).click();
  await expect.poll(() => disk(page)).toContain('#+BOARD: Разработка\n');
  // another workflow from the menu; «Убрать доску»
  await board(page).getByRole('button', { name: /Workflow:/ }).click();
  await page.getByRole('menuitem', { name: 'Задачи' }).click();
  await expect.poll(() => disk(page)).toContain('#+BOARD: Задачи\n');
  await board(page).getByRole('button', { name: /Workflow:/ }).click();
  await page.getByRole('menuitem', { name: 'Убрать доску' }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect.poll(() => disk(page)).not.toContain('#+BOARD');
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page)).toContain('#+BOARD: Задачи');
});

test('cancelled choice goes back to the text; a workflow not in the settings says so', async ({ page }) => {
  await open(page, FILES(false));
  await page.keyboard.press('Alt+Meta+b');
  await page.getByRole('dialog', { name: 'Показать как доску' }).getByRole('button', { name: 'Отмена' }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
  expect(await disk(page)).not.toContain('#+BOARD');

  const p2 = await page.context().browser()!.newPage();
  const files = FILES();
  files[P] = files[P].replace('#+BOARD: Разработка', '#+BOARD: Нет такого');
  await open(p2, files);
  await expect(board(p2).getByRole('status')).toContainText('Workflow «Нет такого» не найден в настройках статусов');
  await expect(board(p2).getByRole('button', { name: 'Выбрать workflow' })).toBeVisible();
  await p2.close();
});

test('«Настройки → Канбан»: the finished days and folding the cancelled ones', async ({ page }) => {
  await open(page);
  await openSettingsSheet(page, 'Канбан');
  const sheet = page.getByRole('dialog', { name: 'Настройки' });
  await sheet.getByRole('radio', { name: 'все' }).click();
  await sheet.getByRole('switch', { name: 'Сворачивать колонки отмены' }).click();
  await page.keyboard.press('Escape');
  await expect(cards(page, 'DONE')).toHaveCount(2);
  await expect(cards(page, 'CANCELLED')).toHaveText(['Отменённое']);
});
