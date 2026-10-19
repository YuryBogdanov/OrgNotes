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
