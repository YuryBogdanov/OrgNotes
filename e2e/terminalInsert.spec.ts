import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// ТЗ 55.6: a heading into the session — ⌃C ⌃I on a heading writes its file's path and line into the active session
// (none: one starts, the text after it), lines selected give a range; «Вставить в терминал» of a heading's menu; the
// plugin's settings in «Настройки → Терминал» by its schema, the size applied at once.

async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': '* TODO Первая\nтекст\n* NEXT Вторая\nещё\n' }, ready: false, plugins: { terminal: ['process', 'clipboard', 'index.read'] }, viewport: { width: 1280, height: 860 } });
  await expect(page.locator('.cm-content')).toBeVisible();
  await pluginsReady(page);
  await expect.poll(() => page.evaluate(async () => (await import('/src/api/host.svelte.ts' as string)).plugins.drawers.has('terminal:panel'))).toBe(true);
}
const written = (page: Page) => page.evaluate(() => (window as any).__log.filter((x: unknown[]) => x[0] === 'pty_write').map((x: unknown[]) => x[2]).join(''));

test('⌃C ⌃I on a heading: its path and line into a session started for it; a range with lines selected', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: 'Вторая' }).click();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+i');
  await expect(page.locator('.drawer.open')).toBeVisible();
  await expect.poll(() => written(page)).toContain('/mock/a.org:3');
  await expect(page.locator('.drawer.open .tm-host:visible .xterm-helper-textarea')).toBeFocused();
  // lines selected in the editor: the range, with spaces around (the caret is not at the line's start now)
  await page.locator('.cm-line', { hasText: 'Первая' }).click();
  await page.keyboard.press('Home');
  await page.locator('.cm-line', { hasText: 'текст' }).click({ modifiers: ['Shift'] });
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+i');
  await expect.poll(() => written(page)).toContain(' /mock/a.org:1-2 ');
});

test('«Вставить в терминал» in a heading\'s menu; the settings by the schema, the size applied', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: 'Первая' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Вставить в терминал' }).click();
  await expect.poll(() => written(page)).toContain('/mock/a.org:1');
  await page.keyboard.press('Meta+,');
  const s = page.getByRole('dialog', { name: 'Настройки' });
  await s.getByRole('tab', { name: 'Терминал', exact: true }).click();
  await expect(s.locator('section.grp .cap')).toHaveText(['Вид', 'Ввод', 'Оболочка'], { ignoreCase: true });
  await s.getByRole('button', { name: /^Размер шрифта:/ }).click();
  await page.getByRole('menuitem', { name: '14' }).click();
  await expect(s.locator('.row').filter({ hasText: 'Размер шрифта' }).locator('.dot')).toHaveCount(0); // no dot of a change outside «Клавиши» (fix #315)
  // the command in «Клавиши», with the core's of a heading
  await s.getByRole('tab', { name: 'Клавиши', exact: true }).click();
  await expect(s.getByRole('region', { name: /ЗАГОЛОВКИ/i }).locator('.row[data-id="terminal.insertHeading"]')).toContainText('⌃C ⌃I');
  await s.getByRole('tab', { name: 'Терминал', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.locator('.drawer.open .tm-host:visible .xterm-rows').evaluate((e) => getComputedStyle(e).fontSize)).toBe('14px');
});
