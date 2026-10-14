import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// ТЗ 35, part A: ⌘V on a selection with a link in the clipboard makes it a link; ⌥⇧⌘V pastes the text as it is;
// ⌃C L copies the link to the heading (by :ID:, added when missing, or by title — the setting).

const P = '/mock/platform.org';
const B = '/mock/billing.org';
const PLATFORM = [
  '#+TITLE: Платформа',
  '',
  '* TODO [#A] Переезд в новый ДЦ :infra:',
  'Переносим сервисы. План в документе миграции, ответственный — Олег.',
  '** Чек-лист [2/5]',
  '- [ ] Репликация Postgres — см. ревью',
  '',
].join('\n');
const BILLING = ['* TODO Ревью архитектуры биллинга', 'SCHEDULED: <2026-10-20 Вт>', 'Текст ревью.', ''].join('\n');

async function open(page: Page, ls: Record<string, string> = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, { [P]: PLATFORM, [B]: BILLING });
  await page.addInitScript((ls) => {
    Object.entries(ls).forEach(([k, v]) => localStorage.setItem(k, v));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => ((window as any).__clip = t), readText: async () => (window as any).__clip ?? '' }, configurable: true });
  }, ls);
  await page.goto('/');
  await page.locator('.nav .row').filter({ has: page.locator('.label', { hasText: /^platform$/ }) }).click();
  await expect(page.locator('.cm-content').first()).toContainText('Переезд');
}
const disk = (page: Page, p = P) => page.evaluate((x) => (window as any).__disk[x] as string, p);
/** Select a piece of a line of the editor (by the DOM selection, as a drag would). */
async function select(page: Page, line: string, piece: string) {
  await page.locator('.cm-line', { hasText: line }).first().click();
  await page.evaluate(({ line, piece }) => {
    const el = [...document.querySelectorAll('.cm-line')].find((x) => x.textContent!.includes(line))!;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const i = n.textContent!.indexOf(piece);
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + piece.length);
        const s = getSelection()!;
        s.removeAllRanges();
        s.addRange(r);
        return;
      }
    }
    throw new Error('not found: ' + piece);
  }, { line, piece });
  await page.waitForTimeout(50);
}
/** ⌘V with this in the clipboard (a paste event, as the web view gives it). */
const paste = (page: Page, text: string) =>
  page.evaluate((text) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    document.querySelector('.cm-content')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);

test('⌘V on a selection with an address: the selection becomes the link\'s label; ⌘Z gives the text back', async ({ page }) => {
  await open(page);
  await select(page, 'План в документе', 'документе миграции');
  await paste(page, '  https://wiki.example.com/platform/dc-migration ');
  await expect.poll(() => disk(page)).toContain('План в [[https://wiki.example.com/platform/dc-migration][документе миграции]], ответственный');
  await expect(page.locator('.toast')).toContainText('Ссылка вставлена');
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page)).toContain('План в документе миграции, ответственный');
});

test('an ordinary paste: not a link in the clipboard; ⌥⇧⌘V puts the text as it is', async ({ page }) => {
  await open(page);
  await select(page, 'План в документе', 'Олег');
  await paste(page, 'Аня');
  await expect.poll(() => disk(page)).toContain('ответственный — Аня.'); // the web view's own paste
  await select(page, 'План в документе', 'документе');
  await page.evaluate(() => ((window as any).__clipText = 'https://x.ru'));
  await page.keyboard.press('Alt+Shift+Meta+v');
  await expect.poll(() => disk(page)).toContain('План в https://x.ru миграции');
});

test('⌃C L: [[id:…][title]], the :ID: added once in a drawer; pasted on a selection it is a link that ⌘-click follows', async ({ page }) => {
  await open(page);
  await page.locator('.nav .row').filter({ has: page.locator('.label', { hasText: /^billing$/ }) }).click();
  await page.locator('.cm-line', { hasText: 'Текст ревью' }).click(); // in its text: the heading it is in
  await page.keyboard.press('Control+c');
  await page.keyboard.press('l');
  await expect.poll(() => page.evaluate(() => (window as any).__clip as string)).toMatch(/^\[\[id:[0-9a-f-]{36}\]\[Ревью архитектуры биллинга\]\]$/);
  const link = await page.evaluate(() => (window as any).__clip as string);
  const id = /id:([^\]]+)/.exec(link)![1];
  await expect.poll(() => disk(page, B)).toContain(`SCHEDULED: <2026-10-20 Вт>\n:PROPERTIES:\n:ID: ${id}\n:END:\nТекст ревью.`);
  await expect(page.locator('.toast')).toContainText('Ссылка на «Ревью архитектуры биллинга» скопирована');
  await expect(page.locator('.toast')).toContainText('выделите текст и нажмите ⌘V');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('l');
  await page.waitForTimeout(200);
  expect((await disk(page, B)).match(/:ID:/g)).toHaveLength(1); // not twice
  // into platform.org on «ревью»
  await page.locator('.nav .row').filter({ has: page.locator('.label', { hasText: /^platform$/ }) }).click();
  await select(page, 'Репликация Postgres', 'ревью');
  await paste(page, link);
  await expect.poll(() => disk(page)).toContain(`см. [[id:${id}][ревью]]`);
  await page.locator('.cm-line', { hasText: 'Репликация Postgres' }).locator('.cm-link, [class*=link]').first().click({ modifiers: ['Meta'] });
  await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('billing');
});

test('«По названию»: [[file:…::*title][title]], the file does not change; above the first heading — the file', async ({ page }) => {
  await open(page, { 'editor:links': 'title' });
  const before = await disk(page);
  await page.locator('.cm-line', { hasText: 'Чек-лист' }).click();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('l');
  await expect.poll(() => page.evaluate(() => (window as any).__clip as string)).toBe('[[file:platform.org::*Чек-лист][Чек-лист]]');
  expect(await disk(page)).toBe(before);
  await page.locator('.cm-line', { hasText: '#+TITLE' }).click();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('l');
  await expect.poll(() => page.evaluate(() => (window as any).__clip as string)).toBe('[[file:platform.org][platform]]');
});

test('«Основные»: «Ссылки на заголовки» — по ID / по названию, the hint follows', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+,');
  const g = page.getByRole('radiogroup', { name: 'Ссылки на заголовки' });
  await expect(g.getByRole('radio', { name: 'По ID' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Ссылка не ломается при переименовании и переносе')).toBeVisible();
  await g.getByRole('radio', { name: 'По названию' }).click();
  await expect(page.getByText('Файл не меняется, но ссылка ломается, если заголовок переименовать')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('editor:links'))).toBe('title');
});
