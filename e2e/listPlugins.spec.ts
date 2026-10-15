import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';
import { FILES as BOARD_FILES } from './kanbanFixture';
import { FILES as GOAL_FILES, NOW, PETROV } from './goalsFixture';

// ТЗ 34, part C1 (API 1.6): the board is a list of tasks of the core — a click chooses, the core's menu of a card with
// the board's «В архив» and «Удалить»; «действия с задачей» of a plugin — the goals' «Добавить отметку…» in the menu
// of a goal and in the palette's «ВЫДЕЛЕННАЯ ЗАДАЧА».

const P = '/mock/work/platform.org';
const board = (page: Page) => page.locator('.kanban');
const col = (page: Page, kw: string) => board(page).getByRole('listitem', { name: kw, exact: true });
const card = (page: Page, title: string) => board(page).locator('.kb-card', { hasText: title });
const menu = (page: Page) => page.locator('.menu').first();

test('the board: the core\'s menu of a card — «Статус» moves it to that column, ⌘Z; «В архив» and «Удалить» at its end', async ({ page }) => {
  await page.setViewportSize({ width: 2300, height: 900 });
  await installTauriMock(page, BOARD_FILES(true));
  await page.goto('/');
  await pluginsReady(page);
  await page.getByRole('treeitem', { name: /work/ }).click();
  await page.getByRole('treeitem', { name: /platform/ }).click();
  await expect(board(page)).toBeVisible();
  const disk = () => page.evaluate((x) => (window as any).__disk[x] as string, P);
  await card(page, 'Обновить Kafka до 3.8').click({ button: 'right' });
  await expect(card(page, 'Обновить Kafka до 3.8')).toHaveClass(/sel/);
  await expect(menu(page).locator('button .lb')).toHaveText(['Открыть', 'Открыть в тексте файла', 'Статус', 'Приоритет', 'Запланировать', 'Дедлайн', 'Теги…', 'Перенести в другой файл…', 'Копировать ссылку', 'В архив', 'Удалить']);
  await expect(menu(page).getByRole('menuitem', { name: 'Удалить' })).toHaveClass(/danger/);
  await menu(page).getByRole('menuitem', { name: 'Статус' }).hover();
  await page.locator('.menu').nth(1).getByRole('menuitem', { name: 'DOING' }).click();
  await expect.poll(disk).toContain('* DOING Обновить *Kafka* до 3.8');
  await expect(col(page, 'DOING').locator('.kb-card .kb-t')).toContainText(['Обновить Kafka до 3.8']); // at once in its column
  await page.keyboard.press('Meta+z');
  await expect.poll(disk).toContain('* TODO Обновить *Kafka* до 3.8');
  // the board's own items
  await card(page, 'Обновить Kafka до 3.8').click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: 'Удалить' }).click();
  await expect.poll(disk).not.toContain('Обновить *Kafka*');
});

test('«Добавить отметку…» of the goals: in the menu of a goal in the agenda and in the palette, writes the mark', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width: 1440, height: 900 });
  const files: Record<string, string> = GOAL_FILES();
  files[PETROV] = files[PETROV].replace('DEADLINE: <2026-11-30 Пн>', 'DEADLINE: <2026-10-20 Вт>'); // in the agenda's 30 days
  await installTauriMock(page, files);
  await page.goto('/');
  await pluginsReady(page);
  await page.keyboard.press('Meta+2');
  const goal = page.locator('.agenda .item', { hasText: 'Сократить время сборки CI' });
  await goal.click({ button: 'right' });
  await expect(menu(page).getByRole('menuitem', { name: 'Добавить отметку…' })).toBeVisible();
  await page.keyboard.press('Escape');
  // the palette's group has it too
  await goal.click();
  await page.keyboard.press('Meta+Shift+p');
  const pal = page.getByRole('dialog', { name: 'Командная палитра' });
  await expect(pal.getByRole('option', { name: /Задача: добавить отметку…/ })).toBeVisible();
  await page.keyboard.type('отметку');
  await page.keyboard.press('Enter');
  const form = page.getByRole('dialog', { name: /Отметка: Сократить время сборки CI/ });
  await expect(form).toBeVisible();
  await form.getByRole('textbox', { name: 'Отметка' }).fill('Кэш включили.');
  await form.getByRole('button', { name: 'Добавить' }).click();
  await expect.poll(() => page.evaluate((x) => (window as any).__disk[x] as string, PETROV)).toContain('- [2026-10-12 Пн] Кэш включили.');
});
