import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 58: pinned tabs of the new interface — «Закрепить вкладку» in a tab's menu: the tab left, the pin, no «×» (nor
// on hover), it does not shrink; a file opened from the navigator while it is active opens after the group; «Закрыть
// остальные» (with «кроме закреплённых») leaves them; ⌘W closes one; after a restart they are back in their order.

const FILES = Object.fromEntries(['inbox', 'Midterm', 'journal', 'a1', 'a2', 'a3', 'a4', 'a5'].map((n) => [`/mock/${n}.org`, `* ${n}\n`]));
const tabs = (page: Page) => page.getByRole('tablist', { name: 'Вкладки' }).getByRole('tab');
const tab = (page: Page, name: string) => page.getByRole('tablist', { name: 'Вкладки' }).getByRole('tab', { name: new RegExp(`^${name}`) });
const tree = (page: Page) => page.getByRole('tree', { name: 'Файлы' });
const labels = async (page: Page) => (await tabs(page).evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') ?? '').replace(', закреплена', '*'))));
const menuItem = (page: Page, name: string | RegExp) => page.getByRole('menu').getByRole('menuitem', { name });

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: FILES, ready: false, viewport: { width: 1400, height: 860 } });
  await expect(tree(page).getByRole('treeitem', { name: 'journal', exact: true })).toBeVisible(); // the folder read
  await expect(tabs(page).first()).toBeVisible(); // the layout restored
}
/** A file in a new tab after the active one (the navigator would retarget the active plain tab). */
async function show(page: Page, name: string) {
  await page.evaluate(async (n) => {
    const { store } = await import('/src/store.svelte.ts' as string);
    const { openFile } = await import('/src/layout.ts' as string);
    openFile(store.layout, store.layout.active, `/mock/${n}.org`, 0);
  }, name);
  await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
}
async function pin(page: Page, name: string) {
  await tab(page, name).click({ button: 'right' });
  await menuItem(page, 'Закрепить вкладку').click();
}

test('pinned: left, with the pin, no «×» even on hover; a file from the navigator opens after the group', async ({ page }) => {
  await open(page);
  for (const n of ['a1', 'inbox', 'a2', 'Midterm']) {
    await show(page, n);
  }
  await pin(page, 'inbox');
  await pin(page, 'Midterm');
  const names = await labels(page);
  expect(names.slice(0, 2)).toEqual(['inbox*', 'Midterm*']);
  const m = tab(page, 'Midterm');
  await expect(m.locator('.pinic')).toBeVisible();
  await expect(m.getByRole('button', { name: /Закрыть вкладку/ })).toHaveCount(0);
  await tab(page, 'inbox').hover();
  await expect(tab(page, 'inbox').getByRole('button', { name: /Закрыть вкладку/ })).toHaveCount(0);
  // the pin as the file's icon: `lampink` on the active tab, `ink3` on the others
  await m.click();
  const color = (name: string, sel: string) => tab(page, name).locator(sel).first().evaluate((e) => getComputedStyle(e).color);
  expect(await color('Midterm', '.pinic')).toBe(await color('Midterm', '.ic:not(.pinic)'));
  expect(await color('inbox', '.pinic')).toBe(await color('inbox', '.ic:not(.pinic)'));
  expect(await color('Midterm', '.pinic')).not.toBe(await color('inbox', '.pinic'));
  // Midterm active and pinned: journal opens right after the group, Midterm stays
  await tree(page).getByRole('treeitem', { name: 'journal', exact: true }).click();
  await expect(tab(page, 'journal')).toHaveAttribute('aria-selected', 'true');
  expect((await labels(page)).slice(0, 3)).toEqual(['inbox*', 'Midterm*', 'journal']);
});

test('only the plain tabs shrink; the pinned keep their width', async ({ page }) => {
  await open(page);
  await show(page, 'inbox');
  await pin(page, 'inbox');
  const w0 = (await tab(page, 'inbox').boundingBox())!.width;
  for (const n of ['a1', 'a2', 'a3', 'a4', 'a5', 'journal', 'Midterm']) {
    await show(page, n);
  }
  await page.setViewportSize({ width: 900, height: 860 });
  await expect.poll(async () => (await tab(page, 'a1').boundingBox())!.width).toBeLessThan(120);
  expect((await tab(page, 'inbox').boundingBox())!.width).toBeCloseTo(w0, 0);
});

test('«Закрыть остальные» — «кроме закреплённых»: the tab and the pinned stay; ⌘W closes a pinned one; «Открепить»', async ({ page }) => {
  await open(page);
  for (const n of ['inbox', 'a1', 'a2']) {
    await show(page, n);
  }
  await pin(page, 'inbox');
  await tab(page, 'a1').click({ button: 'right' });
  const close = menuItem(page, /^Закрыть остальные/);
  await expect(close).toContainText('кроме закреплённых');
  await close.click();
  await expect.poll(() => labels(page)).toEqual(['inbox*', 'a1']);
  // on the pinned tab itself the words are not said (no other pinned one)
  await tab(page, 'inbox').click({ button: 'right' });
  await expect(menuItem(page, /^Закрыть остальные/)).not.toContainText('кроме закреплённых');
  await expect(menuItem(page, 'Открепить вкладку')).toBeVisible();
  await menuItem(page, 'Открепить вкладку').click();
  await expect.poll(() => labels(page)).toEqual(['inbox', 'a1']);
  await pin(page, 'a1');
  await tab(page, 'a1').click();
  await page.keyboard.press('Meta+w');
  await expect.poll(() => labels(page)).toEqual(['inbox']);
});

test('after a restart the pinned tabs are back in their order; the palette pins and unpins', async ({ page }) => {
  await open(page);
  for (const n of ['a1', 'inbox', 'Midterm']) {
    await show(page, n);
  }
  await pin(page, 'Midterm');
  await tab(page, 'inbox').click();
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('закрепить вкладку');
  await page.getByRole('option', { name: /^Закрепить вкладку/ }).click();
  await expect.poll(() => labels(page)).toEqual(['Midterm*', 'inbox*', 'a1']);
  await page.waitForTimeout(300); // the layout written
  await page.reload();
  await expect(tree(page)).toBeVisible();
  await expect.poll(() => labels(page)).toEqual(['Midterm*', 'inbox*', 'a1']);
  await tab(page, 'Midterm').click();
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('открепить');
  await page.getByRole('option', { name: /^Открепить вкладку/ }).click();
  await expect.poll(() => labels(page)).toEqual(['inbox*', 'Midterm', 'a1']);
});
