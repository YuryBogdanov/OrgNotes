import { expect, test, type Page } from '@playwright/test';
import { diskFile, openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// ТЗ 59.3: the free layout — blocks with no `:BOX:` laid out at once (one step); a click chooses a block (its frame and
// eight handles); a drag moves it and snaps to the other block (a dashed guide; with ⌥ none), let go: `:BOX:` in
// whole %; a handle resizes it (its size shown); the keys (arrows, ⇧, ⌫, ↩); its menu; «+ Блок».

const P = '/mock/deck.org';
const DECK = [
  '#+PRESENT: 16:9',
  '* Что будет делать',
  ':PROPERTIES:',
  ':LAYOUT: free',
  ':END:',
  '** Люди',
  ':PROPERTIES:',
  ':BOX: 10 40 30 20',
  ':STYLE: card',
  ':END:',
  '1-1, найм, рост.',
  '** Схема',
  ':PROPERTIES:',
  ':BOX: 60 40 30 20',
  ':END:',
  'План переезда.',
  '* Без мест',
  ':PROPERTIES:',
  ':LAYOUT: free',
  ':END:',
  '** Первый',
  'раз',
  '** Второй',
  'два',
  '',
].join('\n');
const disk = (page: Page) => diskFile(page, P);
const boxOf = async (page: Page, title: string) => {
  const t = await disk(page);
  const i = t.indexOf(`** ${title}\n`);
  return /:BOX:\s*([\d ]+)/.exec(t.slice(i))?.[1].trim();
};
const block = (page: Page, title: string) => page.locator('.pr-holder .pr-box', { has: page.locator('.pr-box-t', { hasText: title }) });

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { [P]: DECK }, ready: false, viewport: { width: 1500, height: 960 } });
  await pluginsReady(page);
  await page.evaluate(async (p) => {
    const { store } = await import('/src/store.svelte.ts' as string);
    store.open(store.files.findIndex((f: { path: string }) => f.path === p), 0);
  }, P);
  await expect(page.locator('.pr-holder .pr-slide')).toHaveClass(/pr-l-free/);
}

test('blocks with no BOX are laid out at once in two columns, one step', async ({ page }) => {
  await open(page);
  await page.getByRole('listbox', { name: 'Слайды' }).getByRole('option').nth(1).click();
  await expect.poll(() => boxOf(page, 'Первый')).toBe('7 30 41 58');
  expect(await boxOf(page, 'Второй')).toBe('52 30 41 58');
});

test('a click chooses a block; a drag moves it, snapping to the other block; let go — BOX in whole %', async ({ page }) => {
  await open(page);
  const a = block(page, 'Люди');
  await a.click();
  await expect(page.locator('.pr-selbox .pr-handle')).toHaveCount(8);
  const b = (await a.boundingBox())!;
  const other = (await block(page, 'Схема').boundingBox())!;
  // its top to 3 px below the other's top: it snaps to it
  await page.mouse.move(b.x + 20, b.y + 20);
  await page.mouse.down();
  await page.mouse.move(b.x + 60, b.y + 20 + (other.y - b.y) + 3 - 100, { steps: 4 });
  await page.mouse.move(b.x + 60, b.y + 20 + 3, { steps: 4 });
  await expect(page.locator('.pr-guide.h')).toHaveCount(1);
  await page.mouse.up();
  await expect.poll(() => boxOf(page, 'Люди')).toMatch(/^\d+ 40 30 20$/);
  expect(await boxOf(page, 'Люди')).not.toBe('10 40 30 20');
  // with ⌥: no snapping
  const c = (await a.boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.move(c.x + 20, c.y + 20);
  await page.mouse.down();
  await page.mouse.move(c.x + 20, c.y + 20 + 4, { steps: 3 });
  await expect(page.locator('.pr-guide')).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.up('Alt');
  // a click on the empty place: none chosen
  await page.locator('.pr-holder').click({ position: { x: 30, y: 400 } });
  await expect(page.locator('.pr-selbox')).toHaveCount(0);
});

test('a handle resizes it, its size shown; the keys move it 1 % (⇧ 5); ↩ edits its text; ⌫ asks and deletes', async ({ page }) => {
  await open(page);
  await block(page, 'Схема').click();
  const h = (await page.locator('.pr-handle.se').boundingBox())!;
  await page.mouse.move(h.x + 4, h.y + 4);
  await page.mouse.down();
  await page.mouse.move(h.x + 4 - 40, h.y + 4 - 30, { steps: 4 });
  await expect(page.locator('.pr-size')).toHaveText(/^\d+ × \d+ %$/);
  await page.keyboard.down('Alt'); // no snapping: the size as dragged
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect.poll(() => boxOf(page, 'Схема')).toMatch(/^60 40 2\d 1\d$/);
  const before = (await boxOf(page, 'Схема'))!.split(' ').map(Number);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => boxOf(page, 'Схема')).toBe([before[0] + 1, before[1], before[2], before[3]].join(' '));
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(() => boxOf(page, 'Схема')).toBe([before[0] + 1, before[1] - 5, before[2], before[3]].join(' '));
  await page.keyboard.press('Enter');
  const card = page.getByRole('dialog', { name: 'Текст блока' });
  await expect(card.locator('.cm-line').first()).toHaveText('** Схема');
  await page.keyboard.press('Escape');
  await block(page, 'Схема').click();
  await page.keyboard.press('Backspace');
  await page.getByRole('button', { name: 'Удалить' }).click();
  await expect.poll(async () => (await disk(page)).includes('** Схема')).toBe(false);
});

test('its menu: the card, to the front; «+ Блок» makes one and opens its text', async ({ page }) => {
  await open(page);
  await block(page, 'Люди').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Подложка' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Подложка' }).click();
  await expect.poll(async () => (await disk(page)).includes(':STYLE: card')).toBe(false);
  await block(page, 'Люди').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'На передний план' }).click();
  await expect.poll(async () => { const t = await disk(page); return t.indexOf('** Схема') < t.indexOf('** Люди'); }).toBe(true);
  await page.getByRole('button', { name: '+ Блок' }).click();
  await expect.poll(() => boxOf(page, 'Новый блок')).toBe('30 35 40 30');
  await expect(page.getByRole('dialog', { name: 'Текст блока' }).locator('.cm-line').first()).toHaveText('** Новый блок');
});
