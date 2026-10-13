import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// ТЗ 31, PR A (the prototype): the mini window's page — its header and a draft; what it asks the native panel. The
// panel itself (over full-screen programs, the fading) is checked by hand on the app.

const log = (page: Page) => page.evaluate(() => (window as any).__log as unknown[][]);

test('the page of the mini window: the header, a draft kept; typing, ⎋ and ⌘W go to the panel', async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 330 });
  await installTauriMock(page, { '/mock/Work.org': '* Q4\n' });
  await page.goto('/#mini');
  const mini = page.getByRole('application', { name: 'Мини-окно' });
  await expect(mini.getByRole('button', { name: 'Скрыть мини-окно' })).toBeVisible();
  await expect(page.locator('.toolbar')).toHaveCount(0); // not the main window
  const text = mini.getByRole('textbox', { name: 'Текст' });
  await expect(text).toBeFocused();
  await page.keyboard.type('мысль на созвоне');
  await expect.poll(async () => (await log(page)).some((e) => e[0] === 'mini_typed')).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await log(page)).some((e) => e[0] === 'mini_return_focus')).toBe(true);
  await page.keyboard.press('Meta+w');
  await expect.poll(async () => (await log(page)).some((e) => e[0] === 'mini_hide')).toBe(true);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Текст' })).toHaveValue('мысль на созвоне'); // the draft is kept
});

test('the main window registers ⌃⌥⌘M; «Мини-окно: показать» is in the palette', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, { '/mock/Work.org': '* Q4\n' });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await expect.poll(async () => (await log(page)).find((e) => e[0] === 'set_mini_shortcut')?.[1]).toEqual({ accelerator: 'Control+Alt+CmdOrCtrl+KeyM' });
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('мини');
  await expect(page.getByRole('dialog', { name: 'Командная палитра' })).toContainText('Мини-окно: показать');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await log(page)).some((e) => e[0] === 'mini_toggle')).toBe(true);
});
