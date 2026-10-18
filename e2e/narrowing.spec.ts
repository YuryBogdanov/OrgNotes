import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 42.10 (§5.8): «Сузить до заголовка» ⌃X N S / «Показать весь файл» ⌃X N W — in both interfaces: the editor shows
// the subtree of the heading under the caret, the strip says so; kept with the tab after a reload; the heading gone,
// the narrowing goes; the new interface's «Структура» shows only the subtree.

const DOC = ['* Роадмап', 'текст роадмапа', '* Переезд хранилища', '** Бенчмарк', 'детали', '* Готово', ''].join('\n');
const visible = (page: Page) => page.locator('.cm-line').allInnerTexts();
async function narrowAt(page: Page, text: string) {
  await page.locator('.cm-line', { hasText: text }).click();
  await page.keyboard.press('Control+x');
  await page.keyboard.press('n');
  await page.keyboard.press('s');
}

test('the old interface: ⌃X N S and ⌃X N W; kept after a reload; the heading gone — the whole file', async ({ page }) => {
  await openApp(page, { files: { '/mock/a.org': DOC } });
  await narrowAt(page, 'Бенчмарк');
  await expect(page.locator('.narrowbar')).toContainText('Сужено');
  await expect(page.locator('.narrowbar')).toContainText('Переезд хранилища › Бенчмарк');
  await expect.poll(async () => (await visible(page)).join('|')).not.toContain('Роадмап');
  await page.reload();
  await expect(page.locator('.narrowbar')).toContainText('Бенчмарк');
  await page.locator('.cm-line', { hasText: 'детали' }).click();
  await page.keyboard.press('Control+x');
  await page.keyboard.press('n');
  await page.keyboard.press('w');
  await expect(page.locator('.narrowbar')).toHaveCount(0);
  await expect.poll(async () => (await visible(page)).join('|')).toContain('Роадмап');
  // the heading removed on disk: the narrowing goes
  await narrowAt(page, 'Бенчмарк');
  await expect(page.locator('.narrowbar')).toBeVisible();
  await page.evaluate((t) => (window as any).__setDisk('/mock/a.org', t), DOC.replace('** Бенчмарк\n', ''));
  await expect(page.locator('.narrowbar')).toHaveCount(0);
});

test('the new interface: the strip of §5.8, «Структура» of the subtree; the editor\'s menu and the palette', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': DOC }, ready: false, viewport: { width: 1440, height: 820 } });
  await expect(page.locator('[data-ui="next"] .cm-content')).toBeVisible();
  await page.locator('.cm-line', { hasText: 'Переезд хранилища' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Сузить до заголовка/ }).click();
  const strip = page.getByRole('status', { name: 'Сужено' });
  await expect(strip).toContainText('a › Переезд хранилища');
  await expect(strip).toContainText('⌃X N W');
  await expect(page.getByRole('complementary', { name: 'Структура' }).locator('.row .t')).toHaveText(['Переезд хранилища', 'Бенчмарк']);
  await strip.getByRole('button', { name: 'Показать весь файл' }).click();
  await expect(strip).toHaveCount(0);
  await page.locator('.cm-line', { hasText: 'Роадмап' }).first().click();
  await page.keyboard.press('Meta+k');
  await page.keyboard.type('сузить');
  await page.getByRole('option', { name: /^Сузить до заголовка/ }).click();
  await expect(page.getByRole('status', { name: 'Сужено' })).toContainText('a › Роадмап');
});

// ТЗ 46.1 (§2): the strip of any narrowing in the new interface goes the whole width, the column under it; it comes
// out from the top in 180 ms and goes in 150, the column with it; no moves with «Уменьшить движение»
for (const motion of ['no-preference', 'reduce'] as const)
  test(`the new interface: the strip the whole width, the column under it; its moves (${motion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
    await openApp(page, { files: { '/mock/a.org': DOC }, ready: false, viewport: { width: 1440, height: 820 } });
    await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'a' }).click();
    // its coming: the animation the strip gets as it comes in (a CI runner's frames are too few to sample its height)
    await page.evaluate(() => {
      (window as any).__anim = null;
      const mo = new MutationObserver(() => {
        const el = document.querySelector<HTMLElement>('[data-ui="next"] .narrow');
        if (!el) return;
        mo.disconnect();
        // Svelte starts it on the next frame
        requestAnimationFrame(() => ((window as any).__anim = el.getAnimations().map((a) => Number((a.effect as KeyframeEffect | null)?.getTiming().duration ?? 0))));
      });
      mo.observe(document.body, { childList: true, subtree: true });
    });
    await narrowAt(page, 'Бенчмарк');
    const strip = page.getByRole('status', { name: 'Сужено' });
    await expect(strip).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__anim)).not.toBeNull();
    const ds: number[] = await page.evaluate(() => (window as any).__anim);
    if (motion === 'reduce') expect(ds.every((d) => d === 0)).toBe(true); // at once
    else expect(ds).toContain(180); // it comes out in 180 ms
    const b = (await strip.boundingBox())!;
    expect(Math.round(b.x + b.width)).toBe(1440); // to the window's right edge, over the column too
    const col = (await page.getByRole('complementary', { name: 'Структура' }).boundingBox())!;
    expect(col.y).toBeGreaterThanOrEqual(b.y + b.height - 1);
    await page.getByRole('button', { name: 'Показать весь файл' }).click();
    await expect(strip).toHaveCount(0);
  });
