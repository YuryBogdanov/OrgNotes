import { expect, test, type Page } from '@playwright/test';
import { diskAll, openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// ТЗ 41.5: «Обход долгих дел» in the old interface — the review's tab (`ui.review`): the five decisions as buttons with
// their keys (the hidden «Дальше» on ⌘↩ only), «Новый статус» under the card, no «Проверить снова через» (the norm),
// the summary's figures in the walk's order.

const NOW = new Date(2026, 9, 16, 11, 0);
const MID = ['#+TODO: TODO NEXT WAIT | DONE', '* NEXT Миграция биллинга', 'Описание.', '* NEXT Квартальный план команды', ''].join('\n');
const MIDTERM = '/mock/Midterm.org';

async function open(page: Page) {
  const old = new Date(2026, 8, 1).getTime();
  await page.addInitScript((m) => ((window as any).__mtimeInit = m), { [MIDTERM]: old });
  await openApp(page, { files: { [MIDTERM]: MID }, now: NOW, ready: false, viewport: { width: 1440, height: 900 } });
  await pluginsReady(page);
}

test('⌃⌘O in the old interface: the review\'s tab «Обход долгих дел», the decisions, the field; ⌘1 — the norm\'s :NEXT_REVIEW:', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Meta+o');
  await expect(page.getByRole('tab', { name: /Обход долгих дел/ })).toBeVisible();
  const acts = page.locator('.acts .a');
  await expect(acts).toHaveText([/^Продолжаем/, /^Ждём…/, /^Осмотрено/, /^В архив/, /^Закрыть/]);
  await expect(acts.first()).toContainText('⌘1');
  const field = page.getByRole('textbox', { name: 'Новый статус' });
  await expect(field).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Проверить снова через' })).toHaveCount(0);
  await field.fill('идёт по плану');
  await page.keyboard.press('Meta+1');
  await expect.poll(async () => (await diskAll(page))[MIDTERM]).toContain(':NEXT_REVIEW: [2026-10-30');
  expect((await diskAll(page))[MIDTERM]).toContain('идёт по плану');
  await page.keyboard.press('Meta+Enter');
  await expect(page.getByText('Разбор закончен')).toBeVisible();
  await expect(page.locator('.sums > div')).toHaveText(['1продолжаем', '1пропущено']);
  await expect(page.getByText(/Пора проверить: \d+\./)).toBeVisible();
});
