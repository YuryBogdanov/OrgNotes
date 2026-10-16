import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 42 §7.1: the editor scrolls up to the window's edge, its bar there; «Структура» lies over the right part of it,
// the text clear of it; the bars are macOS's own (no ::-webkit-scrollbar style in the new shell); the column scrolls
// with no bar and fades at the edge it goes on past, the current heading kept in view.

const heads = (n: number) => Array.from({ length: n }, (_, i) => `* Заголовок ${i + 1}\nтекст ${i + 1}`).join('\n') + '\n';
const col = (page: Page) => page.getByRole('complementary', { name: 'Структура' });

async function open(page: Page, text: string) {
  await page.addInitScript(() => {
    localStorage.setItem('ui:next', '1');
    localStorage.setItem('editor:rich', '1');
  });
  await openApp(page, { files: { '/mock/a.org': text }, ready: false, viewport: { width: 1440, height: 820 } });
  await expect(page.locator('[data-ui="next"] .cm-content')).toBeVisible();
}

test('the editor\'s scroller reaches the window\'s edge; the column over it, the text clear of it', async ({ page }) => {
  await open(page, '* Один\n' + Array.from({ length: 120 }, (_, i) => `строка ${i}`).join('\n') + '\n* Два\n');
  const scroller = await page.locator('[data-ui="next"] .cm-scroller').boundingBox();
  const c = await col(page).boundingBox();
  const content = await page.locator('[data-ui="next"] .cm-content').boundingBox();
  expect(Math.round(scroller!.x + scroller!.width)).toBe(1440);
  expect(Math.round(c!.x + c!.width)).toBe(1440);
  expect(content!.x + content!.width).toBeLessThanOrEqual(c!.x);
  // no bars of our own: none takes room from the scroller (overlay bars take none)
  const thumb = await page.locator('[data-ui="next"] .cm-scroller').evaluate((e) => getComputedStyle(e, '::-webkit-scrollbar').width);
  expect(thumb).not.toBe('10px');
  // a wheel over the column's air scrolls the text
  await page.mouse.move(c!.x + 100, c!.y + c!.height - 40);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.locator('[data-ui="next"] .cm-scroller').evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
});

test('the column scrolls with no bar, fades where it goes on, keeps the current heading in view', async ({ page }) => {
  await open(page, heads(60));
  const list = col(page).locator('.list');
  await expect(list).toHaveClass(/fb/);
  await expect(list).not.toHaveClass(/ft/);
  expect(await list.evaluate((e: HTMLElement) => e.offsetWidth - e.clientWidth)).toBe(0);
  await col(page).getByRole('button', { name: 'Заголовок 60' }).click();
  await expect(list).toHaveClass(/ft/);
  await expect(list).not.toHaveClass(/fb/);
  await expect(col(page).locator('.row.on')).toBeInViewport();
});
