import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 55.2: `ui.drawer` — a panel under the tabs of the new interface: drawn once when first shown, kept while hidden;
// the editor above it shrinks; its height dragged (160 … 70 %) and kept on this Mac; disposed with its plugin; in the
// old interface `show()` does nothing.

async function drawer(page: Page) {
  return page.evaluate(async () => {
    const { plugins } = await import('/src/api/host.svelte.ts' as string);
    const ctx = (plugins as any).ctxOf({ ...plugins.manifest('hello'), permissions: [] });
    (window as any).__drawn = 0;
    const h = ctx.ui.drawer('term', {
      title: 'Терминал',
      render: (el: HTMLElement) => {
        (window as any).__drawn++;
        el.innerHTML = '<div class="probe" style="flex:1">панель плагина</div>';
        return () => ((window as any).__gone = true);
      },
    });
    (window as any).__drawer = h;
    return true;
  });
}
const call = (page: Page, fn: string) => page.evaluate((f) => (window as any).__drawer[f](), fn);

test('shown under the tabs, the editor shrinks; hidden it stays drawn; the height dragged and kept', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': '* TODO A\n' }, ready: false, viewport: { width: 1280, height: 860 } });
  await expect(page.locator('.cm-content')).toBeVisible();
  await drawer(page);
  const editorH = await page.locator('.cm-editor').evaluate((e) => e.getBoundingClientRect().height);
  await call(page, 'show');
  const region = page.getByRole('region', { name: 'Терминал' });
  await expect(region).toBeVisible();
  await expect(region.locator('.probe')).toHaveText('панель плагина');
  await expect.poll(() => region.evaluate((e) => Math.round(e.getBoundingClientRect().height))).toBe(330);
  await expect.poll(() => page.locator('.cm-editor').evaluate((e) => e.getBoundingClientRect().height)).toBeLessThan(editorH - 300);
  expect(await call(page, 'shown')).toBe(true);
  // hidden: drawn still, not again when shown
  await call(page, 'toggle');
  await expect(page.locator('.probe')).toBeHidden();
  await expect(page.locator('.probe')).toHaveCount(1);
  await call(page, 'show');
  await expect(region.locator('.probe')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__drawn)).toBe(1);
  // the top edge: 160 at least, kept on this Mac (measured once it is in place)
  await expect.poll(() => region.evaluate((e) => Math.round(e.getBoundingClientRect().height))).toBe(330);
  const box = (await region.boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 400, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => region.evaluate((e) => Math.round(e.getBoundingClientRect().height))).toBe(160);
  expect(await page.evaluate(() => localStorage.getItem('next:drawerH'))).toBe('160');
  // disposed: gone, its drawing taken back
  await call(page, 'dispose');
  await expect(page.locator('.probe')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__gone)).toBe(true);
});

test('the old interface: show() does nothing', async ({ page }) => {
  await openApp(page, { files: { '/mock/a.org': '* TODO A\n' } });
  await drawer(page);
  await call(page, 'show');
  expect(await call(page, 'shown')).toBe(false);
  await expect(page.locator('.probe')).toHaveCount(0);
});
