import { expect, test, type Page } from '@playwright/test';
import { log, openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// ТЗ 59.6: «PDF» — the sheet «Экспорт в PDF»; a page a slide of the slide's size, or with the notes A4 upright (the
// slide on top, its notes under it); named by «#+TITLE:»; the images loaded before the print.

const P = '/mock/deck.org';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const DECK = ['#+TITLE: Ищем тимлида', '#+PRESENT: 16:9', '* Первый', 'Привет', '* Второй', '- пункт', '[[img/a.png]]', '** Заметки', 'Сказать честно.', '* Третий', 'Всё', ''].join('\n');

async function open(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ui:next', '1');
    (window as any).__savePicks = ['/out/Ищем тимлида.pdf'];
  });
  await openApp(page, { files: { [P]: DECK, '/mock/img/a.png': 'base64:' + PNG }, ready: false, viewport: { width: 1440, height: 900 } });
  await pluginsReady(page);
  await page.evaluate(async (p) => {
    const { store } = await import('/src/store.svelte.ts' as string);
    store.open(store.files.findIndex((f: { path: string }) => f.path === p), 0);
  }, P);
  await expect(page.locator('.pr-holder .pr-slide')).toBeVisible();
  // the pages as the print sees them, kept for the test
  await page.evaluate(() => {
    const w = window as any;
    const orig = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = async (cmd: string, args: any, o: any) => {
      if (cmd === 'pdf_print') w.__pages = [...document.querySelectorAll('.pdf-pages > .pdf-page')].map((p) => ({ text: (p as HTMLElement).innerText.replace(/\s+/g, ' ').trim(), imgs: [...p.querySelectorAll('img')].map((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0) }));
      return orig(cmd, args, o);
    };
  });
}

test('without the notes: a page a slide of its size, named by #+TITLE, its images loaded', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Экспорт в PDF' });
  await expect(sheet.getByRole('checkbox', { name: 'С заметками докладчика' })).not.toBeChecked();
  await sheet.getByRole('button', { name: 'Экспортировать…' }).click();
  await expect.poll(async () => (await log(page)).find((e) => e[0] === 'pdf_print')).toEqual(['pdf_print', '/out/Ищем тимлида.pdf', 720, 405, 3]);
  expect((await log(page)).find((e) => e[0] === 'save_panel')?.[1]).toMatchObject({ title: 'Экспорт в PDF', defaultPath: 'Ищем тимлида.pdf' });
  const pages = await page.evaluate(() => (window as any).__pages);
  expect(pages.map((p: any) => p.text)).toEqual([expect.stringContaining('Первый'), expect.stringContaining('Второй'), expect.stringContaining('Третий')]);
  expect(pages[1].imgs).toEqual([true]);
  expect(pages[1].text).not.toContain('Сказать честно');
  await expect(page.locator('.pdf-pages')).toHaveCount(0);
});

test('with the notes: A4 upright, the notes under the slide', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Экспорт в PDF' });
  await sheet.getByRole('checkbox', { name: 'С заметками докладчика' }).check();
  await expect(sheet).toContainText('страница A4');
  await sheet.getByRole('button', { name: 'Экспортировать…' }).click();
  await expect.poll(async () => (await log(page)).find((e) => e[0] === 'pdf_print')).toEqual(['pdf_print', '/out/Ищем тимлида.pdf', 595, 842, 3]);
  const pages = await page.evaluate(() => (window as any).__pages);
  expect(pages[1].text).toContain('Сказать честно.');
});
