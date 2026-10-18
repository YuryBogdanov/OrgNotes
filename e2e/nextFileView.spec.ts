import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';
import { FILES } from './kanbanFixture';

// ТЗ 49.1: the file view's host of the new interface (not the bridge): the plugin draws in an element with the
// compatibility layer's variables and `data-ui="next"` on it, over `bg` with the grid; a plugin stopped by an error —
// «Плагин «…» остановлен из-за ошибки», «Показать текст», «Настройки плагинов».

const P = '/mock/work/platform.org';
async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: FILES(), ready: false, viewport: { width: 1600, height: 900 } });
  await pluginsReady(page);
  await page.evaluate(async (p) => {
    const { store } = await import('/src/store.svelte.ts' as string);
    store.open(store.files.findIndex((f: { path: string }) => f.path === p), 0);
  }, P);
  await expect(page.locator('.kanban')).toBeVisible();
}

test('the board in the new host: no layer around it, the variables and data-ui on the element, the grid under it', async ({ page }) => {
  await open(page);
  const host = page.locator('.fview .host[data-file-view]');
  await expect(host).toHaveAttribute('data-ui', 'next');
  expect(await host.evaluate((e) => !!e.closest('.compat'))).toBe(false);
  expect(await host.evaluate((e) => getComputedStyle(e).getPropertyValue('--acc').trim())).not.toBe('');
  expect(await page.locator('.fview').evaluate((e) => getComputedStyle(e).backgroundImage)).toContain('linear-gradient');
});

test('the plugin stopped by an error: the word, «Показать текст» back to the text, «Настройки плагинов»', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const { store } = await import('/src/store.svelte.ts' as string);
    store.showAs(store.tab, store.viewOf(store.tab)); // the board chosen for the file
    (await import('/src/api/host.svelte.ts' as string)).plugins.fail('kanban', new Error('сломалось'));
  });
  const word = page.locator('.fview [role=alert]');
  await expect(word).toContainText('Плагин «Канбан» остановлен из-за ошибки');
  await expect(word.getByRole('button', { name: 'Настройки плагинов' })).toBeVisible();
  await word.getByRole('button', { name: 'Показать текст' }).click();
  await expect(page.locator('.cm-content')).toBeVisible();
});
