import { expect, test, type Page } from '@playwright/test';
import { diskFile as disk, openApp } from './helpers';
import { pluginsReady } from './tauriMock';
import { FILES } from './kanbanFixture';

// ТЗ 49.3: `--font-text` — the file's text's font for the plugins (the board's cards); `ui.editor` in the new interface
// is the new editor narrowed to the subtree, in «Оформление» (the board's card at the side), its edits in the file.

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

test('--font-text on the view\'s element is the editor\'s font; the card at the side — the new editor, narrowed, in Cormorant; an edit goes to the file', async ({ page }) => {
  await open(page);
  const font = await page.locator('.fview .host').evaluate((e) => getComputedStyle(e).getPropertyValue('--font-text').trim());
  expect(font).toContain('Cormorant'); // the editor's, resolved
  await page.locator('.kanban .kb-card', { hasText: 'Переезд в новый ДЦ' }).dblclick();
  const peek = page.locator('.kanban').getByRole('dialog', { name: 'Карточка' });
  await expect(peek).toBeVisible();
  const ed = peek.locator('.cm-editor');
  await expect(ed).toBeVisible();
  expect(await ed.evaluate((e) => !!e.closest('[data-ui="next"]'))).toBe(true);
  expect(await peek.locator('.cm-content').evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Cormorant');
  await expect(peek.locator('.cm-line', { hasText: 'RFC логирования' })).toHaveCount(0); // narrowed to its subtree
  await peek.locator('.cm-line', { hasText: 'Инвентаризация' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' сервисов');
  await expect.poll(() => disk(page, P)).toContain('Инвентаризация сервисов');
});
