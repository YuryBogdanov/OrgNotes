import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// fix #309: a file opened again (the palette, the files' panel) comes back as it was left — folded, its caret;
// fix #310: moving a subtree (⌥↓ ⌥↑) does not unfold its folded neighbours.

const A = '* Платформа\nтекст платформы\n* Наём\n** Кандидаты\nтекст найма\n* Бюджет\nтекст бюджета\n';
const line = (page: Page, t: string | RegExp) => page.locator('.cm-content .cm-line', { hasText: t });
const lines = (page: Page) => page.locator('.cm-content .cm-line').allInnerTexts();
async function open(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': A, '/mock/b.org': '* Другое\n' }, ready: false, viewport: { width: 1280, height: 800 } });
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.evaluate(async () => {
    const { store } = await import('/src/store.svelte.ts' as string);
    store.open(store.files.findIndex((f: { name: string }) => f.name === 'a.org'), 0);
  });
  await expect(line(page, 'текст платформы')).toBeVisible();
}

test('folded, left, opened again from the palette: still folded, the caret where it was', async ({ page }) => {
  await open(page);
  await line(page, /^\* Бюджет/).click();
  await page.keyboard.press('Shift+Tab'); // everything folded
  await expect(line(page, 'текст платформы')).toHaveCount(0);
  // the other file in the same tab, then back by the palette
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: /^b/ }).click();
  await expect(line(page, 'Другое')).toBeVisible();
  // what the palette's file row does (`gotoStep`): the file without a line
  await page.evaluate(async () => {
    const { store } = await import('/src/store.svelte.ts' as string);
    store.jump(store.files.findIndex((f: { name: string }) => f.name === 'a.org'));
  });
  await expect(line(page, /^\* Платформа/)).toBeVisible();
  await expect(line(page, 'текст платформы')).toHaveCount(0);
  await expect(line(page, 'текст бюджета')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.tab.cursor.line)).toBe(5);
});

test('⌥↓ and ⌥↑ on a folded heading (the caret after its «…»): the subtree moves whole, the neighbours stay folded', async ({ page }) => {
  await open(page);
  await line(page, /^\* Платформа/).click();
  await page.keyboard.press('Shift+Tab'); // everything folded
  await expect(line(page, 'текст найма')).toHaveCount(0);
  await line(page, /^\* Платформа/).click(); // at the line's end: the caret inside the folded subtree
  await page.keyboard.press('Alt+ArrowDown');
  const text = () => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.files.find((f: { name: string }) => f.name === 'a.org').text);
  await expect.poll(text).toBe('* Наём\n** Кандидаты\nтекст найма\n* Платформа\nтекст платформы\n* Бюджет\nтекст бюджета\n');
  expect(await lines(page)).toEqual(['* Наём…', '* Платформа…', '* Бюджет…']);
  await page.keyboard.press('Alt+ArrowUp');
  await expect.poll(text).toBe('* Платформа\nтекст платформы\n* Наём\n** Кандидаты\nтекст найма\n* Бюджет\nтекст бюджета\n');
  expect(await lines(page)).toEqual(['* Платформа…', '* Наём…', '* Бюджет…']);
});
