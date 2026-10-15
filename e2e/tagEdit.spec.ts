import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';
import { diskFile as disk } from './helpers';

// ТЗ 38, PR C: the tags of a heading in the editor — ⌃C Q (and «Теги…» of the menu and the palette): a field with the
// folder's tags, ↩ / ⌫ / ⎋, the changes in the line at once and one ⌘Z; the tags offered while typing; a click on a
// tag opens its tab.

const WORK = ['* TODO Переезд в новый ДЦ    :infra:dc:', 'Текст.', '* Отчёт по SLA :sla:', '* Слайды :slides:', '* Без тегов', ''].join('\n');
const line = (page: Page, n: number) => page.locator('.cm-line').nth(n);
const pop = (page: Page) => page.getByRole('dialog', { name: 'Теги заголовка' });
async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('plugins:updatesChecked', String(Date.now())));
  await installTauriMock(page, { '/mock/work.org': WORK });
  await page.goto('/');
  await pluginsReady(page);
  await expect(page.locator('.cm-content')).toBeVisible();
}
async function caretOn(page: Page, n: number) {
  await line(page, n).click();
  await page.keyboard.press('End');
}
const text = (page: Page) => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.files.find((f: any) => f.name === 'work.org').text as string);

test('⌃C Q: the field — the tags as capsules, the folder\'s tags by substring with how many headings, «Создать тег»; ↩ ⌫ ⎋; one ⌘Z', async ({ page }) => {
  await open(page);
  await caretOn(page, 0);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('q');
  await expect(pop(page)).toBeVisible();
  await expect(pop(page).locator('.chip')).toHaveText([/:infra:/, /:dc:/]);
  await page.keyboard.type('sl');
  await expect(pop(page).getByRole('option')).toHaveText([/:sla:\s*1 заголовок/, /:slides:\s*1 заголовок/, /Создать тег :sl:/]);
  await page.keyboard.press('Enter');
  await expect.poll(() => text(page)).toContain('* TODO Переезд в новый ДЦ    :infra:dc:sla:');
  await page.keyboard.type('бюджет');
  await page.keyboard.press('Enter'); // a new tag
  await expect.poll(() => text(page)).toContain(':infra:dc:sla:бюджет:');
  await page.keyboard.press('Backspace'); // the last one away
  await expect.poll(() => text(page)).toContain('    :infra:dc:sla:\n');
  await page.keyboard.press('Escape');
  await expect(pop(page)).toHaveCount(0);
  // one ⌘Z: back to before the field was opened
  await page.keyboard.press('Meta+z');
  await expect.poll(() => text(page)).toBe(WORK);
});

test('typing « :» in a heading\'s line offers the folder\'s tags; a pick ends with «:»', async ({ page }) => {
  await open(page);
  await caretOn(page, 4);
  await page.keyboard.type(' :sl');
  const list = page.locator('.cm-tooltip-autocomplete');
  await expect(list).toContainText('sla');
  await expect(list).toContainText('slides');
  await page.waitForTimeout(150); // CodeMirror takes no ↩ in the first moments of a list
  await page.keyboard.press('Enter');
  await expect.poll(() => text(page)).toContain('* Без тегов :sla:');
});

test('⌘-click on a tag opens its tab; «Теги…» of the editor\'s menu and of the palette open the field', async ({ page }) => {
  await open(page);
  await line(page, 2).locator('.cm-tags').click({ modifiers: ['Meta'] });
  await expect(page.locator('.tab.on')).toContainText('Тег :sla:');
  await page.locator('.tab', { hasText: 'work' }).click();
  await caretOn(page, 0);
  await line(page, 0).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Теги…/ }).click();
  await expect(pop(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('теги');
  await page.getByRole('option', { name: /^Теги…/ }).click();
  await expect(pop(page)).toBeVisible();
  await expect(pop(page).locator('.chip')).toHaveCount(2);
});

test('«Оформленный текст»: a tag is a capsule — a click opens its tab', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.setRich(true));
  await line(page, 3).click(); // the caret away from the line of the tags
  await page.locator('.cm-r-cap.tag[data-tag="infra"]').click();
  await expect(page.locator('.tab.on')).toContainText('Тег :infra:');
});
