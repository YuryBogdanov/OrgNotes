import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 50.2: the sidebar's panel hidden, the rail kept — a click on the section picked hides it, on any shows it with
// that section; ⌘0 and the toolbar's button the same; a section's key shows it; kept after a restart; the toolbar
// over the rail with the window's lights; the width in 180 ms.

const F = { '/mock/a.org': '* TODO Задача\n', '/mock/b.org': '* Заметка\n' };
const core = (page: Page) => page.getByRole('navigation', { name: 'Разделы', exact: true });
const rail = (page: Page) => page.locator('aside.side .rail');
const tree = (page: Page) => page.getByRole('tree', { name: 'Файлы' });
const sideW = async (page: Page) => Math.round((await page.locator('aside.side').boundingBox())!.width);
async function open(page: Page, motion: 'reduce' | 'no-preference' = 'reduce') {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: motion });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: F, ready: false, viewport: { width: 1300, height: 820 } });
  await expect(tree(page)).toBeVisible();
}

test('a click on the section picked hides the panel, nothing lit; a click on another shows it with that one', async ({ page }) => {
  await open(page);
  await core(page).getByRole('button', { name: /Файлы/ }).click();
  await expect(tree(page)).toBeHidden();
  await expect(rail(page)).toBeVisible();
  await expect.poll(() => sideW(page)).toBe(53);
  await expect(rail(page).locator('[aria-current="true"]')).toHaveCount(0);
  await core(page).getByRole('button', { name: /Теги/ }).click();
  await expect(page.locator('aside.side .grp.head .pt')).toHaveText('Теги');
  await expect(core(page).getByRole('button', { name: /Теги/ })).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => sideW(page)).toBe(313);
});

test('⌘0 and the toolbar\'s button hide and show the panel, the rail stays; kept after a reload', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+0');
  await expect(tree(page)).toBeHidden();
  await expect(rail(page)).toBeVisible();
  await page.reload();
  await expect(rail(page)).toBeVisible();
  await expect(tree(page)).toBeHidden();
  await page.getByRole('button', { name: 'Боковая панель' }).click();
  await expect(tree(page)).toBeVisible();
  await page.getByRole('button', { name: 'Боковая панель' }).click();
  await expect(tree(page)).toBeHidden();
});

test('a section\'s key shows the hidden panel on it; pressed again on the one picked it stays', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+0');
  await expect(tree(page)).toBeHidden();
  await page.keyboard.press('Control+Meta+8');
  await expect(page.locator('aside.side .grp.head .pt')).toHaveText('Теги');
  await expect(page.getByRole('region', { name: 'Панель: Теги' })).toBeVisible();
  await page.keyboard.press('Control+Meta+8');
  await expect(page.getByRole('region', { name: 'Панель: Теги' })).toBeVisible();
});

test('hidden: the toolbar over the rail — its ground and its line, the lights on it, its content right of them', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => { (await import('/src/store.svelte.ts' as string)).store.titlebar.lights = true; });
  await page.keyboard.press('Meta+0');
  const lights = rail(page).locator('.lights');
  expect(await lights.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(await page.locator('.next').evaluate((e) => getComputedStyle(e).backgroundColor));
  expect(await lights.evaluate((e) => getComputedStyle(e).boxShadow)).toContain('inset');
  const btn = (await page.getByRole('button', { name: 'Боковая панель' }).boundingBox())!;
  expect(Math.round(btn.x)).toBe(52 + 1 + 32);
  // the rail's line starts under the toolbar
  expect(await page.locator('aside.side').evaluate((e) => getComputedStyle(e, '::after').top)).toBe('52px');
});

test('the width goes in 180 ms (none with «Уменьшить движение»)', async ({ page }) => {
  await open(page, 'no-preference');
  expect(await page.locator('aside.side').evaluate((e) => getComputedStyle(e).transitionDuration)).toBe('0.18s');
  await page.keyboard.press('Meta+0');
  const ws: number[] = await page.evaluate(() => new Promise((res) => {
    const out: number[] = [];
    const el = document.querySelector('.next aside.side')!;
    const tick = () => { out.push(Math.round(el.getBoundingClientRect().width)); if (out.length < 20) requestAnimationFrame(tick); else res(out); };
    tick();
  }));
  expect(ws.at(-1)).toBe(53);
});
