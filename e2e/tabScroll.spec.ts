import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// A file tab keeps its scroll: scrolled to the middle (the caret left at the top), another tab, back — the same
// lines in view; after a restart too.

const LONG = Array.from({ length: 200 }, (_, i) => (i % 20 === 0 ? `* Раздел ${i / 20 + 1}` : `строка ${i + 1}`)).join('\n');
const FILES = { '/mock/long.org': LONG, '/mock/short.org': '* Коротко\nтекст\n' };

const firstLine = (page: Page) =>
  page.evaluate(() => {
    const s = document.querySelector('section.pane.active .cm-scroller')!;
    const top = s.getBoundingClientRect().top;
    const line = [...s.querySelectorAll('.cm-line')].find((l) => l.getBoundingClientRect().bottom > top + 12);
    return line?.textContent ?? '';
  });
const row = (page: Page, name: string) => page.locator('.nav .row').filter({ has: page.locator('.label', { hasText: new RegExp(`^${name}$`) }) });

test('back on a tab its scroll is where it was, the caret where it was; after a restart too', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, FILES);
  await page.goto('/');
  await row(page, 'long').click();
  await expect(page.locator('.cm-content').first()).toContainText('Раздел 1');
  await page.locator('.cm-scroller').first().hover();
  await page.mouse.wheel(0, 2200);
  await expect.poll(() => firstLine(page)).toMatch(/строка (9\d|1\d\d)|Раздел [5-9]/);
  await page.waitForTimeout(200); // the scroll settled
  const was = await firstLine(page);
  expect(was).toMatch(/строка (9\d|1\d\d)|Раздел/);
  await page.keyboard.press('Meta+t'); // another tab in this pane
  await row(page, 'short').click();
  await expect(page.locator('.cm-content').first()).toContainText('Коротко');
  await page.locator('section.pane.active .tab', { hasText: 'long' }).click();
  await expect.poll(() => firstLine(page)).toBe(was);
  await page.waitForTimeout(300); // the layout saved
  await page.reload();
  await expect(page.locator('.cm-content').first()).toContainText('строка');
  await expect.poll(() => firstLine(page)).toBe(was);
});
