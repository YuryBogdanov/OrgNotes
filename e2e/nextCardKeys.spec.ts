import { expect, test, type Page } from '@playwright/test';
import { diskFile as disk, openApp, settingsSheet } from './helpers';

// ТЗ 44.6 (§9): the keys of a card's actions — a command with `cardKey` and no keys of its own gets «⌃C K <letter>»;
// it works from the text, for the heading under the caret; on another heading it does nothing and types nothing.
// «Долгие дела»: «Проверить через…» ⌃C K R, «Ждём…» ⌃C K W, «Осмотрено» ⌃C K O.

const MID = ['#+TODO: TODO NEXT WAIT | DONE', '* NEXT Миграция биллинга', '* Квартальный план команды', ':PROPERTIES:', ':WAITING_ON: бизнес', ':END:', ''].join('\n');
const WORK = ['* Просто заголовок', 'текст', ''].join('\n');
const store = (page: Page, code: string) => page.evaluate(async (c) => new Function('store', `return (async () => { ${c} })()`)((await import('/src/store.svelte.ts' as string)).store), code);

async function open(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/Midterm.org': MID, '/mock/Work.org': WORK }, plugins: { 'long-matters': ['index.read', 'files.edit'] }, ready: false, viewport: { width: 1440, height: 860 } });
  await expect.poll(() => store(page, 'return store.loaded')).toBe(true);
  await expect.poll(() => page.evaluate(async () => !!(await import('/src/views.ts' as string)).actionOf('long-matters.wait'))).toBe(true); // the plugin is up
}
const chord = async (page: Page, letter: string) => {
  await page.keyboard.press('Control+c');
  await page.keyboard.press('k');
  await page.keyboard.press(letter);
};

test('«⌃C K W» from the text on a long matter opens «Ждём…»; the letters are its, the chord in «Клавиши»', async ({ page }) => {
  await open(page);
  expect(await store(page, "return ['long-matters.review', 'long-matters.wait', 'long-matters.seen', 'long-matters.unwait'].map((id) => store.keyHint(id))")).toEqual(['⌃C K R', '⌃C K W', '⌃C K O', '']);
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'Midterm' }).click();
  await page.locator('.cm-line', { hasText: 'Миграция биллинга' }).click();
  await chord(page, 'w');
  const f = page.getByRole('dialog', { name: 'Ждём: Миграция биллинга' });
  await expect(f).toBeVisible();
  await page.keyboard.press('Escape'); // the suggestions' popover first
  await page.keyboard.press('Escape');
  await expect(f).toHaveCount(0);
  expect(await disk(page, '/mock/Midterm.org')).toBe(MID); // nothing typed
  // «Клавиши»: the chord, set as any
  await page.keyboard.press('Meta+,');
  await settingsSheet(page).getByRole('tab', { name: 'Клавиши', exact: true }).click();
  await expect(settingsSheet(page).locator('.row', { hasText: 'Ждём…' })).toContainText('⌃C K W');
});

test('on a heading that is not a long matter the chord does nothing, and types nothing', async ({ page }) => {
  await open(page);
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'Work' }).click();
  await page.locator('.cm-line', { hasText: 'Просто заголовок' }).click();
  await chord(page, 'w');
  await chord(page, 'o');
  await page.waitForTimeout(300);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.type(' rswo'); // the letters alone are typed
  await expect.poll(() => store(page, "return store.files.find((f) => f.name === 'Work.org').text")).toBe('* Просто заголовок rswo\nтекст\n');
});
