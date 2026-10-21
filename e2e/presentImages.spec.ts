import { expect, test, type Page } from '@playwright/test';
import { diskFile, log, openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// ТЗ 59.4: an image dropped from Finder on a slide or pasted — copied into `img/` beside the presentation (`-2` when
// the name is taken), its link where the layout wants it: a new block of 40 × 30 % where dropped in `free`, the first
// image replaced in `text-image`, at the end of the text with the layout made `text-image` in `text`. One step.

const P = '/mock/Проекты/deck.org';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const DECK = ['#+PRESENT: 16:9', '* Свободный', ':PROPERTIES:', ':LAYOUT: free', ':END:', '* Текст', '- пункт', '* С картинкой', '- пункт', '[[file:img/old.png]]', ''].join('\n');
const disk = (page: Page) => diskFile(page, P);
const thumbs = (page: Page) => page.getByRole('listbox', { name: 'Слайды' }).getByRole('option');

async function open(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { [P]: DECK, '/mock/Проекты/img/old.png': 'base64:' + PNG }, ready: false, viewport: { width: 1500, height: 960 } });
  await pluginsReady(page);
  await page.evaluate(async (p) => {
    const { store } = await import('/src/store.svelte.ts' as string);
    store.open(store.files.findIndex((f: { path: string }) => f.path === p), 0);
  }, P);
  await expect(page.locator('.pr-holder .pr-slide')).toBeVisible();
}
/** A file dropped on the slide at (fx, fy) of its box, as WebKit gives a drop from Finder. */
async function drop(page: Page, name: string, fx = 0.5, fy = 0.5) {
  const r = (await page.locator('.pr-holder').boundingBox())!;
  await page.evaluate(([n, b64, x, y]) => {
    const bin = atob(b64 as string);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], n as string, { type: 'image/png' }));
    const at = document.elementFromPoint(x as number, y as number)!;
    for (const type of ['dragover', 'drop']) at.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x as number, clientY: y as number }));
  }, [name, PNG, r.x + r.width * fx, r.y + r.height * fy] as const);
}

test('free: a new block where dropped, the file in img/ beside; the same name again — «-2»', async ({ page }) => {
  await open(page);
  await drop(page, 'roadmap.png', 0.5, 0.5);
  await expect.poll(() => disk(page)).toContain('** Картинка\n:PROPERTIES:\n:BOX: 30 35 40 30\n:END:\n[[file:img/roadmap.png]]\n');
  expect(await page.evaluate(() => (window as any).__disk['/mock/Проекты/img/roadmap.png'])).toBe('base64:' + PNG);
  await expect(page.locator('.pr-holder .pr-box.picture img')).toHaveAttribute('src', /^blob:/);
  await drop(page, 'roadmap.png', 0.2, 0.3);
  await expect.poll(() => disk(page)).toContain('[[file:img/roadmap-2.png]]');
  expect((await log(page)).filter((e) => e[0] === 'write_bytes').map((e) => e[1])).toEqual(['/mock/Проекты/img/roadmap.png', '/mock/Проекты/img/roadmap-2.png']);
});

test('text: the link at the end, the layout made «Текст и картинка»; text-image: the first image replaced', async ({ page }) => {
  await open(page);
  await thumbs(page).nth(1).click();
  await drop(page, 'team.png');
  await expect.poll(() => disk(page)).toContain('* Текст\n:PROPERTIES:\n:LAYOUT: text-image\n:END:\n- пункт\n[[file:img/team.png]]\n');
  await expect(page.locator('.pr-holder .pr-slide')).toHaveClass(/pr-l-text-image/);
  await thumbs(page).nth(2).click();
  await drop(page, 'new.png');
  await expect.poll(() => disk(page)).toContain('* С картинкой\n- пункт\n[[file:img/new.png]]\n');
  expect(await disk(page)).not.toContain('old.png');
});

test('⌘V of an image: pasted as «Вставка.png»', async ({ page }) => {
  await open(page);
  await thumbs(page).nth(1).click();
  await page.locator('.pr-stage').click({ position: { x: 5, y: 5 } });
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
    const e = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'clipboardData', { value: dt });
    document.body.dispatchEvent(e);
  }, PNG);
  await expect.poll(() => disk(page)).toContain('[[file:img/Вставка.png]]');
});
