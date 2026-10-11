import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// Full screen: macOS's own traffic lights are hidden (Rust); while the menu bar is shown the window moves down by it
// and the toolbar shows its own lights, the navigator button moving right to make room; otherwise it moves left.
const navBtn = (page: Page) => page.getByRole('button', { name: 'Показать или скрыть навигатор' });
const left = async (page: Page) => Math.round((await navBtn(page).boundingBox())!.x);
const top = async (page: Page) => Math.round((await navBtn(page).boundingBox())!.y);
const lights = (page: Page) => page.getByRole('group', { name: 'Кнопки окна' });
const titlebar = (page: Page, fullscreen: boolean, shown: boolean, menu = 0) =>
  page.evaluate(([fullscreen, lights, menu]) => (window as any).__emitEvent('titlebar', { fullscreen, lights, menu }), [fullscreen, shown, menu] as const);
const log = (page: Page) => page.evaluate(() => (window as any).__log as unknown[][]);

test('full screen: the navigator button moves left while the lights are hidden; with the menu bar our own lights come and the toolbar grows by it', async ({ page }) => {
  await installTauriMock(page, { '/mock/a.org': '* A\n' });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  const normal = await left(page);
  const y0 = await top(page);
  expect(normal).toBeGreaterThan(80); // after the room for macOS's lights
  await expect(lights(page)).toHaveCount(0); // in a window macOS draws them

  await titlebar(page, true, false); // full screen, the lights hidden
  await expect.poll(() => left(page)).toBe(14); // the toolbar's own padding only
  await expect(lights(page)).toHaveCount(0);

  await titlebar(page, true, true, 33); // the pointer at the top: the menu bar comes
  await expect.poll(() => left(page)).toBe(normal);
  await expect.poll(() => top(page)).toBe(y0 + 33); // below the menu bar
  // the toolbar grows by the menu bar, so nothing of the page shows in a gap above it
  expect(Math.round((await page.locator('.toolbar').boundingBox())!.y)).toBe(0);
  await expect.poll(async () => Math.round((await page.locator('.toolbar').boundingBox())!.height)).toBe(52 + 33);
  await expect(lights(page)).toBeVisible();
  // our lights sit on the line of the navigator button
  const l = (await lights(page).boundingBox())!;
  const b = (await navBtn(page).boundingBox())!;
  expect(Math.abs(l.y + l.height / 2 - (b.y + b.height / 2))).toBeLessThanOrEqual(1);
  await expect(lights(page).getByRole('button', { name: 'Свернуть окно' })).toBeDisabled(); // as in full screen
  await lights(page).getByRole('button', { name: 'Выйти из полноэкранного режима' }).click();
  await expect.poll(() => log(page)).toContainEqual(['fullscreen', false]);

  await titlebar(page, true, false);
  await expect.poll(() => left(page)).toBe(14);
  await expect.poll(() => top(page)).toBe(y0);
  await titlebar(page, false, true); // out of full screen
  await expect.poll(() => left(page)).toBe(normal);
  await expect(lights(page)).toHaveCount(0);
});

test('the red light in full screen leaves it and hides the window (it stays in the Dock)', async ({ page }) => {
  await installTauriMock(page, { '/mock/a.org': '* A\n' });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await titlebar(page, true, true, 33);
  await lights(page).getByRole('button', { name: 'Закрыть окно' }).click();
  await expect.poll(() => log(page)).toContainEqual(['hide']);
  expect(await log(page)).toContainEqual(['fullscreen', false]);
});
