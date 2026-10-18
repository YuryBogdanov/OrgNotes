import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 48.4: the agenda builder in the new interface is a tab «<Агенда> — правка», not a sheet: «КОНСТРУКТОР АГЕНДЫ»,
// the name in Yeseva One edited in place, «Источники: все файлы · архивы не входят», the blocks as rows on `card`, the
// open one framed, «+ условие», «+ Блок», the preview on the right; ⌘S saves and keeps the tab; closing it unsaved
// asks «Сохранить изменения в агенде …?».

const WORK = '* TODO Подготовить бюджет\nSCHEDULED: <2026-10-16 Пт>\n* NEXT План найма\n* DONE Старое\n';
const store = (page: Page, code: string) => page.evaluate(async (c) => new Function('store', `return (async () => { ${c} })()`)((await import('/src/store.svelte.ts' as string)).store), code);
const ab = (page: Page) => page.getByRole('region', { name: 'Конструктор агенды' });
const tabs = (page: Page) => page.getByRole('tablist', { name: 'Вкладки' }).getByRole('tab');

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/work.org': WORK }, now: new Date(2026, 9, 16, 12, 0), ready: false, viewport: { width: 1440, height: 900 } });
  await expect.poll(() => store(page, 'return store.loaded')).toBe(true);
  await store(page, 'store.newAgendaInBuilder()');
  await expect(ab(page)).toBeVisible();
}

test('a tab, not a sheet: its name «… — правка», the header, the sources, the block open, the preview; the window takes input', async ({ page }) => {
  await open(page);
  await expect(tabs(page).filter({ hasText: 'Новая агенда — правка' })).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Конструктор агенды' })).toHaveCount(0);
  await expect(ab(page).locator('.kick')).toHaveText('Конструктор агенды');
  const name = ab(page).getByRole('textbox', { name: 'Название агенды' });
  await expect(name).toBeFocused();
  expect(await name.evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Yeseva One');
  await expect(ab(page).locator('.src')).toContainText('Источники: все файлы');
  await expect(ab(page).locator('.src .note')).toHaveText('· архивы не входят');
  await expect(ab(page).locator('.block.open')).toHaveCount(1);
  await expect(ab(page).getByRole('complementary', { name: 'Предпросмотр' })).toContainText('Подготовить бюджет');
  // the sidebar works while it is open
  await expect(page.locator('.win')).not.toHaveAttribute('inert', '');
});

test('typing a name: the dot on the tab; ⌘S saves and keeps the tab; closing unsaved asks, «Не сохранять» drops', async ({ page }) => {
  await open(page);
  await page.keyboard.type('Мой фокус');
  await expect(tabs(page).filter({ hasText: 'Мой фокус — правка' })).toHaveClass(/dirty/);
  await page.keyboard.press('Meta+s');
  await expect.poll(() => store(page, 'return store.agendas.map((a) => a.name)')).toEqual(['Мой фокус']);
  await expect(ab(page)).toBeVisible();
  await expect(tabs(page).filter({ hasText: 'Мой фокус — правка' })).not.toHaveClass(/dirty/);
  // an edit, then the tab closed: the sheet
  await ab(page).getByRole('textbox', { name: 'Название агенды' }).fill('Мой фокус 2');
  await page.keyboard.press('Meta+w');
  const sheet = page.getByRole('alertdialog', { name: 'Сохранить изменения в агенде «Мой фокус 2»?' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Сохранить агенду/ })).toBeVisible();
  await sheet.getByRole('button', { name: /Не сохранять/ }).click();
  await expect(ab(page)).toHaveCount(0);
  await expect(tabs(page).filter({ hasText: 'правка' })).toHaveCount(0);
  expect(await store(page, 'return store.agendas.map((a) => a.name)')).toEqual(['Мой фокус']);
});

test('a condition: «+ условие» → «Статус» → its values; the block\'s summary; «+ Блок»', async ({ page }) => {
  await open(page);
  await ab(page).getByRole('button', { name: '+ условие' }).click();
  const pop = page.getByRole('menu', { name: 'Поле условия' });
  await pop.getByRole('menuitem', { name: /Статус/ }).click();
  const vals = page.getByRole('listbox', { name: 'Значение' });
  await expect(vals).toBeVisible();
  await vals.getByRole('option', { name: /NEXT/ }).click();
  await page.keyboard.press('Enter');
  await expect(ab(page).locator('.vchip')).toContainText(['NEXT']);
  await expect(ab(page).getByRole('complementary', { name: 'Предпросмотр' })).toContainText('План найма');
  await expect(ab(page).getByRole('complementary', { name: 'Предпросмотр' })).not.toContainText('Подготовить бюджет');
  await ab(page).getByRole('button', { name: '+ Блок' }).click();
  await expect(ab(page).locator('.bwrap')).toHaveCount(2);
  await expect(ab(page).locator('.block:not(.open) .sum')).toContainText('NEXT');
});
