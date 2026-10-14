import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';
import { FILES as BOARD } from './kanbanFixture';
import { FILES } from './reviewFixture';

// Fix to ТЗ 18: «Далее» (⌘↩) — the task is gone through as it is now, with what was done on the card; and Enter on
// the card's narrowed editor (a new line at the end of the task was cut off from the shown part).

const IB = '/mock/inbox.org';
const disk = (page: Page) => page.evaluate((p) => (window as any).__disk[p] as string, IB);
const panel = (page: Page) => page.locator('.inbox');
const card = (page: Page) => page.locator('.review .card');
const queue = (page: Page) => panel(page).locator('.rrow');
const title = (page: Page) => card(page).locator('.cm-line').first();
const next = (page: Page) => page.getByRole('button', { name: /^Далее/ });

async function start(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, FILES());
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Inbox' }).click();
  await panel(page).getByRole('button', { name: 'Разобрать' }).click();
  await expect(card(page)).toBeVisible();
}

test('Enter at the end of the task makes a line the caret stays on; again; ⌥↩ a new list item; ⌘Z takes it back', async ({ page }) => {
  await start(page);
  await expect(title(page)).toContainText('Продлить страховку авто');
  await card(page).locator('.cm-line', { hasText: ':END:' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Позвонить агенту');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- полис');
  await page.keyboard.press('Alt+Enter'); // a new item, as in the editor of a file
  await page.keyboard.type('КАСКО');
  await expect.poll(() => disk(page)).toContain(':END:\nПозвонить агенту\n- полис\n- КАСКО\n');
  await expect(card(page).locator('.cm-line', { hasText: '- КАСКО' })).toBeVisible();
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page)).not.toContain('КАСКО');
});

test('«Далее» ⌘↩ after «Пропустить»: outlined, filled once the card is edited; the next card; «Разобрана · …»; the toast takes it back', async ({ page }) => {
  await start(page);
  await expect(next(page)).toBeVisible();
  await expect(next(page)).not.toHaveClass(/edited/);
  const labels = await page.locator('.review .bar button.a').allInnerTexts();
  expect(labels.map((l) => l.split('\n')[0].trim()).slice(-2)[1]).toMatch(/^Далее/);
  // an edit on the card: «Далее» is the main action now
  await card(page).locator('.cm-line').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+ArrowRight'); // TODO → NEXT
  await expect.poll(() => disk(page)).toContain('* NEXT Продлить страховку авто');
  await expect(next(page)).toHaveClass(/edited/);
  await page.keyboard.press('Meta+Enter');
  await expect(title(page)).toContainText('Позвонить в банк про лимиты');
  await expect(queue(page).first().locator('.sub')).toHaveText('Разобрана · NEXT');
  expect(await disk(page)).toContain('* NEXT Продлить страховку авто'); // nothing else written, still in the Inbox
  await expect(page.locator('.toast')).toContainText('Разобрана: Продлить страховку авто');
  await page.locator('.toast').getByRole('button', { name: 'Отменить' }).click();
  await expect(title(page)).toContainText('Продлить страховку авто');
  await expect(queue(page).first().locator('.sub')).not.toHaveText(/Разобрана/);
  // gone through to the end: «разобрано» in the summary
  await next(page).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /^Пропустить/ }).click();
  await expect(page.locator('.review .stats')).toContainText('1разобрано');
});

test('Enter in the board\'s card at the side: a new line at the end of the card stays shown', async ({ page }) => {
  await page.setViewportSize({ width: 2300, height: 900 });
  await installTauriMock(page, BOARD(true));
  await page.goto('/');
  await pluginsReady(page);
  await page.getByRole('treeitem', { name: /work/ }).click();
  await page.getByRole('treeitem', { name: /platform/ }).click();
  await page.locator('.kanban .kb-card', { hasText: 'Переезд в новый ДЦ' }).dblclick();
  const peek = page.locator('.kanban').getByRole('dialog', { name: 'Карточка' });
  await peek.locator('.cm-line').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Новая строка');
  await expect(peek.locator('.cm-line', { hasText: 'Новая строка' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__disk['/mock/work/platform.org'] as string)).toContain('\nНовая строка\n');
});
