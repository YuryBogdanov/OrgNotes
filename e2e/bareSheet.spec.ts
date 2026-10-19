import { expect, test } from '@playwright/test';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// A plugin's `bare` sheet that does not place itself (as the plan of «Неделя» 0.3.0): the core's layer centres it
// across the window, under the toolbar — not left in the top left corner. Both shells.

for (const next of [false, true])
  test(`a bare sheet without a place of its own: centred, under the toolbar (${next ? 'new' : 'old'} interface)`, async ({ page }) => {
    if (next) await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
    await openApp(page, { files: { '/mock/a.org': '* TODO Задача\n' }, ready: !next, viewport: { width: 1400, height: 800 } });
    await pluginsReady(page);
    await page.evaluate(async () => {
      const { plugins } = await import('/src/api/host.svelte.ts' as string);
      const ctx = (plugins as any).ctxOf(plugins.manifest('hello'));
      void ctx.ui.sheet({ title: 'Лист', bare: true, render: (el: HTMLElement) => void (el.innerHTML = '<div class="own-sheet" style="width:600px;height:200px;background:#888"></div>') });
    });
    const sh = page.locator('.own-sheet');
    await expect(sh).toBeVisible();
    const b = (await sh.boundingBox())!;
    expect(Math.abs(b.x + b.width / 2 - 700)).toBeLessThanOrEqual(1);
    expect(b.y).toBeGreaterThanOrEqual(40);
  });
