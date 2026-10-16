import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 42.1: «Новый интерфейс (бета)» — off by default; on in «Настройки → Основные» or the palette, the window reloads
// with the new shell (its files and tabs as they were); back the same way; the new shell failing to start gives the
// old one and a word why, the flag staying on.

const FILES = { '/mock/work.org': '* TODO Задача\nТекст.\n', '/mock/plan.org': '* План\n' };
const nextShell = (page: Page) => page.locator('[data-ui="next"]');

test('off by default: the old shell; on in the settings — the new one after a reload, the tabs kept; back by the palette', async ({ page }) => {
  await openApp(page, { files: FILES });
  await expect(nextShell(page)).toHaveCount(0);
  await page.keyboard.press('Meta+Comma');
  const sheet = page.getByRole('dialog', { name: 'Настройки' });
  await sheet.getByRole('tab', { name: 'Основные' }).click();
  await expect(sheet).toContainText('Окно перезапустится. Файлы, вкладки и настройки общие со старым интерфейсом.');
  await sheet.getByRole('switch', { name: 'Новый интерфейс (бета)' }).click();
  await expect(nextShell(page)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ui:next'))).toBe('1');
  await expect(nextShell(page)).toContainText('2 файла');
  // the palette (a bridge) offers the way back
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('старый интерфейс');
  await page.getByRole('option', { name: /^Вернуть старый интерфейс/ }).click();
  await expect(nextShell(page)).toHaveCount(0);
  await expect(page.locator('.cm-content')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ui:next'))).toBeNull();
});

test('the tabs open before come back after the switch and back again', async ({ page }) => {
  await openApp(page, { files: FILES });
  const tabs = () => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.layout.panes.flatMap((p: any) => p.tabs.map((t: any) => t.path)));
  const before = await tabs();
  expect(before.length).toBeGreaterThan(0);
  await page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.setInterface(true));
  await expect(nextShell(page)).toBeVisible();
  await expect.poll(tabs).toEqual(before);
  await page.getByRole('button', { name: 'Вернуть старый интерфейс' }).click();
  await expect(nextShell(page)).toHaveCount(0);
  await expect.poll(tabs).toEqual(before);
});

test('the new shell failing to start: the old one and a word why; the flag stays on', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await page.route('**/src/next/App.svelte*', (r) => r.abort());
  await openApp(page, { files: FILES });
  await expect(nextShell(page)).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Новый интерфейс не запустился — вернули старый. Подробности в журнале');
  expect(await page.evaluate(() => localStorage.getItem('ui:next'))).toBe('1');
});

test('the mini window and the quick entry stay old with the flag on', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: FILES, ready: false });
  await expect(nextShell(page)).toBeVisible();
  await page.goto('/#capture');
  await page.reload(); // a new hash alone does not load the page again
  await expect(page.locator('#app')).not.toBeEmpty();
  await expect(nextShell(page)).toHaveCount(0);
});

test('42.2: the tokens of the appearance, «Синька» by default, the bundled fonts; the old shell keeps Panopticon', async ({ page }) => {
  // on at the first load only: the switch back reloads the page, and an init script runs again
  await page.addInitScript(() => {
    if (sessionStorage.getItem('flagSet')) return;
    sessionStorage.setItem('flagSet', '1');
    localStorage.setItem('ui:next', '1');
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await openApp(page, { files: FILES, ready: false });
  await expect(nextShell(page)).toBeVisible();
  expect(await nextShell(page).evaluate((el) => getComputedStyle(el).getPropertyValue('--bg').trim())).toBe('#101c2c');
  expect(await page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.theme.name)).toBe('Синька — тёмная');
  // the fonts come from the app, not the network
  await expect.poll(() => page.evaluate(async () => (await document.fonts.load('500 19px "Cormorant Garamond"', 'Текст')).length)).toBeGreaterThan(0);
  expect(await page.evaluate(async () => (await document.fonts.load('28px "Yeseva One"', 'Новый')).length)).toBeGreaterThan(0);
  expect(await page.evaluate(async () => (await document.fonts.load('13px "IBM Plex Mono"', 'TODO')).length)).toBeGreaterThan(0);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => nextShell(page).evaluate((el) => getComputedStyle(el).getPropertyValue('--bg').trim())).toBe('#f8f6f0');
  // back to the old shell: Panopticon by default, «Синька» a choice there too
  await page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.setInterface(false));
  await expect(nextShell(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.loaded)).toBe(true);
  const st = await page.evaluate(async () => {
    const { store } = await import('/src/store.svelte.ts' as string);
    return { name: store.theme.name, has: store.themes.some((t: any) => t.name === 'Синька — светлая') };
  });
  expect(st).toEqual({ name: 'Panopticon светлая', has: true });
});
