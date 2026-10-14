import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// ТЗ 35, part B: the palette «Ссылка на» (⌃C ⌃L, ⌥⌘K), the editor's context menu, the tooltip over a link.

const P = '/mock/platform.org';
const B = '/mock/billing.org';
const PLATFORM = [
  '#+TITLE: Платформа',
  '',
  '* TODO [#A] Переезд в новый ДЦ :infra:',
  'Переносим сервисы. План в документе миграции, ответственный — Олег.',
  '** Чек-лист [2/5]',
  '- [ ] Репликация Postgres — см. ревью',
  '- [ ] Документация: [[https://wiki.example.com/dc][вики]] и [[id:nope][старый план]]',
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

const pal = (page: Page) => page.getByRole('dialog', { name: 'Командная палитра' });
const menu = (page: Page) => page.locator('.menu').first();
const chord = async (page: Page, second: string) => {
  await page.keyboard.press('Control+c');
  await page.keyboard.press(second);
};

test('⌃C ⌃L on a selection: «Ссылка на», the selected text is the label; ↩ puts [[id:…][selection]], the :ID: in the heading', async ({ page }) => {
  await open(page);
  await select(page, 'Репликация Postgres', 'ревью');
  await chord(page, 'Control+l');
  await expect(pal(page).locator('.tok')).toHaveText('Ссылка на');
  await expect(pal(page)).toContainText('Подпись ссылки — выделенный текст: «ревью»');
  await page.keyboard.type('ревью арх');
  await expect(pal(page).locator('.gh').first()).toHaveText('ЗАГОЛОВКИ');
  await expect(pal(page).getByRole('option').first()).toContainText('Ревью архитектуры биллинга');
  await expect(pal(page).locator('.foot')).toContainText('⌘↩подпись — название заголовка');
  await page.keyboard.press('Enter');
  await expect.poll(() => disk(page)).toMatch(/см\. \[\[id:[0-9a-f-]{36}\]\[ревью\]\]/);
  const id = /\[\[id:([0-9a-f-]{36})\]\[ревью\]\]/.exec(await disk(page))![1];
  await expect.poll(() => disk(page, B)).toContain(`:ID: ${id}`);
});

test('⌘↩: the heading\'s title is the label; no selection: the title; an address typed: [[address]]', async ({ page }) => {
  await open(page);
  await select(page, 'Репликация Postgres', 'ревью');
  await chord(page, 'Control+l');
  await page.keyboard.type('чек-лист');
  await page.keyboard.press('Meta+Enter');
  await expect.poll(() => disk(page)).toMatch(/см\. \[\[id:[0-9a-f-]+\]\[Чек-лист\]\]/);
  await page.locator('.cm-line', { hasText: '#+TITLE' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  await chord(page, 'Control+l');
  await page.keyboard.type('https://x.ru/a');
  await expect(pal(page).getByRole('option', { name: /Вставить адрес https:\/\/x\.ru\/a/ })).toBeVisible();
  await page.keyboard.press('ArrowDown'); // the heading rows are none: the address is the only one, chosen
  await page.keyboard.press('Enter');
  await expect.poll(() => disk(page)).toContain('#+TITLE: Платформа [[https://x.ru/a]]');
});

test('the menu of a selection: cut, copy, paste, «Сделать ссылкой из буфера» with the address, the others; it makes the link', async ({ page }) => {
  await open(page);
  await page.evaluate(() => ((window as any).__clipText = 'https://wiki.example.com/platform/dc-migration'));
  await select(page, 'План в документе', 'документе миграции');
  // a right click inside the selection keeps it
  const box = await page.evaluate(() => { const r = getSelection()!.getRangeAt(0).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(box.x, box.y, { button: 'right' });
  await expect(menu(page).locator('button .lb')).toHaveText(['Вырезать', 'Копировать', 'Вставить', 'Сделать ссылкой из буфераhttps://wiki.example.com/platform/dc-migration', 'Ссылка на заголовок…', 'Вставить как текст', 'Копировать ссылку на заголовок«Переезд в новый ДЦ»']);
  await expect(menu(page).getByRole('menuitem', { name: /Ссылка на заголовок/ }).locator('.kb')).toHaveText('⌃C ⌃L');
  await menu(page).getByRole('menuitem', { name: /Сделать ссылкой из буфера/ }).click();
  await expect.poll(() => disk(page)).toContain('План в [[https://wiki.example.com/platform/dc-migration][документе миграции]]');
});

test('the menu on a link: «Открыть», «Изменить ссылку…», «Копировать адрес», «Убрать ссылку»; no selection: paste and links', async ({ page }) => {
  await open(page);
  const line = page.locator('.cm-line', { hasText: 'Документация' });
  await line.locator('text=вики').click({ button: 'right' });
  await expect(menu(page).locator('button .lb')).toHaveText(['Открыть ссылку', 'Изменить ссылку…', 'Копировать адрес', 'Убрать ссылку', 'Вставить', 'Вставить ссылку на заголовок…', 'Копировать ссылку на заголовок«Чек-лист»']);
  await expect(menu(page).getByRole('menuitem', { name: 'Изменить ссылку…' }).locator('.kb')).toHaveText('⌥⌘K');
  await menu(page).getByRole('menuitem', { name: 'Копировать адрес' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__clip as string)).toBe('https://wiki.example.com/dc');
  await line.locator('text=вики').click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: 'Убрать ссылку' }).click();
  await expect.poll(() => disk(page)).toContain('- [ ] Документация: вики и [[id:nope]');
});

test('⌥⌘K on a link: «Ссылка на», its label stays, its target changes', async ({ page }) => {
  await open(page);
  await page.locator('.cm-line', { hasText: 'Документация' }).locator('text=вики').click();
  await page.keyboard.press('Alt+Meta+k');
  await expect(pal(page)).toContainText('Подпись остаётся: «вики»');
  await page.keyboard.type('ревью арх');
  await page.keyboard.press('Enter');
  await expect.poll(() => disk(page)).toMatch(/Документация: \[\[id:[0-9a-f-]{36}\]\[вики\]\]/);
});

test('the tooltip over a link: the address or «file › heading», «Заголовок не найден» in red, how to open it', async ({ page }) => {
  await open(page);
  const line = page.locator('.cm-line', { hasText: 'Документация' });
  await line.locator('text=вики').hover();
  const tip = page.locator('.cm-linktip');
  await expect(tip.locator('.lt-t')).toHaveText('https://wiki.example.com/dc');
  await expect(tip.locator('.lt-h')).toHaveText('⌘-клик или ⌘↩ — открыть · ⌥⌘K — изменить');
  await page.mouse.move(5, 5);
  await line.locator('text=старый план').hover();
  await expect(page.locator('.cm-linktip .lt-t')).toHaveText('Заголовок не найден');
  await expect(page.locator('.cm-linktip .lt-miss')).toHaveCount(1);
});
