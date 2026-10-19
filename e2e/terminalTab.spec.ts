import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// ТЗ 55.5: «Во вкладку» moves every session into the tab «Терминал» (the processes live on), «В панель» back; the
// section — «Сессии» with their menu, «Профили» (a click starts one; the empty «Агент» asks its command; «+ Профиль…»);
// ⌥-click on «+» the profiles; the old interface opens the tab.

async function open(page: Page, next = true) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  if (next) await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': '* TODO A\n' }, ready: false, plugins: { terminal: ['process', 'clipboard'] }, viewport: { width: 1280, height: 860 } });
  await expect(page.locator('.cm-content')).toBeVisible();
  await pluginsReady(page);
  await expect.poll(() => page.evaluate(async () => (await import('/src/api/host.svelte.ts' as string)).plugins.drawers.has('terminal:panel'))).toBe(true);
}
const spawns = (page: Page) => page.evaluate(() => (window as any).__log.filter((x: unknown[]) => x[0] === 'pty_spawn').length);
const drawer = (page: Page) => page.locator('.drawer.open');

test('«Во вкладку»: the sessions in the tab, not started again; «В панель» back', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+Backquote');
  await expect(drawer(page).locator('.xterm-rows')).toContainText('$');
  await page.keyboard.type('echo один');
  await page.keyboard.press('Enter');
  await drawer(page).getByRole('button', { name: 'Новая сессия' }).click();
  await expect.poll(() => spawns(page)).toBe(2);
  await drawer(page).getByRole('button', { name: 'Во вкладку' }).click();
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Терминал' })).toHaveAttribute('aria-selected', 'true');
  const tabBody = page.locator('.tp.tab');
  await expect(tabBody.getByRole('tab')).toHaveCount(2);
  await tabBody.getByRole('tab').first().click();
  await expect(tabBody.locator('.tm-host:visible .xterm-rows')).toContainText('один'); // the same terminal
  expect(await spawns(page)).toBe(2);
  await expect(page.locator('header.bar')).toContainText('Терминал');
  // «В панель»: the command
  await page.keyboard.press('Meta+k');
  await page.keyboard.type('Терминал: в панель');
  await page.keyboard.press('Enter');
  await expect(drawer(page).locator('.tm-host:visible .xterm-rows')).toContainText('один');
  expect(await spawns(page)).toBe(2);
});

test('the section: profiles — «Агент» asks its command and starts it; ⌥-click on «+»; a session\'s menu renames', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /Терминал/ }).first().click();
  const sec = page.locator('.ts');
  await expect(sec.locator('.prow')).toHaveCount(2);
  await expect(sec.locator('.prow').first()).toContainText('Оболочка');
  await sec.locator('.prow').filter({ hasText: 'Агент' }).click();
  const form = page.getByRole('dialog', { name: /Профиль «Агент»/ });
  await expect(form).toBeVisible();
  await form.getByRole('textbox', { name: 'Команда' }).fill('agent --fast');
  await form.getByRole('button', { name: 'Сохранить' }).click();
  await expect(drawer(page).getByRole('tab', { name: /agent/ })).toBeVisible();
  const last = await page.evaluate(() => (window as any).__log.filter((x: unknown[]) => x[0] === 'pty_spawn').at(-1));
  expect(last[2]).toBe('agent');
  await expect(sec.locator('.prow').filter({ hasText: 'Агент' })).toContainText('agent --fast');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('feature:terminal') ?? '{}'))).toBeTruthy();
  // ⌥-click on «+»: the profiles' menu
  await drawer(page).getByRole('button', { name: 'Новая сессия' }).click({ modifiers: ['Alt'] });
  await expect(page.getByRole('menuitem', { name: 'Оболочка' })).toBeVisible();
  await page.keyboard.press('Escape');
  // the session's menu: «Переименовать…»
  await sec.locator('.row').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Переименовать…' }).click();
  const rn = page.getByRole('dialog', { name: 'Переименовать сессию' });
  await rn.getByRole('textbox', { name: 'Имя' }).fill('мой агент');
  await rn.getByRole('button', { name: 'Сохранить' }).click();
  await expect(sec.locator('.row').first()).toContainText('мой агент');
});

test('the old interface: ⌃` opens the tab «Терминал» with the shell', async ({ page }) => {
  await open(page, false);
  await page.keyboard.press('Control+Backquote');
  await expect(page.locator('.tp.tab .xterm-rows')).toContainText('$');
});
