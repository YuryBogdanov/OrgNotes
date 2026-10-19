import { expect, test, type Page } from '@playwright/test';
import { diskFile as disk, openApp } from './helpers';

// ТЗ 48.1: a task in the lists in the new interface — the menu of ТЗ 44 (260 pt): «Открыть», «Открыть сбоку» (ТЗ 56),
// «Статус ›» (capsules), «Приоритет ›», «Запланировать ›» / «Дедлайн ›» (the days with their dates grey,
// «Снять дату» in `todo`), «Теги…», «Перенести…», «Копировать ссылку»; «Теги…» the popover of ТЗ 44; after a change
// the one toast at the bottom — «Запланировано на завтра · …» with «Отменить ⌘Z», which brings the date back.

const NOW = new Date(2026, 9, 16, 12, 10); // Fri 16 Oct
const WORK = '* NEXT План переезда хранилища\nSCHEDULED: <2026-10-16 Пт>\n* TODO Синк платформы\nSCHEDULED: <2026-10-16 Пт>\n';
const store = (page: Page, code: string) => page.evaluate(async (c) => new Function('store', `return (async () => { ${c} })()`)((await import('/src/store.svelte.ts' as string)).store), code);
const screen = (page: Page) => page.getByRole('region', { name: 'Агенда', exact: true });
const row = (page: Page, t: string) => screen(page).locator('.row', { hasText: t });
const menu = (page: Page) => page.getByRole('menu', { name: 'Задача' });

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/work.org': WORK }, local: { 'plugins:enabled': JSON.stringify({ calendar: false }) }, now: NOW, ready: false, viewport: { width: 1440, height: 900 } });
  await expect.poll(() => store(page, 'return store.loaded')).toBe(true);
  await store(page, 'store.showAgendaHere()');
  await expect(screen(page)).toBeVisible();
}

test('the menu of ТЗ 44: its items, «Открыть сбоку»; «Запланировать ›» — the days with their dates; the toast; «Отменить» brings it back', async ({ page }) => {
  await open(page);
  await row(page, 'План переезда').click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  expect(Math.round((await menu(page).boundingBox())!.width)).toBeGreaterThanOrEqual(260); // its width, the frame on top
  const labels = (await menu(page).locator('[role=menuitem] .l1').allTextContents()).map((s) => s.trim());
  expect(labels).toEqual(['Открыть', 'Открыть сбоку', 'Статус', 'Приоритет', 'Запланировать', 'Дедлайн', 'Теги…', 'Перенести в другой файл…', 'Копировать ссылку']);
  await expect(menu(page).getByRole('menuitem', { name: /Открыть сбоку/ })).toBeEnabled();
  await menu(page).getByRole('menuitem', { name: /Запланировать/ }).hover();
  const sub = page.getByRole('menu').nth(1);
  await expect(sub.getByRole('menuitem', { name: /Сегодня/ })).toContainText('пт 16');
  await expect(sub.getByRole('menuitem', { name: /Завтра/ })).toContainText('сб 17');
  await expect(sub.getByRole('menuitem', { name: /Снять дату/ })).toHaveClass(/danger/);
  await sub.getByRole('menuitem', { name: /Завтра/ }).click();
  await expect.poll(() => disk(page, '/mock/work.org')).toContain('SCHEDULED: <2026-10-17');
  const toast = page.getByRole('status').filter({ hasText: 'Запланировано на' });
  await expect(toast).toContainText('Запланировано на завтра · План переезда хранилища');
  await expect(toast.locator('b')).toHaveText('завтра');
  await toast.getByRole('button', { name: /Отменить/ }).click();
  await expect.poll(() => disk(page, '/mock/work.org')).toBe(WORK);
});

test('«Статус ›» — capsules with the current ticked; «Теги…» — the tags\' popover by the row, applied when it closes', async ({ page }) => {
  await open(page);
  await row(page, 'Синк платформы').click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: /Статус/ }).hover();
  const sub = page.getByRole('menu').nth(1);
  await expect(sub.locator('.capsule').first()).toHaveText('TODO');
  await sub.getByRole('menuitem', { name: /DONE/ }).click();
  await expect.poll(() => disk(page, '/mock/work.org')).toContain('* DONE Синк платформы');
  await expect(page.getByRole('status').filter({ hasText: 'Статус' })).toContainText('Статус DONE · Синк платформы');
  await row(page, 'План переезда').click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: /Теги…/ }).click();
  const pop = page.getByRole('dialog', { name: 'Теги заголовка' });
  await expect(pop).toBeVisible();
  await page.keyboard.type('infra');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect.poll(() => disk(page, '/mock/work.org')).toContain('* NEXT План переезда хранилища :infra:');
});
