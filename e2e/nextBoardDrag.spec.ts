import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';
import { FILES } from './kanbanFixture';

// ТЗ 49.5: the board's scenarios of ТЗ 33 / 34 in the new interface — dragging to a column, to «В архив» and
// «Удалить» with their look; the card at the side (48 pt header, the footer); the choice of a workflow as the sheet of
// ТЗ 44, 500 pt; «Workflow не найден».

const P = '/mock/work/platform.org';
const A = '/mock/work/platform.org_archive';
const disk = (page: Page, p = P) => page.evaluate((x) => (window as any).__disk[x] as string | undefined, p);
const board = (page: Page) => page.locator('.kanban');
const card = (page: Page, title: string) => board(page).locator('.kb-card', { hasText: title });
async function open(page: Page, files: Record<string, string> = FILES(), view = true) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files, ready: false, viewport: { width: 1600, height: 900 } });
  await pluginsReady(page);
  await page.evaluate(async (p) => {
    const { store } = await import('/src/store.svelte.ts' as string);
    store.open(store.files.findIndex((f: { path: string }) => f.path === p), 0);
  }, P);
  if (view) await expect(board(page)).toBeVisible();
}
async function grab(page: Page, title: string) {
  const b = (await card(page, title).boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x + 30, b.y + 20, { steps: 3 });
  await expect(page.locator('.kb-drag')).toBeVisible();
}

test('dragging: the copy tilted −2° in a `lampline` frame, the old place dashed, the new one; to a column it moves', async ({ page }) => {
  await open(page);
  await grab(page, 'Миграция логов');
  expect(await page.locator('.kb-drag').evaluate((e) => getComputedStyle(e).transform)).toMatch(/^matrix\(0\.9993\d*, -0\.0348/);
  await expect(card(page, 'Миграция логов')).toHaveClass(/ghost/);
  await expect(card(page, 'Миграция логов')).toHaveCSS('border-top-style', 'dashed');
  const to = (await board(page).locator('[data-col="TODO"]').boundingBox())!;
  await page.mouse.move(to.x + to.width / 2, to.y + to.height - 20, { steps: 8 });
  const ph = board(page).locator('[data-col="TODO"] .kb-ph');
  await expect(ph).toBeVisible();
  await expect(ph).toHaveCSS('border-top-style', 'dashed');
  await expect(ph).toHaveCSS('border-radius', '9px');
  await page.mouse.up();
  await expect.poll(() => disk(page)).toContain('* TODO [#C] Миграция логов в ClickHouse');
});

test('the zones: 32 from the sides, 20 from the bottom, 60 high, 16 apart; solid under the pointer; archive and delete', async ({ page }) => {
  await open(page);
  await grab(page, 'Алерты v2');
  const kb = (await board(page).boundingBox())!;
  const arch = page.locator('[data-zone="archive"]');
  const del = page.locator('[data-zone="delete"]');
  const a = (await arch.boundingBox())!;
  const d = (await del.boundingBox())!;
  expect(Math.round(a.x - kb.x)).toBe(32);
  expect(Math.round(kb.x + kb.width - (d.x + d.width))).toBe(32);
  expect(Math.round(kb.y + kb.height - (a.y + a.height))).toBe(20);
  expect(Math.round(a.height)).toBe(60);
  expect(Math.round(d.x - (a.x + a.width))).toBe(16);
  await expect(arch).toHaveCSS('border-radius', '12px');
  await expect(arch.locator('.kb-zw')).toHaveText('platform.org_archive');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 8 });
  await expect(arch).toHaveClass(/on/);
  await expect(arch).toHaveCSS('border-top-style', 'solid');
  await page.mouse.up();
  await expect.poll(() => disk(page, A)).toContain('Алерты v2');
  await grab(page, 'Нагрузочное тестирование');
  const r = (await del.boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 8 });
  await expect(del).toContainText('Отпустите — карточка и её содержимое удалятся из файла');
  await page.mouse.up();
  await expect.poll(() => disk(page)).not.toContain('Нагрузочное тестирование');
});

test('the card at the side: 440 pt, the header 48 pt with the status ▾, «В файле ›», ×; the footer without «Редактируется»', async ({ page }) => {
  await open(page);
  await card(page, 'Переезд в новый ДЦ').dblclick();
  const peek = board(page).getByRole('dialog', { name: 'Карточка' });
  await expect(peek).toHaveCSS('width', '440px');
  await expect(peek.locator('.kb-ph2')).toHaveCSS('height', '48px');
  await expect(peek.getByRole('button', { name: 'DOING ▾' })).toBeVisible();
  await expect(peek.locator('.kb-pf')).toHaveText('⎋ закрыть · ⌘↩ открыть в файле');
  await peek.getByRole('button', { name: 'DOING ▾' }).click();
  await page.getByRole('menuitem', { name: 'REVIEW' }).click();
  await expect.poll(() => disk(page)).toContain('* REVIEW [#A] Переезд в новый ДЦ');
  await peek.getByRole('button', { name: 'Закрыть' }).click();
  await expect(peek).toHaveCount(0);
});

test('the choice of a workflow: the sheet 500 pt, «Показать «platform» как доску», the counts, the plate; «Отмена esc» back to the text', async ({ page }) => {
  await open(page, FILES(false), false);
  await page.keyboard.press('Alt+Meta+b');
  const sh = page.getByRole('dialog', { name: 'Показать как доску' });
  // fix #292: the sheet in the window's middle (the core's layer, not 50 % and a transform)
  await expect(sh).toBeVisible();
  const b = (await sh.boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(Math.abs(b.x + b.width / 2 - vw / 2)).toBeLessThanOrEqual(1);
  await expect(sh).toHaveCSS('width', '500px');
  expect(await sh.evaluate((e) => !!e.closest('[data-ui="next"]'))).toBe(true);
  await expect(sh.locator('.kb-st')).toHaveText('Показать «platform» как доску');
  await expect(sh.locator('.kb-sp')).toHaveText('Статусы workflow станут колонками, заголовки 1-го уровня — карточками.');
  await expect(sh.locator('.kb-set.on .kb-cnt')).toHaveText(/^\d+ из \d+$/);
  await expect(sh.locator('.kb-plate')).toContainText('— Emacs её не трогает. 2 заголовка без статуса на доску не попадут.');
  await expect(sh.getByRole('button', { name: /Показать доску/ })).toContainText('↩');
  await sh.getByRole('button', { name: /Отмена/ }).click();
  await expect(sh).toHaveCount(0);
  expect(await disk(page)).not.toContain('#+BOARD');
  await page.keyboard.press('Alt+Meta+b');
  await expect(sh).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(board(page).locator('.kb-card').first()).toBeVisible();
  expect(await disk(page)).toContain('#+BOARD: Разработка');
});

test('«Workflow не найден»: centred, 14 pt, the two buttons of ТЗ 44', async ({ page }) => {
  const files = FILES();
  files[P] = files[P].replace('#+BOARD: Разработка', '#+BOARD: Нет такого');
  await open(page, files);
  const st = board(page).getByRole('status');
  await expect(st).toContainText('Workflow «Нет такого» не найден в настройках статусов');
  await expect(st.locator('b')).toHaveCSS('font-size', '14px');
  await expect(st.getByRole('button', { name: 'Выбрать workflow' })).toHaveCSS('height', '30px');
  await expect(st.getByRole('button', { name: 'Открыть настройки статусов' })).toBeVisible();
});
