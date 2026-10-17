import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 44.1 (§1): the controls of the new interface — buttons (30 pt, the main on `lamp`, the key at 60%), the field
// (30 pt, `lampline` in focus, the reason in `todo`), the sheet (out from under the toolbar, 440 pt, the lower corners
// 14 pt, `dim` under it, ⎋ cancels). The kit page mounts them all.

async function kit(page: Page, scheme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': '* A\n' }, ready: false, viewport: { width: 1440, height: 820 } });
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
  await page.evaluate(async () => {
    const { mount } = await import('/node_modules/.vite/deps/svelte.js' as string).catch(() => import('svelte' as string));
    const Kit = (await import('/src/next/ui/Kit.svelte' as string)).default;
    mount(Kit, { target: document.body });
  });
  await expect(page.locator('.kit')).toBeVisible();
}

test('buttons, the field, the sheet: sizes and colours; ⎋ cancels the sheet', async ({ page }) => {
  await kit(page);
  const main = page.locator('.kit .row').first().getByRole('button', { name: /Сохранить/ });
  expect(Math.round((await main.boundingBox())!.height)).toBe(30);
  expect(await main.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(227, 170, 60)');
  expect(await main.locator('.k').evaluate((e) => getComputedStyle(e).opacity)).toBe('0.6');
  const small = page.locator('.kit .row').first().getByRole('button', { name: /Проверить через/ });
  expect(Math.round((await small.boundingBox())!.height)).toBe(24);
  const f = page.getByRole('textbox', { name: 'Имя файла' });
  expect(Math.round((await f.boundingBox())!.height)).toBe(30);
  await f.focus();
  expect(await f.evaluate((e) => getComputedStyle(e).boxShadow)).toContain('1.5px');
  await f.fill('Команда/Ольга');
  await expect(page.getByRole('alert')).toHaveText('В имени не может быть «/»');
  expect(await f.getAttribute('aria-invalid')).toBe('true');
  const sheet = page.getByRole('dialog', { name: 'Сохранить изменения в 2 вкладках?' });
  await expect(sheet).toBeVisible();
  const b = (await sheet.boundingBox())!;
  expect(Math.round(b.width)).toBe(440);
  expect(await sheet.evaluate((e) => getComputedStyle(e).borderBottomLeftRadius)).toBe('14px');
  expect(await sheet.evaluate((e) => getComputedStyle(e).borderTopLeftRadius)).toBe('0px');
  await sheet.focus();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});
