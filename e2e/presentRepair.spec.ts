import { expect, test, type Page } from '@playwright/test';
import { diskFile, openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// «Починить» (the user's ask): a free slide's block whose text does not fit says «не помещается» on it (the editor
// only); its menu's «Починить» makes it fit with the least change — taller, its top kept, up only by what goes below;
// a block out of the slide moved in by what is out. A block that fits has no «Починить».

const P = '/mock/deck.org';
const LONG = Array.from({ length: 8 }, (_, i) => `Строка текста номер ${i + 1}, достаточно длинная.`).join(' ');
const DECK = ['#+PRESENT: 16:9', '* Свободный', ':PROPERTIES:', ':LAYOUT: free', ':END:',
  '** Длинный', ':PROPERTIES:', ':BOX: 10 40 30 12', ':END:', LONG,
  '** За краем', ':PROPERTIES:', ':BOX: 90 85 30 20', ':END:', 'коротко',
  '** Нормальный', ':PROPERTIES:', ':BOX: 50 30 30 20', ':END:', 'ок', ''].join('\n');
const boxOf = async (page: Page, title: string) => {
  const t = await diskFile(page, P);
  return /:BOX:\s*([\d ]+)/.exec(t.slice(t.indexOf(`** ${title}\n`)))?.[1].trim();
};
const block = (page: Page, title: string) => page.locator('.pr-holder .pr-box', { has: page.locator('.pr-box-t', { hasText: title }) });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { [P]: DECK }, ready: false, viewport: { width: 1500, height: 960 } });
  await pluginsReady(page);
  await page.evaluate(async (p) => {
    const { store } = await import('/src/store.svelte.ts' as string);
    store.open(store.files.findIndex((f: { path: string }) => f.path === p), 0);
  }, P);
  await expect(page.locator('.pr-holder .pr-l-free')).toBeVisible();
});

test('a block that does not fit: marked; «Починить» — taller, its place and width kept, no longer marked', async ({ page }) => {
  await expect(block(page, 'Длинный')).toHaveClass(/over/);
  await expect(block(page, 'Нормальный')).not.toHaveClass(/over/);
  await block(page, 'Длинный').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Починить/ }).click();
  await expect.poll(() => boxOf(page, 'Длинный')).not.toBe('10 40 30 12');
  const [x, y, w, h] = (await boxOf(page, 'Длинный'))!.split(' ').map(Number);
  expect([x, y, w]).toEqual([10, 40, 30]); // the least change: only taller
  expect(h).toBeGreaterThan(12);
  await expect(block(page, 'Длинный')).not.toHaveClass(/over/);
});

test('a block out of the slide: moved in by what is out, not centred; a block that fits has no «Починить»', async ({ page }) => {
  await block(page, 'За краем').click({ button: 'right', position: { x: 5, y: 5 } });
  await page.getByRole('menuitem', { name: /Починить/ }).click();
  await expect.poll(() => boxOf(page, 'За краем')).toBe('70 80 30 20');
  await block(page, 'Нормальный').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Править текст' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Починить/ })).toHaveCount(0);
});
