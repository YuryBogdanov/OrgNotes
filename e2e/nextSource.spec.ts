import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 42.8: «Исходник» of the new interface — IBM Plex Mono 13.5 in lines of 24 pt from the left up to 880 pt; the
// marks in the tokens' colours (SCHEDULED: lamp, DEADLINE: todo, CLOSED: grey, [X] done, dates `next`); a folded
// drawer «⋯ 1». The old interface's plain editor keeps its look.

const DOC = ['* TODO Роадмап :работа:', 'SCHEDULED: <2026-10-16 Пт> DEADLINE: <2026-10-21 Ср>', ':PROPERTIES:', ':ID: x1', ':END:', '- [X] Вводные', 'CLOSED: [2026-10-14 Ср 10:00]', ''].join('\n');
const view = (page: Page) => page.locator('[data-ui="next"] .cm-editor');
const color = (page: Page, sel: string) => view(page).locator(sel).first().evaluate((el) => getComputedStyle(el).color);
const token = (page: Page, name: string) =>
  page.locator('.next[data-ui="next"]').evaluate((el, n) => {
    const p = document.createElement('span');
    p.style.color = `var(--${n})`;
    el.appendChild(p);
    const c = getComputedStyle(p).color;
    p.remove();
    return c;
  }, name);

test('the font, the lines, the width; the marks in the tokens\' colours; a folded drawer counts its lines', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ui:next', '1');
    localStorage.setItem('editor:rich', '0');
  });
  await openApp(page, { files: { '/mock/a.org': DOC }, ready: false });
  await expect(view(page)).not.toHaveClass(/cm-rich/);
  const line = view(page).locator('.cm-line').nth(1);
  expect(await line.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('IBM Plex Mono');
  expect(await line.evaluate((el) => getComputedStyle(el).fontSize)).toBe('13.5px');
  expect(await line.evaluate((el) => getComputedStyle(el).lineHeight)).toBe('24px');
  expect(await view(page).locator('.cm-content').evaluate((el) => getComputedStyle(el).maxWidth)).toBe('880px');
  expect(await color(page, '.cm-plan-scheduled')).toBe(await token(page, 'lampink'));
  expect(await color(page, '.cm-plan-deadline')).toBe(await token(page, 'todo'));
  expect(await color(page, '.cm-ts')).toBe(await token(page, 'next'));
  expect(await color(page, '.cm-boxx')).toBe(await token(page, 'done'));
  await expect(view(page).locator('.cm-foldPlaceholder')).toHaveText('⋯ 1');
});

test('the old interface\'s plain editor: a folded drawer is «…» as before', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('editor:rich', '0'));
  await openApp(page, { files: { '/mock/a.org': DOC } });
  await expect(page.locator('.cm-foldPlaceholder')).toHaveText('…');
});
