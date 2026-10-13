import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// ТЗ 34, part A: a task chosen in the agenda — a click chooses, the context menu, the keys, the palette's group, the
// inspector; a changed row stays where it was (dimmed if it no longer fits) until ⌘R, and ⌘Z takes it back.

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
};
const day = (offset: number, tail = '') => `<${ymd(at(offset))}${tail}>`;
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const short = (offset: number) => `${at(offset).getDate()} ${MONTHS[at(offset).getMonth()]}`;

const WORK = [
  '#+TITLE: Work',
  '#+TODO: TODO NEXT WAIT | DONE CANCELLED',
  '',
  '* Q4 2026',
  '** TODO Подготовить бюджет 2027 :budget:',
  `SCHEDULED: ${day(0, ' 10:00')}`,
  '** TODO Свести расходы',
  `SCHEDULED: ${day(1)} DEADLINE: ${day(5)}`,
  '** WAIT Ответ CTO',
  `SCHEDULED: ${day(0)}`,
  '* Встречи',
  '** Ревью архитектуры',
  `${day(1, ' 11:00')}`,
  '',
].join('\n');

const open = async (page: Page) => {
  await installTauriMock(page, { '/mock/work.org': WORK });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => ((window as any).__clip = t) }, configurable: true });
  });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.keyboard.press('Meta+2');
  await expect(page.locator('.agenda')).toBeVisible();
};
const disk = (page: Page) => page.evaluate(() => (window as any).__disk['/mock/work.org'] as string);
const row = (page: Page, text: string) => page.locator('.agenda .item', { hasText: text }).first();
const menu = (page: Page) => page.locator('.menu').first();
const sub = (page: Page) => page.locator('.menu').nth(1);
const toast = (page: Page) => page.locator('.ltoast');

test('a click chooses (a ring while the list has the focus), the inspector shows it; ↑ ↓, ⎋ and a click on no row', async ({ page }) => {
  await open(page);
  await row(page, 'Подготовить бюджет').click();
  const sel = page.locator('.agenda .item.sel');
  await expect(sel).toContainText('Подготовить бюджет 2027');
  await expect(sel).toHaveCSS('box-shadow', /inset/);
  await expect(page.locator('section.pane')).toHaveCount(1); // nothing opened
  await expect(page.locator('.insp .name')).toHaveText('Подготовить бюджет 2027');
  await expect(page.locator('.insp')).toContainText('Перенести…');
  await page.keyboard.press('ArrowDown');
  await expect(sel).toContainText('Свести расходы'); // over the header «Завтра»: rows only
  await page.keyboard.press('Escape');
  await expect(sel).toHaveCount(0);
  await row(page, 'Ответ CTO').click();
  await page.locator('.agenda .gh').first().click(); // no row: the selection goes
  await expect(sel).toHaveCount(0);
  // the focus elsewhere: grey, no ring
  await row(page, 'Ответ CTO').click();
  await page.locator('.agenda .item.sel').evaluate((el) => (el.closest('.scroll') as HTMLElement).blur());
  await expect(page.locator('.agenda .item.sel')).not.toHaveCSS('box-shadow', /inset/);
  // a double click opens
  await row(page, 'Свести расходы').dblclick();
  await expect(page.locator('section.pane')).toHaveCount(2);
  await expect(page.locator('section.pane').nth(0).locator('.cm-activeLine')).toHaveText('** TODO Свести расходы');
});

