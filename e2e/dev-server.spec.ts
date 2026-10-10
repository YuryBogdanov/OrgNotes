import { expect, test } from '@playwright/test';
import { appendFileSync, rmSync, writeFileSync } from 'node:fs';

// `tauri dev` with the notes folder inside the project (sample-notes): autosave rewrites a file Vite can see.
// That used to hot-reload the app on every save and throw the cursor to the first line.
test('a note file changing on disk does not hot-reload the dev app or move the cursor', async ({ page }) => {
  const tmp = 'sample-notes/zz-dev-probe.org';
  writeFileSync(tmp, '* probe\n');
  try {
    await page.goto('/');
    await expect(page.locator('.cm-content')).toBeVisible();
    await page.locator('.cm-line').nth(3).click();
    await page.keyboard.press('End');
    await page.locator('.cm-content').evaluate((el) => el.setAttribute('data-mark', 'same-dom'));
    const before = await page.locator('.status').innerText();
    expect(before).toContain('Стр. 4');

    for (let i = 0; i < 3; i++) {
      appendFileSync(tmp, `* change ${i}\n`);
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(800);

    expect(await page.locator('.status').innerText()).toBe(before);
    expect(await page.locator('.cm-content').getAttribute('data-mark')).toBe('same-dom');
  } finally {
    rmSync(tmp, { force: true });
  }
});
