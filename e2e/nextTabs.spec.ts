import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 42.4: the tabs of the new interface — a tab per open file (its name without `.org`, ТЗ 44 §11), the active one; «×»
// closes, an unsaved one has a dot and is asked about; «+» an untitled tab; «Оформление / Исходник» is the old
// «Текст / Оформление» (one for all tabs); two panes of the old interface fold into one and come back.

const FILES = { '/mock/Midterm.org': '* A\n', '/mock/1on1/boris.org': '* B\n', '/mock/weeks.org': '* C\n' };
const strip = (page: Page) => page.getByRole('tablist', { name: 'Вкладки' });
const store = (page: Page, fn: string) => page.evaluate(async (fn) => new Function('store', 'layout', `return (async () => { ${fn} })()`)((await import('/src/store.svelte.ts' as string)).store, await import('/src/layout.ts' as string)), fn);

async function open(page: Page, flagOnce = false) {
  await page.addInitScript((once) => {
    if (once && sessionStorage.getItem('set')) return;
    sessionStorage.setItem('set', '1');
    localStorage.setItem('ui:next', '1');
  }, flagOnce);
  await openApp(page, { files: FILES, ready: false });
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
  // the layout restored and the first file open before a test opens more (else the restore takes them back)
  await expect.poll(() => store(page, 'return store.loaded && store.layout.panes[0]?.tabs.length > 0')).toBe(true);
}

test('a tab per file, its name without `.org`; a click activates; «×» closes; «+» an untitled one', async ({ page }) => {
  await open(page);
  await store(page, "for (const p of ['/mock/1on1/boris.org', '/mock/weeks.org']) layout.openFile(store.layout, 0, p, 0, { replace: false });");
  await expect(strip(page).getByRole('tab')).toHaveText(['Midterm', 'boris', 'weeks']);
  await expect(strip(page).getByRole('tab', { selected: true })).toHaveText('weeks');
  await strip(page).getByRole('tab', { name: 'boris' }).click();
  await expect(strip(page).getByRole('tab', { selected: true })).toHaveText('boris');
  await expect(page.locator('.bar .name')).toHaveText('boris');
  await strip(page).getByRole('button', { name: 'Закрыть вкладку weeks' }).click({ force: true });
  await expect(strip(page).getByRole('tab')).toHaveCount(2);
  await strip(page).getByRole('button', { name: 'Новая вкладка' }).click();
  await expect(strip(page).getByRole('tab', { selected: true })).toHaveText('Без названия');
  // the menu of a tab
  await strip(page).getByRole('tab', { name: 'Midterm' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Закрыть остальные' }).click();
  await expect(strip(page).getByRole('tab')).toHaveText(['Midterm']);
});

test('unsaved: a dot; ⌘W closes the active tab, an untitled one with text is asked about', async ({ page }) => {
  await open(page);
  await store(page, "store.setText('* A\\nправка\\n', '/mock/Midterm.org');");
  await expect(strip(page).getByRole('tab', { name: 'Midterm' })).toHaveClass(/dirty/);
  await strip(page).getByRole('button', { name: 'Новая вкладка' }).click();
  await store(page, "store.tab.text = 'черновик';");
  await expect(strip(page).getByRole('tab', { name: 'Без названия' })).toHaveClass(/dirty/);
  await page.keyboard.press('Meta+w');
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(strip(page).getByRole('tab')).toHaveCount(2);
});

test('«Оформление / Исходник» is the shared flag of the rich text', async ({ page }) => {
  await open(page);
  const mode = page.getByRole('radiogroup', { name: 'Вид текста' });
  await mode.getByRole('radio', { name: 'Оформление' }).click();
  expect(await store(page, 'return store.rich;')).toBe(true);
  await expect(mode.getByRole('radio', { name: 'Оформление' })).toHaveAttribute('aria-checked', 'true');
  await mode.getByRole('radio', { name: 'Исходник' }).click();
  expect(await store(page, 'return store.rich;')).toBe(false);
});

test('two panes of the old interface: one in the new, both again in the old; «второй редактор» — «Скоро»', async ({ page }) => {
  // the old interface with two panes, then the new one
  await openApp(page, { files: FILES });
  await store(page, "store.splitRight(); layout.openFile(store.layout, 1, '/mock/weeks.org', 0, { replace: true }); store.persistLayout();");
  expect(await store(page, 'return store.layout.panes.length;')).toBe(2);
  await store(page, 'await store.setInterface(true);');
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
  expect(await store(page, 'return store.layout.panes.length;')).toBe(1);
  await expect(strip(page).getByRole('tab', { name: 'weeks' })).toBeVisible();
  await store(page, 'store.splitRight();');
  await expect(page.getByRole('status')).toContainText('Скоро в новом интерфейсе');
  expect(await store(page, 'return store.layout.panes.length;')).toBe(1);
  // back: two panes, weeks.org on the right
  await store(page, 'await store.setInterface(false);');
  await expect(page.locator('.next[data-ui="next"]')).toHaveCount(0);
  await expect.poll(() => store(page, 'return store.loaded && store.layout.panes.map((p) => p.tabs.map((t) => t.path?.split("/").pop()));')).toEqual([['Midterm.org'], ['weeks.org']]);
});
