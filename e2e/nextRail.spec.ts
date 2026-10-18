import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 50.1: the rail of the sections at the window's left edge — 52 pt, buttons of 34 from 58 pt, the core's, a line,
// the plugins', the gear at the bottom; the badges («99+»); the last plugins in «⋯» when the window is low; the panel
// the whole height with its head (the name, the key) and the folder's line.

const F = { '/mock/a.org': '* TODO Задача\n', '/mock/b.org': '* Заметка\n' };
const rail = (page: Page) => page.locator('aside.side .rail');
const core = (page: Page) => page.getByRole('navigation', { name: 'Разделы', exact: true });
const plug = (page: Page) => page.getByRole('navigation', { name: 'Разделы плагинов' });
async function open(page: Page, files: Record<string, string> = F, height = 820) {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files, ready: false, viewport: { width: 1300, height } });
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
}
const box = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!;

test('the rail: 52 pt; buttons 34 × 34 from 58 pt, 4 apart; the line 24 × 1; the gear 12 pt over the bottom', async ({ page }) => {
  await open(page);
  expect(Math.round((await box(rail(page))).width)).toBe(52);
  const bs = core(page).getByRole('button');
  const first = await box(bs.first());
  expect([Math.round(first.y), Math.round(first.width), Math.round(first.height)]).toEqual([58, 34, 34]);
  expect(Math.round((await box(bs.nth(1))).y - first.y)).toBe(38);
  const sep = await box(rail(page).locator('.sep'));
  expect([Math.round(sep.width), Math.round(sep.height)]).toEqual([24, 1]);
  const gear = await box(rail(page).getByRole('button', { name: 'Настройки' }));
  expect(Math.round(820 - (gear.y + gear.height))).toBe(12);
  await expect(rail(page).getByRole('button', { name: 'Настройки' })).toHaveAttribute('title', 'Настройки (⌘,)');
  await expect(core(page).getByRole('button', { name: /Поиск/ })).toHaveAttribute('title', 'Поиск (⌃⌘6)');
});

test('the one picked: `lampsoft`, its icon `lampink`, the bar of `lamp`; the panel\'s head — the name and its key', async ({ page }) => {
  await open(page);
  const files = core(page).getByRole('button', { name: /Файлы/ });
  await expect(files).toHaveAttribute('aria-current', 'true');
  expect(await files.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(227, 170, 60, 0.17)');
  expect(await files.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(138, 95, 14)');
  expect(await files.evaluate((e) => getComputedStyle(e, '::before').backgroundColor)).toBe('rgb(227, 170, 60)');
  const head = page.locator('aside.side .grp.head');
  await expect(head.locator('.pt')).toHaveText('Файлы');
  await expect(head.locator('kbd')).toHaveText('⌃⌘1');
  await core(page).getByRole('button', { name: /Теги/ }).click();
  await expect(head.locator('.pt')).toHaveText('Теги');
  await expect(head.locator('kbd')).toHaveText('⌃⌘8');
  // the panel the whole height: under its head to the folder's line
  const panel = await box(page.getByRole('region', { name: 'Панель: Теги' }));
  expect(Math.round(panel.y)).toBeLessThan(110);
});

test('a badge: 15 pt at the button\'s corner; over 99 — «99+»', async ({ page }) => {
  const many: Record<string, string> = {};
  for (let i = 0; i < 120; i++) many[`/mock/n${i}.org`] = '* x\n';
  await open(page, many);
  const b = core(page).getByRole('button', { name: /Файлы/ }).locator('.bd');
  await expect(b).toHaveText('99+');
  await expect(b).toHaveAttribute('aria-label', 'Файлы: 120');
  expect(Math.round((await box(b)).height)).toBe(15);
});

test('a low window: the last plugins in «⋯» over the gear; its menu opens a section; «⋯» lit while it is picked', async ({ page }) => {
  await open(page, F, 420);
  const more = rail(page).getByRole('button', { name: /Ещё разделы/ });
  await expect(more).toBeVisible();
  const inRail = await plug(page).getByRole('button').count();
  await more.click();
  const items = page.getByRole('menuitem');
  expect(inRail + (await items.count())).toBe(3); // «Цели», «Долгие дела», «Календарь»
  const last = (await items.last().textContent())!.trim();
  await items.last().click();
  await expect(page.locator('aside.side .grp.head .pt')).toHaveText(last);
  await expect(more).toHaveClass(/on/);
  await page.setViewportSize({ width: 1300, height: 820 });
  await expect(more).toHaveCount(0);
  await expect(plug(page).getByRole('button')).toHaveCount(3);
});