test('the menu: its items; «Статус» — capsules, a check, ⇧→; DONE stays dimmed and struck, the toast, ⌘Z, ⌘R', async ({ page }) => {
  await open(page);
  await row(page, 'Подготовить бюджет').click({ button: 'right' });
  await expect(menu(page).locator('button .lb')).toHaveText(['Открыть', 'Открыть здесь', 'Статус', 'Приоритет', 'Запланировать', 'Дедлайн', 'Теги…', 'Перенести в другой файл…', 'Копировать ссылку']);
  await expect(menu(page).getByRole('menuitem', { name: 'Открыть' }).first().locator('.kb')).toHaveText('↩');
  await menu(page).getByRole('menuitem', { name: 'Статус' }).hover();
  await expect(sub(page).locator('.lb')).toHaveText(['TODO', 'NEXT', 'WAIT', 'DONE', 'CANCELLED', 'Без статуса']);
  await expect(sub(page).locator('.capsule')).toHaveCount(5);
  await expect(sub(page).getByRole('menuitem', { name: 'TODO' }).locator('.chk svg')).toHaveCount(1);
  await expect(sub(page).getByRole('menuitem', { name: 'NEXT' }).locator('.kb')).toHaveText('⇧→');
  await sub(page).getByRole('menuitem', { name: 'DONE' }).click();
  await expect.poll(() => disk(page)).toContain('** DONE Подготовить бюджет 2027');
  expect(await disk(page)).toMatch(/CLOSED: \[/);
  // the row stays where it was: DONE, dimmed, struck; the selection on it
  const r = row(page, 'Подготовить бюджет');
  await expect(r).toHaveClass(/stale/);
  await expect(r).toHaveClass(/sel/);
  await expect(r.locator('.kw')).toHaveText('DONE');
  await expect(r.locator('.ttl')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(r).toHaveCSS('opacity', '0.55');
  await expect(toast(page)).toContainText('«Подготовить бюджет 2027» — DONE');
  await expect(toast(page)).toContainText('скроется при обновлении');
  await expect(toast(page).getByRole('button', { name: 'Отменить ⌘Z' })).toBeVisible();
  // ⌘Z: back, not dimmed
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page)).toContain('** TODO Подготовить бюджет 2027');
  await expect(r).not.toHaveClass(/stale/);
  // ⇧→ ⇧→ ⇧→: TODO → NEXT → WAIT → DONE; ⌘R: the done row goes
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => disk(page)).toContain('** NEXT Подготовить бюджет 2027');
  await expect(r).not.toHaveClass(/stale/); // still fits
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => disk(page)).toContain('** DONE Подготовить бюджет 2027');
  await expect(r).toHaveClass(/stale/);
  await page.keyboard.press('Meta+r');
  await expect(page.locator('.agenda .item', { hasText: 'Подготовить бюджет' })).toHaveCount(0);
  await expect(page.locator('.agenda .item.sel')).toHaveCount(0);
});

test('keys: ⇧↑ the priority; ⌥⇧→ the date of the row, the time kept; a deadline row moves its DEADLINE; an event its stamp', async ({ page }) => {
  await open(page);
  await row(page, 'Подготовить бюджет').click();
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(() => disk(page)).toContain('** TODO [#B] Подготовить бюджет 2027');
  await expect(toast(page)).toContainText('— приоритет B');
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(() => disk(page)).toContain('[#A] Подготовить');
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await expect.poll(() => disk(page)).toMatch(new RegExp(`SCHEDULED: <${ymd(at(1))} [А-Яа-я]{2} 10:00>`));
  await expect(toast(page)).toContainText(`перенесено на ${short(1)}`);
  // «Свести расходы» in its deadline row (the last one): ⌥⇧← moves the DEADLINE only
  await page.keyboard.press('Meta+r');
  const dl = page.locator('.agenda .item', { hasText: 'Свести расходы' }).last();
  await expect(dl.locator('.mark')).toContainText('Дедлайн');
  await dl.click();
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  await expect.poll(() => disk(page)).toContain(`DEADLINE: <${ymd(at(4))}`);
  expect(await disk(page)).toContain(`SCHEDULED: <${ymd(at(1))}>`);
  // an event: its stamp, the time kept
  await row(page, 'Ревью архитектуры').click();
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await expect.poll(() => disk(page)).toMatch(new RegExp(`<${ymd(at(2))} [А-Яа-я]{2} 11:00>`));
});

test('«Запланировать ›»: Завтра keeps the time; «Снять дату»; «Дедлайн ›» has no ⌥⇧→', async ({ page }) => {
  await open(page);
  await row(page, 'Подготовить бюджет').click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: 'Запланировать' }).hover();
  await expect(sub(page).locator('button .lb')).toHaveText(['Сегодня', 'Завтра', '+1 неделя', /^Понедельник, \d+ [а-я]{3}$/, 'Выбрать дату…', 'Снять дату']);
  await expect(sub(page).getByRole('menuitem', { name: 'Завтра' }).locator('.kb')).toHaveText('⌥⇧→');
  await sub(page).getByRole('menuitem', { name: 'Завтра' }).click();
  await expect.poll(() => disk(page)).toMatch(new RegExp(`SCHEDULED: <${ymd(at(1))} [А-Яа-я]{2} 10:00>`));
  await row(page, 'Подготовить бюджет').click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: 'Дедлайн' }).hover();
  await expect(sub(page).getByRole('menuitem', { name: 'Завтра' }).locator('.kb')).toHaveCount(0);
  await expect(sub(page).getByRole('menuitem', { name: 'Снять дату' })).toHaveCount(0); // no deadline yet
  await page.keyboard.press('Escape');
  await row(page, 'Подготовить бюджет').click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: 'Запланировать' }).hover();
  await sub(page).getByRole('menuitem', { name: 'Снять дату' }).click();
  await expect.poll(() => disk(page)).not.toContain('10:00');
  await expect(row(page, 'Подготовить бюджет').locator('.mark')).toHaveText('Без даты');
});

