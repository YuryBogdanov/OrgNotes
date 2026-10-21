import { expect, test, type Page } from '@playwright/test';
import { log, openApp } from './helpers';

// ТЗ 59 §9, API 1.19: a plugin's images (`files.imageUrl` / `revoke`, `edit.writeBytes`), its show on the whole
// screen (`ui.present`: a window a screen, the presenter's only with two) and its PDF (`ui.exportPdf`).

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // 1 × 1
async function open(page: Page, screens?: unknown) {
  await page.addInitScript((s) => {
    localStorage.setItem('ui:next', '1');
    if (s) (window as any).__screens = s;
  }, screens);
  await openApp(page, { files: { '/mock/a.org': '* A\n', '/mock/img/a.png': 'base64:' + PNG }, plugins: { hello: ['files.edit'] } });
  await page.evaluate(async () => {
    const { plugins } = await import('/src/api/host.svelte.ts' as string);
    (window as any).ctx = (plugins as any).ctxOf({ ...plugins.manifest('hello'), permissions: ['files.edit'] });
  });
}

test('files.imageUrl: a blob: of the image, drawn; a bad path or no file — rejected; writeBytes — new files only', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const ctx = (window as any).ctx;
    const url: string = await ctx.files.imageUrl('img/a.png');
    const img = new Image();
    img.src = url;
    await img.decode();
    const bad = await Promise.all(['../x.png', '/mock/img/a.png', 'img/none.png'].map((p) => ctx.files.imageUrl(p).then(() => 'ok', () => 'rejected')));
    ctx.files.revoke(url);
    const wrote = await ctx.edit.writeBytes('Проекты/img/b.png', 'AQID');
    const again = await ctx.edit.writeBytes('Проекты/img/b.png', 'AQID').then(() => 'ok', () => 'rejected');
    return { blob: url.startsWith('blob:'), w: img.naturalWidth, bad, wrote, again };
  });
  expect(r).toEqual({ blob: true, w: 1, bad: ['rejected', 'rejected', 'rejected'], wrote: 'Проекты/img/b.png', again: 'rejected' });
  expect(await page.evaluate(() => (window as any).__disk['/mock/Проекты/img/b.png'])).toBe('base64:AQID');
});

test('ui.present with one screen: the slides on it, no presenter; the keys come; end() closes and brings back', async ({ page }) => {
  await open(page);
  const popup = page.waitForEvent('popup');
  await page.evaluate(async () => {
    const w = window as any;
    w.keys = [];
    w.ended = 0;
    w.show = await w.ctx.ui.present({
      audience: (el: HTMLElement) => void (el.innerHTML = '<h1 class="slide">Слайд 1</h1>'),
      presenter: () => void (w.presenterCalled = true),
      onKey: (e: KeyboardEvent) => w.keys.push(e.key),
      onEnd: () => w.ended++,
    });
  });
  const aud = await popup;
  await expect(aud.locator('.slide')).toHaveText('Слайд 1');
  expect(await aud.locator('[data-ui="next"]').evaluate((e) => getComputedStyle(e).getPropertyValue('--lamp').trim())).not.toBe(''); // the tokens there
  expect(await page.evaluate(() => [(window as any).show.screens, !!(window as any).presenterCalled])).toEqual([1, false]);
  await aud.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => (window as any).keys)).toEqual(['ArrowRight']);
  await page.evaluate(() => (window as any).show.end());
  await expect.poll(() => aud.isClosed()).toBe(true);
  expect(await page.evaluate(() => (window as any).ended)).toBe(1);
  expect((await log(page)).filter((e) => String(e[0]).startsWith('present_')).map((e) => e[0])).toEqual(['present_begin', 'present_end']);
});

test('ui.present with two screens: the slides on the other, the presenter here; swap() changes them over', async ({ page }) => {
  await open(page, [{ x: 0, y: 0, w: 1440, h: 900, main: true }, { x: 1440, y: 0, w: 1920, h: 1080, main: false }]);
  const pops: Page[] = [];
  page.on('popup', (p) => pops.push(p));
  await page.evaluate(async () => {
    const w = window as any;
    w.show = await w.ctx.ui.present({
      audience: (el: HTMLElement) => void (el.innerHTML = '<p class="who">зрители</p>'),
      presenter: (el: HTMLElement) => void (el.innerHTML = '<p class="who">докладчик</p>'),
    });
  });
  await expect.poll(() => pops.length).toBe(2);
  const who = () => Promise.all(pops.map((p) => p.locator('.who').textContent()));
  expect(await who()).toEqual(['зрители', 'докладчик']);
  expect(await page.evaluate(() => (window as any).show.screens)).toBe(2);
  await page.evaluate(() => (window as any).show.swap());
  expect(await who()).toEqual(['докладчик', 'зрители']);
  await page.evaluate(() => (window as any).show.end());
});

test('ui.exportPdf: the save panel, the pages laid out for print, the path; nothing left after', async ({ page }) => {
  await open(page);
  await page.evaluate(() => ((window as any).__savePicks = ['/out/Слайды.pdf']));
  const path = await page.evaluate(async () => {
    const pages = [1, 2, 3].map((n) => Object.assign(document.createElement('div'), { textContent: `Страница ${n}` }));
    return (window as any).ctx.ui.exportPdf({ name: 'Слайды', pages, size: { w: 960, h: 540 } });
  });
  expect(path).toBe('/out/Слайды.pdf');
  const l = await log(page);
  expect(l.find((e) => e[0] === 'save_panel')?.[1]).toMatchObject({ title: 'Экспорт в PDF', defaultPath: 'Слайды.pdf' });
  expect(l.find((e) => e[0] === 'pdf_print')).toEqual(['pdf_print', '/out/Слайды.pdf', 960, 540, 3]);
  expect(await page.locator('.pdf-pages').count()).toBe(0);
});
