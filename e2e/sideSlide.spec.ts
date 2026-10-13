import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// The navigator and the inspector come and go as in Xcode: the panel's width goes to nothing (its content keeps its
// width, so it slides out to its side), then it is gone; it comes back the same way.

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, { '/mock/Work.org': '* Q4\n** TODO Подготовить бюджет\n' });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
}
/** The slot's width and its panel's, a moment after the toggle. */
const sizes = (page: Page, slot: string) =>
  page.evaluate((s) => {
    const el = document.querySelector(s) as HTMLElement | null;
    if (!el) return null;
    const a = el.getBoundingClientRect();
    const b = (el.querySelector('.side') as HTMLElement).getBoundingClientRect();
    return { slot: a.width, side: b.width, left: Math.round(b.left - a.left), right: Math.round(a.right - b.right) };
  }, slot);

for (const [name, slot, button] of [
  ['the navigator slides out to the left', '.nav-slot', 'Показать или скрыть навигатор'],
  ['the inspector slides out to the right', '.insp-slot', 'Показать или скрыть инспектор'],
] as const)
  test(name + ' and comes back', async ({ page }) => {
    await open(page);
    const full = (await sizes(page, slot))!;
    expect(full.slot).toBeGreaterThan(full.side); // the panel and its splitter
    await page.getByRole('button', { name: button }).click();
    await page.waitForTimeout(90);
    const mid = await sizes(page, slot);
    expect(mid).not.toBeNull(); // still going
    expect(mid!.slot).toBeLessThan(full.slot);
    expect(mid!.side).toBe(full.side); // its content keeps its width: it slides, it is not squeezed
    // the navigator's content is held by its right edge (it goes left), the inspector's by its left one (it goes right)
    if (slot === '.nav-slot') expect(mid!.left).toBeLessThan(0);
    else expect(mid!.right).toBeLessThan(0);
    await expect(page.locator(slot)).toHaveCount(0);
    await page.getByRole('button', { name: button }).click();
    await expect(page.locator(slot)).toHaveCount(1);
    await expect.poll(async () => (await sizes(page, slot))!.slot).toBe(full.slot);
  });
