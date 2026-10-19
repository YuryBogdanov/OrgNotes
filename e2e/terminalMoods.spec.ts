import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// ТЗ 55.4: the sessions' states — busy, «ждёт ввода» after 2 s, «ждёт ответа» on a bell unseen, «завершена · код 0»;
// the section «Терминал» with its badge (alert) for the ones that rang unseen; a notification of macOS when the window
// is not in front, its click shows the session.

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': '* TODO A\n' }, ready: false, plugins: { terminal: ['process', 'clipboard'] }, viewport: { width: 1280, height: 860 } });
  await expect(page.locator('.cm-content')).toBeVisible();
  await pluginsReady(page);
  await expect.poll(() => page.evaluate(async () => (await import('/src/api/host.svelte.ts' as string)).plugins.drawers.has('terminal:panel'))).toBe(true);
}
const drawer = (page: Page) => page.locator('.drawer.open');
const rail = (page: Page) => page.getByRole('button', { name: /Терминал/ }).first();
const out = (page: Page, text: string) => page.evaluate((t) => { const w = window as any; w.__ptyOut(Object.keys(w.__ptys)[0], t); }, text);

test('the states in the section; a bell unseen — the badge and, the window not in front, a notification', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Backquote');
  await expect(drawer(page).locator('.xterm-rows')).toContainText('$');
  await rail(page).click();
  const sec = page.locator('.ts');
  await expect(sec.locator('.row')).toHaveCount(1);
  await expect(sec.locator('.row .mood')).toHaveText('ждёт ввода', { timeout: 6000 });
  // hidden, out of the window's focus: a bell
  await page.getByRole('button', { name: 'Скрыть терминал' }).click();
  await expect(drawer(page)).toHaveCount(0);
  await page.evaluate(() => (document.hasFocus = () => false));
  await out(page, 'готово?\x07');
  await expect(sec.locator('.row .mood')).toHaveText('ждёт ответа');
  await expect(rail(page).locator('.bd')).toHaveText('1');
  await expect(rail(page).locator('.bd')).toHaveClass(/alert/);
  const n = await page.evaluate(() => (window as any).__log.filter((x: unknown[]) => x[0] === 'notify_system'));
  expect(n).toHaveLength(1);
  expect(n[0].slice(1, 3)).toEqual(['zsh', 'ждёт ответа']);
  // the notification clicked: the session shown, the bell seen
  await page.evaluate(() => (document.hasFocus = () => true));
  await page.evaluate((tag) => (window as any).__emitEvent('notify-click', tag), n[0][3]);
  await expect(drawer(page)).toBeVisible();
  await expect(rail(page).locator('.bd')).toHaveCount(0);
  // ended
  await page.keyboard.type('exit');
  await page.keyboard.press('Enter');
  await expect(sec.locator('.row .mood')).toHaveText('завершена · код 0');
  await expect(drawer(page).locator('.xterm-rows')).toContainText('Процесс завершён (код 0)');
});
