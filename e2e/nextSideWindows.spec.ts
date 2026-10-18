import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// ТЗ 52.1: the mini window (#mini) and the quick entry (#capture) follow the flag of the new interface — on their
// root the new tokens by the appearance, `data-ui="next"`, the interface's fonts; the flag switched in the main
// window (the shared storage) reloads them; without it they are the old ones.

async function open(page: Page, hash: '#mini' | '#capture', next: boolean, scheme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ colorScheme: scheme });
  await page.addInitScript((n) => {
    if (n && !sessionStorage.getItem('flipped')) localStorage.setItem('ui:next', '1');
  }, next);
  await installTauriMock(page, {});
  await page.goto('/' + hash);
}
const root = (page: Page) => page.locator('.side-win[data-ui="next"]');

for (const hash of ['#mini', '#capture'] as const) {
  test(`${hash}: the new root with the tokens and the fonts; the dark appearance followed`, async ({ page }) => {
    await open(page, hash, true);
    await expect(root(page)).toHaveCount(1); // (the quick entry hides itself on losing the focus: present, maybe hidden)
    expect(await root(page).evaluate((e) => getComputedStyle(e).getPropertyValue('--lamp').trim())).toBe('#e3aa3c');
    expect(await root(page).evaluate((e) => getComputedStyle(e).getPropertyValue('--mono'))).toContain('Plex Mono');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => root(page).evaluate((e) => getComputedStyle(e).getPropertyValue('--lamp').trim())).toBe('#f2c66d');
  });

  test(`${hash}: the old window without the flag; the flag switched elsewhere reloads it into the new one`, async ({ page, context }) => {
    await open(page, hash, false);
    await expect(root(page)).toHaveCount(0);
    // the main window turns it on: another page of the same origin writes the flag
    const main = await context.newPage();
    await installTauriMock(main, {});
    await main.goto('/');
    await main.evaluate(() => localStorage.setItem('ui:next', '1'));
    await expect(root(page)).toHaveCount(1); // (the quick entry hides itself on losing the focus: present, maybe hidden)
    await main.close();
  });
}

// ТЗ 52.2: the mini window's look — «Исходник» always, IBM Plex Mono 12.5 on lines of 22, no line numbers; the
// header of 32 pt on `side`; the file's name without «.org»; the main window's switch has no say here
test('#mini: «Исходник» in Plex Mono 12.5 / 22 without line numbers whatever the main window\'s mode; the header', async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 330 });
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('ui:next', '1'); localStorage.setItem('editor:rich', '1'); });
  await installTauriMock(page, {});
  await page.goto('/#mini');
  const { log } = await import('./helpers');
  await expect.poll(async () => (await log(page)).some((e) => e[0] === 'emit' && e[2] === 'mini-hello')).toBe(true);
  const text = '* Работа\n** TODO Слайды\nSCHEDULED: <2026-10-20 Вт>\n';
  await page.evaluate((t) => (window as any).__emitEvent('mini-snapshot', { dir: '/mock', configRaw: null, note: { path: 'Work.org', line: 0, title: 'Работа' }, files: [{ name: 'Work.org', path: '/mock/Work.org', text: t, disk: t, diskRaw: t, eol: '\n' }] }), text);
  const mini = page.getByRole('application', { name: 'Мини-окно' });
  await expect(mini.locator('.cm-editor')).not.toHaveClass(/cm-rich/);
  await expect(mini.locator('.cm-lineNumbers')).toHaveCount(0);
  expect(await mini.locator('.cm-scroller').evaluate((e) => [getComputedStyle(e).fontFamily, getComputedStyle(e).fontSize])).toEqual([expect.stringContaining('Plex Mono'), '12.5px']);
  await expect(mini.locator('.cm-line').first()).toHaveCSS('line-height', '22px');
  await expect(mini.locator('header')).toHaveCSS('height', '32px');
  await expect(mini.locator('header .path')).toHaveText(/^Work ›\s*Работа$/);
  await expect(mini.locator('.cm-plan-scheduled')).toHaveCSS('color', 'rgb(138, 95, 14)'); // `lampink`
});

// ТЗ 52.3: ⌘P of the mini window — a popover in the window 8 pt from its edges; the field with the lamp's line; rows
// of 34 — the level in stars or the file's icon, the path without «.org»; the foot with its keys
test('#mini ⌘P: the popover, the field, rows of 34 with their paths, the foot', async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 330 });
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('ui:next', '1'); });
  await installTauriMock(page, {});
  await page.goto('/#mini');
  const { log } = await import('./helpers');
  await expect.poll(async () => (await log(page)).some((e) => e[0] === 'emit' && e[2] === 'mini-hello')).toBe(true);
  const t = '* Борис\n** 1-1 — 16 окт\n';
  await page.evaluate((x) => (window as any).__emitEvent('mini-snapshot', { dir: '/mock', configRaw: null, note: null, files: [{ name: '1on1/boris.org', path: '/mock/1on1/boris.org', text: x, disk: x, diskRaw: x, eol: '\n' }] }), t);
  const pal = page.getByRole('dialog', { name: 'Сменить заметку' });
  await expect(pal).toBeVisible(); // no note yet: at once
  await page.keyboard.type('бор');
  const win = (await page.getByRole('application', { name: 'Мини-окно' }).boundingBox())!;
  const b = (await pal.boundingBox())!;
  expect(Math.round(b.x - win.x)).toBe(9); // 8 pt inside the window's line of 1 (as the mockup)
  expect(await pal.locator('.field').evaluate((e) => getComputedStyle(e).boxShadow)).toContain('inset');
  const rows = pal.getByRole('option');
  await expect(rows.first()).toHaveCSS('height', '34px');
  await expect(pal.getByRole('option', { name: /Борис/ }).first().locator('.sub')).toHaveText('1on1 / boris');
  await pal.getByRole('textbox').fill('boris'); // the file whole: its icon, «весь файл»
  await expect(rows.first().locator('svg.lvl')).toHaveCount(1);
  await expect(rows.first().locator('.sub')).toHaveText('весь файл');
  await expect(pal.locator('.foot')).toHaveText('↩ открыть здесь · ⌘↩ весь файл · ⎋ закрыть');
});
