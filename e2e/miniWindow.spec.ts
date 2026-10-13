import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// ТЗ 31: the mini window from the main window — ⌃⌥⌘M registered, ⇧⌘M opens the heading the caret is in, the main
// window answers the mini window (its files) and takes its edits. The native panel is checked by hand on the app.

const W = '/mock/Work.org';
const TEXT = '* Созвон\n** Что показали\n- миграция\n* Другое\n';
const log = (page: Page) => page.evaluate(() => (window as any).__log as unknown[][]);
const disk = (page: Page) => page.evaluate((p) => (window as any).__disk[p] as string, W);

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, { [W]: TEXT });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
}

test('⌃⌥⌘M is registered; ⇧⌘M opens the heading the caret is in; the palette has both', async ({ page }) => {
  await open(page);
  await expect.poll(async () => (await log(page)).find((e) => e[0] === 'set_mini_shortcut')?.[1]).toEqual({ accelerator: 'Control+Alt+CmdOrCtrl+KeyM' });
  await page.locator('.cm-line', { hasText: 'миграция' }).click();
  await page.keyboard.press('Shift+Meta+m');
  await expect.poll(async () => (await log(page)).find((e) => e[0] === 'mini_open')?.[1]).toEqual({ note: { path: 'Work.org', line: 1, title: 'Что показали' } });
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('мини-окно');
  const pal = page.getByRole('dialog', { name: 'Командная палитра' });
  await expect(pal).toContainText('Мини-окно: открыть текущую заметку');
  await expect(pal).toContainText('Мини-окно: показать');
});

test('the main window answers the mini window: all the files, then each change; its edits are written', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).__emitEvent('mini-hello', null));
  await expect.poll(async () => {
    const e = (await log(page)).find((x) => x[0] === 'emit' && x[1] === 'mini' && x[2] === 'mini-snapshot');
    return (e?.[3] as { files: { name: string }[] } | undefined)?.files.map((f) => f.name);
  }).toEqual(['Work.org']);
  // an edit of the mini window: written by the main window, not sent back to it
  await page.evaluate(([p, t]) => (window as any).__emitEvent('mini-edit', { path: p, text: t }), [W, TEXT + '* Новое\n']);
  await expect.poll(() => disk(page)).toBe(TEXT + '* Новое\n');
  await expect(page.locator('section.pane .cm-line', { hasText: 'Новое' })).toBeVisible();
  expect((await log(page)).some((x) => x[0] === 'emit' && x[2] === 'mini-file')).toBe(false);
  // typed here: sent to the mini window
  await page.locator('.cm-line', { hasText: 'Другое' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect.poll(async () => (await log(page)).filter((x) => x[0] === 'emit' && x[2] === 'mini-file').map((x) => (x[3] as { text: string }).text).at(-1)).toContain('* Другое!');
});