test('the palette: «ВЫДЕЛЕННАЯ ЗАДАЧА» with its title first, «ВСЕ КОМАНДЫ» after; «завершить (DONE)» writes through the list', async ({ page }) => {
  await open(page);
  await row(page, 'Ответ CTO').click();
  await page.keyboard.press('Meta+Shift+p');
  const pal = page.getByRole('dialog', { name: 'Командная палитра' });
  await expect(pal.locator('.gh').first()).toHaveText('ВЫДЕЛЕННАЯ ЗАДАЧАОтвет CTO');
  await expect(pal.locator('.gh').nth(1)).toHaveText('ВСЕ КОМАНДЫ');
  await expect(pal.getByRole('option').first()).toHaveAccessibleName(/Задача: завершить \(DONE\)/);
  await expect(pal.getByRole('option', { name: /Задача: запланировать…/ }).locator('.key')).toHaveText('⌃C S');
  await page.keyboard.type('зав');
  await expect(pal.getByRole('option').first()).toHaveAccessibleName(/Задача: завершить/);
  await page.keyboard.press('Enter');
  await expect.poll(() => disk(page)).toContain('** DONE Ответ CTO');
  await expect(toast(page)).toContainText('«Ответ CTO» — DONE');
  // the focus is back in the list: ⌘Z there
  await page.keyboard.press('Meta+z');
  await expect.poll(() => disk(page)).toContain('** WAIT Ответ CTO');
});

test('⌃C Q: the tags field — capsules with ×, the folder\'s tags offered, ↩ applies; «Копировать ссылку» adds an :ID:', async ({ page }) => {
  await open(page);
  await row(page, 'Свести расходы').click();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('q');
  const pop = page.getByRole('dialog', { name: 'Теги задачи' });
  await expect(pop).toBeVisible();
  await page.keyboard.type('bud');
  await expect(pop.getByRole('option')).toHaveText(['budget']);
  await page.keyboard.press('Enter'); // takes the offered one
  await page.keyboard.type('q4');
  await page.keyboard.press('Enter');
  await expect(pop.locator('.chip')).toHaveText(['budget×', 'q4×']);
  await page.keyboard.press('Enter'); // an empty field: apply
  await expect.poll(() => disk(page)).toContain('** TODO Свести расходы :budget:q4:');
  await expect(pop).toHaveCount(0);
  // copy a link: an :ID: is added, the link has it
  await row(page, 'Свести расходы').click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: 'Копировать ссылку' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__clip as string)).toMatch(/^\[\[id:[0-9a-f-]+\]\[Свести расходы\]\]$/);
  const id = /\[\[id:([^\]]+)\]/.exec(await page.evaluate(() => (window as any).__clip as string))![1];
  expect(await disk(page)).toContain(`:ID: ${id}`);
});

test('a change made elsewhere (typed in the editor) refreshes the list: the done row goes', async ({ page }) => {
  await open(page);
  await row(page, 'Ответ CTO').click();
  await page.keyboard.press('Shift+ArrowRight'); // WAIT → DONE
  await expect(row(page, 'Ответ CTO')).toHaveClass(/stale/);
  await row(page, 'Свести расходы').dblclick(); // the file in the other pane, the focus in it
  await expect(page.locator('section.pane')).toHaveCount(2);
  await page.keyboard.press('End');
  await page.keyboard.type(' срочно');
  await expect(page.locator('.agenda .item', { hasText: 'Ответ CTO' })).toHaveCount(0);
  await expect(row(page, 'Свести расходы срочно')).toBeVisible();
});
