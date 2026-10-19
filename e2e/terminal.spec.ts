import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// ТЗ 55.3: the plugin «Терминал» in the new interface — ⌃` the panel with the shell, its output; ⌃C to the process
// (the app's ⌃C chords not run there), ⌘K the palette from the terminal; sessions' tabs, «+», «×» of a live one asks;
// ⌘-click on «Midterm.org:2» opens the file at its line; ⌘F finds in the output; the theme repaints it.

const F: Record<string, string> = { '/mock/Midterm.org': '* TODO Переезд\nтекст\n* NEXT Ещё\n' };
async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: F, ready: false, plugins: { terminal: ['process', 'clipboard'] }, viewport: { width: 1280, height: 860 } });
  await expect(page.locator('.cm-content')).toBeVisible();
  await pluginsReady(page);
  await expect.poll(() => page.evaluate(async () => (await import('/src/api/host.svelte.ts' as string)).plugins.drawers.has('terminal:panel'))).toBe(true);
}
const panel = (page: Page) => page.getByRole('region', { name: 'Терминал' });
const rows = (page: Page) => panel(page).locator('.xterm-rows');

test('⌃` shows the shell; typed lines run; ⌃C goes to the process, not the app; ⌘K the palette from it', async ({ page }) => {
  await open(page);
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+Backquote');
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole('tab')).toHaveCount(1);
  await expect(rows(page)).toContainText('$');
  await page.keyboard.type('echo привет');
  await page.keyboard.press('Enter');
  await expect(rows(page)).toContainText('привет');
  // ⌃C: the process's (the mock prints ^C), no chord of the app waits
  await page.keyboard.press('Control+c');
  await expect(rows(page)).toContainText('^C');
  await page.keyboard.press('s'); // ⌃C S would schedule in the editor: here it is a letter for the process
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const log = await page.evaluate(() => (window as any).__log.filter((x: unknown[]) => x[0] === 'pty_write').map((x: unknown[]) => x[2]).join(''));
  expect(log).toContain('\u0003s');
  // ⌘K: the app's, from the terminal
  await page.keyboard.press('Meta+k');
  await expect(page.locator('.pal, [role="dialog"][aria-label*="алитр"]').first()).toBeVisible();
  await page.keyboard.press('Escape');
  // ⌃` with the focus in the terminal: hidden; again: shown, the focus back
  await panel(page).locator('.xterm-helper-textarea').focus();
  await page.keyboard.press('Control+Backquote');
  await expect(panel(page)).toHaveCount(0);
  await page.keyboard.press('Control+Backquote');
  await expect(panel(page)).toBeVisible();
  await expect(rows(page)).toContainText('привет'); // the same session, not made again
});

test('sessions: «+» another, a tab each; «×» of a live one asks «Завершить процесс?»', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Shift+Backquote');
  await expect(panel(page)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Новая сессия' }).click();
  const tabs = panel(page).getByRole('tab');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await tabs.nth(1).hover();
  await tabs.nth(1).getByRole('button', { name: /Закрыть сессию/ }).click();
  const sh = page.getByRole('dialog', { name: 'Завершить процесс?' });
  await expect(sh).toBeVisible();
  await sh.getByRole('button', { name: 'Завершить' }).click();
  await expect(tabs).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__log.some((x: unknown[]) => x[0] === 'pty_kill'))).toBe(true);
});

test('⌘-click on «Midterm.org:3» opens the file at line 3; ⌘F finds in the output; the theme repaints', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Backquote');
  await expect(rows(page)).toContainText('$');
  const id = await page.evaluate(() => Object.keys((window as any).__ptys)[0]);
  await page.evaluate((pid) => (window as any).__ptyOut(pid, '\r\nсмотри Midterm.org:3 и дальше\r\n'), id);
  const word = rows(page).getByText('Midterm.org:3', { exact: false });
  await expect(word).toBeVisible();
  const box = (await word.boundingBox())!;
  // the link's cells: about the middle of «Midterm.org:3» inside the line
  const x = box.x + (await word.evaluate((e) => (e.textContent ?? '').indexOf('Midterm'))) * 7.6 + 30;
  await page.keyboard.down('Meta');
  await page.mouse.move(x, box.y + box.height / 2);
  await page.mouse.click(x, box.y + box.height / 2);
  await page.keyboard.up('Meta');
  await expect.poll(() => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.tab?.cursor?.line)).toBe(2);
  // ⌘F in the terminal: its own find bar
  await panel(page).locator('.xterm-helper-textarea').focus();
  await page.keyboard.press('Meta+f');
  await expect(panel(page).getByRole('textbox', { name: 'Найти в выводе' })).toBeFocused();
  await page.keyboard.press('Escape');
  // the theme: dark → the terminal's ground changes
  const bg = () => panel(page).locator('.xterm-rows').evaluate((e) => getComputedStyle(e).color);
  const before = await bg();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(bg).not.toBe(before);
});
