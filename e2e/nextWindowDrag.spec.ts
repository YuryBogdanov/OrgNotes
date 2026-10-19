import { expect, test } from '@playwright/test';
import { log, openApp } from './helpers';

// The new interface's title bar: a press on the toolbar (not on its buttons) or on the room of the lights drags the
// window, a double click zooms it — WKWebView has no `-webkit-app-region`, Tauri is asked.

test('the toolbar and the lights\' room drag the window; a double click zooms; the buttons keep their clicks', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': '* TODO Задача\n' }, ready: false, viewport: { width: 1280, height: 800 } });
  const bar = page.locator('header.bar');
  await expect(bar).toBeVisible();
  const drags = async () => (await log(page)).filter((x) => x[0] === 'drag' || x[0] === 'zoom').map((x) => x[0]);
  const box = (await bar.locator('.gap').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(drags).toEqual(['drag']);
  await bar.locator('.title').dblclick();
  await expect.poll(drags).toContain('zoom');
  const before = (await drags()).length;
  await bar.getByRole('button', { name: 'Новая заметка' }).click();
  await page.waitForTimeout(200);
  expect((await drags()).length).toBe(before);
  // the lights' room above the rail
  await page.locator('.rail > .lights').click();
  await expect.poll(async () => (await drags()).length).toBe(before + 1);
});

// fix #304: the tabs' empty place drags too; a double click does what macOS says. fix #298: full screen — the page's
// own lights while the pointer is at the top, the window under the menu's line, the green one leaves full screen.
test('the tabs\' empty place drags; a double click minimises when macOS says so, does nothing with «None»', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': '* TODO Задача\n' }, ready: false, viewport: { width: 1280, height: 800 } });
  const tabs = page.locator('.tabs');
  await expect(tabs).toBeVisible();
  const box = (await tabs.boundingBox())!;
  const acts = async () => (await log(page)).filter((x) => ['drag', 'zoom', 'minimize'].includes(x[0] as string)).map((x) => x[0]);
  await page.mouse.click(box.x + box.width - 300, box.y + box.height / 2);
  await expect.poll(acts).toEqual(['drag']);
  await page.evaluate(() => ((window as any).__dblAction = 'Minimize'));
  await page.mouse.dblclick(box.x + box.width - 300, box.y + box.height / 2);
  await expect.poll(acts).toContain('minimize');
  await page.evaluate(() => ((window as any).__dblAction = 'None'));
  const n = (await acts()).filter((x) => x !== 'drag').length;
  await page.mouse.dblclick(box.x + box.width - 300, box.y + box.height / 2);
  await page.waitForTimeout(200);
  expect((await acts()).filter((x) => x !== 'drag').length).toBe(n);
});

test('full screen: no lights, no room, till the pointer is at the top — then the lights, the window under the menu\'s line', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': '* TODO Задача\n' }, ready: false, viewport: { width: 1280, height: 800 } });
  const titlebar = (fullscreen: boolean, lights: boolean, menu = 0) => page.evaluate(([f, l, m]) => (window as any).__emitEvent('titlebar', { fullscreen: f, lights: l, menu: m }), [fullscreen, lights, menu] as const);
  const group = page.locator('.fl'); // hidden: aria-hidden, so by its class
  const top = () => page.locator('.next > .win').evaluate((e) => e.getBoundingClientRect().top);
  await titlebar(true, false);
  await expect(group).toHaveCSS('opacity', '0');
  expect(await top()).toBe(0);
  await titlebar(true, true, 24);
  await expect(group).toHaveCSS('opacity', '1');
  await expect.poll(top).toBe(24);
  await group.getByRole('button', { name: 'Выйти из полноэкранного режима' }).click();
  await expect.poll(() => log(page)).toContainEqual(['fullscreen', false]);
  await titlebar(false, true);
  await expect(group).toHaveCSS('opacity', '0');
  await expect.poll(top).toBe(0);
});
