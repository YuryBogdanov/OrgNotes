import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';
import { FILES } from './kanbanFixture';

// ТЗ 49.4: the board in the new interface — the header (the kicker, the name in Yeseva One, «Workflow: …», the filter,
// «Не на доске», no «Текст»), the columns on the host's grid, the cards in the file's text's font with the chips.

const P = '/mock/work/platform.org';
async function open(page: Page, next = true) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  if (next) await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: FILES(), ready: false, viewport: { width: 1600, height: 900 } });
  await pluginsReady(page);
  await page.evaluate(async (p) => {
    const { store } = await import('/src/store.svelte.ts' as string);
    store.open(store.files.findIndex((f: { path: string }) => f.path === p), 0);
  }, P);
  await expect(page.locator('.kanban .kb-card').first()).toBeVisible();
}
const css = (page: Page, sel: string, prop: string) => page.locator(sel).first().evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop);

test('the header: the kicker in mono, the name in Yeseva One without «.org», the controls, no «Текст»', async ({ page }) => {
  await open(page);
  await expect(page.locator('.kb-kick')).toHaveText('work/platform.org · доска');
  await expect(page.locator('.kb-h1')).toHaveText('platform');
  expect(await css(page, '.kb-h1', 'font-family')).toContain('Yeseva');
  expect(await css(page, '.kb-kick', 'font-family')).toContain('Plex Mono');
  await expect(page.getByRole('button', { name: /Workflow:\s*Разработка/ })).toHaveCSS('height', '28px');
  await expect(page.locator('.kb-filter')).toHaveCSS('width', '200px');
  await expect(page.getByRole('button', { name: /Не на доске: 2/ })).toBeVisible();
  await expect(page.locator('.kanban').getByRole('button', { name: /^Текст/ })).toHaveCount(0);
});

test('the columns and the cards: 272 pt, radius 12; the title in the text\'s font 18/600; the chips; the chosen one', async ({ page }) => {
  await open(page);
  const col = page.locator('.kb-col:not(.folded)').first();
  await expect(col).toHaveCSS('width', '272px');
  await expect(col).toHaveCSS('border-radius', '12px');
  const t = page.locator('.kb-card .kb-t').first();
  expect(await t.evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Cormorant');
  await expect(t).toHaveCSS('font-size', '18px');
  await expect(t).toHaveCSS('font-weight', '600');
  const load = page.locator('.kb-card', { hasText: 'Нагрузочное' });
  await expect(load.locator('.kb-chip')).toHaveText(['#A', /^⚑ /, ':billing:']);
  await expect(load.locator('.kb-chip.late')).toHaveCount(1);
  await expect(page.locator('.kb-card', { hasText: 'Дашборд SLA для поддержки' }).first().locator('.kb-chip').first()).toHaveText('◷ 21 окт');
  const dc = page.locator('.kb-card', { hasText: 'Переезд в новый ДЦ' });
  await dc.click();
  await expect(dc).toHaveClass(/sel/);
  expect(await dc.evaluate((e) => getComputedStyle(e).boxShadow)).toMatch(/3px/);
  const done = page.locator('.kb-card.done').first();
  await expect(done).toHaveCSS('opacity', '0.55');
  await expect(done.locator('.kb-chip')).toHaveText([/^закрыта /]);
  expect(await css(page, '.kanban', 'background-color')).toBe('rgba(0, 0, 0, 0)'); // the host's grid under it
});

test('the old interface: the old header with «Текст», no chips', async ({ page }) => {
  await open(page, false);
  await expect(page.locator('.kb-name')).toHaveText('platform.org');
  await expect(page.locator('.kb-h1')).toHaveCount(0);
  await expect(page.locator('.kanban').getByRole('button', { name: /^Текст/ })).toBeVisible();
  await expect(page.locator('.kb-chip')).toHaveCount(0);
});
