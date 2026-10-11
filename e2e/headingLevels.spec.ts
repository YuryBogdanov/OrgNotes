import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { WORK } from './levelsFixture';

// ТЗ «Отображение уровней заголовков (одна звёздочка, отступы)».
const FILE = '/mock/work.org';
const line = (page: Page, text: string) => page.locator('.cm-line', { hasText: text }).first();
const disk = (page: Page) => page.evaluate((p) => (window as any).__disk[p] as string, FILE);
const cursor = async (page: Page) => {
  const m = /Стр\. (\d+), кол\. (\d+)/.exec(await page.locator('section.pane.active .status').innerText())!;
  return { line: +m[1], col: +m[2] };
};
/** Left edge (px) of the first occurrence of `sub` in a line of the editor, as drawn. */
const leftOf = (page: Page, lineText: string, sub: string) =>
  page.evaluate(
    ([lineText, sub]) => {
      const el = [...document.querySelectorAll('.cm-line')].find((l) => l.textContent!.includes(lineText))!;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = n.textContent!.indexOf(sub);
        if (i >= 0) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + 1);
          return r.getBoundingClientRect().left;
        }
      }
      return NaN;
    },
    [lineText, sub],
  );
const charW = (page: Page) =>
  page.evaluate(() => {
    const s = document.createElement('span');
    s.textContent = 'x'.repeat(100);
    document.querySelector('.cm-content')!.appendChild(s);
    const w = s.getBoundingClientRect().width / 100;
    s.remove();
    return w;
  });
/** Equal to the pixel: positions are fractional, the rounding of a sum may differ by one. */
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
/** The text in the file (autosaved shortly after an edit). */
const fileLine = (page: Page, sub: string) => expect.poll(async () => (await disk(page)).split('\n').find((l) => l.includes(sub)));
async function open(page: Page, text = WORK, levels?: object) {
  await page.setViewportSize({ width: 1440, height: 760 });
  if (levels) await page.addInitScript((l) => localStorage.setItem('editor:levels', JSON.stringify(l)), levels);
  await installTauriMock(page, { [FILE]: text });
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
}

test.describe('one star per level and the text under it', () => {
  test('a heading shows one star moved by (N−1) × step; its text lines up with the heading text; before the first heading nothing moves', async ({ page }) => {
    await open(page);
    // the file in the editor still has all its stars: only the look changed
    // one star is seen; the line's text in the page is still the file's, all four
    expect(await line(page, 'Согласовать с финансами').innerText()).toBe('* TODO Согласовать с финансами');
    await expect(line(page, 'Согласовать с финансами')).toHaveText('**** TODO Согласовать с финансами');
    expect(await page.evaluate(() => document.querySelectorAll('.cm-org-marker').length)).toBe(8);
    const w = await charW(page);
    const star = (t: string) => page.evaluate((t) => [...document.querySelectorAll('.cm-line')].find((l) => l.textContent!.includes(t))!.querySelector('.cm-org-marker')!.getBoundingClientRect().left, t);
    const s1 = await star('Q4 2026');
    for (const [t, lvl] of [['Подготовить бюджет', 2], ['Собрать заявки', 3], ['Согласовать с финансами', 4], ['Тимлиды', 1]] as const) {
      near((await star(t)) - s1, (lvl - 1) * 2 * w);
    }
    // text under a heading starts where the heading's text does
    near(await leftOf(page, 'Свести заявки пяти', 'С'), await leftOf(page, 'Подготовить бюджет', 'T'));
    near(await leftOf(page, 'Нужны данные', 'Н'), await leftOf(page, 'Согласовать с финансами', 'T'));
    near(await leftOf(page, 'Заметки к 1:1', 'З'), await leftOf(page, 'Тимлиды', 'Т'));
    // the file's own spaces are drawn on top of the indent
    near(await leftOf(page, 'CLOSED:', 'C'), (await leftOf(page, 'Собрать заявки', 'D')) + 4 * w);
    // before the first heading: as before
    near(await leftOf(page, '#+TITLE', '#'), s1);
    // line numbers do not move
    const nums = await page.locator('.cm-lineNumbers .cm-gutterElement').evaluateAll((els) => [...new Set(els.slice(1).map((e) => Math.round(e.getBoundingClientRect().right)))]);
    expect(nums).toHaveLength(1);
  });

  test('long lines wrap under their text: a heading under its text (not its star), body text with its indent', async ({ page }) => {
    const long = 'очень длинный заголовок '.repeat(12);
    await open(page, `* Верх\n*** TODO ${long}\n${'длинный текст под заголовком '.repeat(12)}\n`);
    const geo = await page.evaluate(() => {
      const out: { first: number; next: number }[] = [];
      for (const l of [...document.querySelectorAll('.cm-line')].slice(1, 3)) {
        const r = document.createRange();
        r.selectNodeContents(l);
        const rects = [...r.getClientRects()].filter((x) => x.width > 0);
        const lefts = [...new Set(rects.map((x) => Math.round(x.left)))].sort((a, b) => a - b);
        const tops = [...new Set(rects.map((x) => Math.round(x.top)))];
        out.push({ first: tops.length, next: lefts[0] });
      }
      return out;
    });
    expect(geo[0].first).toBeGreaterThan(1); // it does wrap
    const title = await leftOf(page, 'TODO очень', 'T');
    const wrapped = await page.evaluate(() => {
      const l = [...document.querySelectorAll('.cm-line')][1];
      const r = document.createRange();
      r.selectNodeContents(l);
      const rects = [...r.getClientRects()].filter((x) => x.width > 0);
      const top0 = Math.min(...rects.map((x) => x.top));
      return Math.min(...rects.filter((x) => x.top > top0 + 5).map((x) => x.left));
    });
    near(wrapped, title);
    const body = await page.evaluate(() => {
      const l = [...document.querySelectorAll('.cm-line')][2];
      const r = document.createRange();
      r.selectNodeContents(l);
      const rects = [...r.getClientRects()].filter((x) => x.width > 0);
      const top0 = Math.min(...rects.map((x) => x.top));
      return { first: Math.min(...rects.filter((x) => x.top <= top0 + 5).map((x) => x.left)), next: Math.min(...rects.filter((x) => x.top > top0 + 5).map((x) => x.left)) };
    });
    near(body.next, body.first);
    near(body.first, title);
  });

  test('a deep tree stops at 16 characters; `*bold*` and stars inside #+BEGIN_SRC are not headings', async ({ page }) => {
    const deep = Array.from({ length: 12 }, (_, i) => `${'*'.repeat(i + 1)} Уровень ${i + 1}\nтекст ${i + 1}`).join('\n');
    await open(page, `${deep}\n*жирный* не заголовок\n#+BEGIN_SRC org\n** внутри блока\n#+END_SRC\n`);
    const w = await charW(page);
    const base = await leftOf(page, 'Уровень 1', 'У');
    for (const n of [9, 10, 12]) near((await leftOf(page, `текст ${n}`, 'т')) - base, 14 * w); // 16 − «* »
    near((await leftOf(page, 'текст 8', 'т')) - base, 14 * w); // 7 × 2 = 14: the last level that still moves
    near((await leftOf(page, 'текст 7', 'т')) - base, 12 * w);
    await expect(line(page, 'внутри блока')).toHaveText('** внутри блока'); // drawn as it is
    expect(await page.evaluate(() => [...document.querySelectorAll('.cm-line')].find((l) => l.textContent!.includes('внутри блока'))!.querySelector('.cm-org-marker'))).toBeNull();
    await expect(line(page, 'не заголовок')).toHaveText('*жирный* не заголовок');
  });
});

test.describe('the real text', () => {
  test('opened and saved without edits the file is the same byte for byte; a copy has all the stars', async ({ page }) => {
    await open(page);
    await line(page, 'Согласовать с финансами').click();
    await page.keyboard.press('Meta+s');
    expect(await disk(page)).toBe(WORK);
    // select the whole heading line from its start and copy
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('Shift+Home');
    const copied = await page.evaluate(() => {
      let got = '';
      window.addEventListener('copy', (e) => (got = (e as ClipboardEvent).clipboardData!.getData('text/plain')), { once: true });
      document.execCommand('copy');
      return got;
    });
    expect(copied).toBe('**** TODO Согласовать с финансами');
  });

  test('the caret never stands among the hidden stars: ← from the heading text goes before the star, then to the line above', async ({ page }) => {
    await open(page);
    await line(page, 'Собрать заявки').click();
    await page.keyboard.press('Home');
    const cols: number[] = [];
    // from the start of the heading text («DONE» is column 5 of «*** DONE …»)
    await page.keyboard.press('End');
    for (let i = 0; i < 40; i++) {
      const c = await cursor(page);
      if (c.line !== 7) break;
      cols.push(c.col);
      await page.keyboard.press('ArrowLeft');
    }
    expect(cols).not.toContain(2);
    expect(cols).not.toContain(3);
    expect(cols.slice(-3)).toEqual([5, 4, 1]); // text start, after the star, before the star
    expect((await cursor(page)).line).toBe(6); // then the end of the line above
    // a click left of the star puts the caret before it
    const box = (await line(page, 'Собрать заявки').boundingBox())!;
    await page.mouse.click(box.x + 4, box.y + box.height / 2);
    expect(await cursor(page)).toEqual({ line: 7, col: 1 });
  });

  test('Backspace at the start of the heading text: one level up; on level 1 the line becomes text; undo brings it back', async ({ page }) => {
    await open(page);
    const toText = async (t: string) => {
      await line(page, t).click();
      await page.keyboard.press('Home'); // before the star
      await page.keyboard.press('ArrowRight'); // after it
      await page.keyboard.press('ArrowRight'); // the start of the text
    };
    await toText('Собрать заявки');
    expect(await cursor(page)).toEqual({ line: 7, col: 5 });
    await page.keyboard.press('Backspace');
    await fileLine(page, 'Собрать заявки').toBe('** DONE Собрать заявки от тимлидов');
    expect(await cursor(page)).toEqual({ line: 7, col: 4 }); // still at the start of the text
    await page.keyboard.press('Backspace');
    await fileLine(page, 'Собрать заявки').toBe('* DONE Собрать заявки от тимлидов');
    await page.keyboard.press('Backspace');
    await fileLine(page, 'Собрать заявки').toBe('DONE Собрать заявки от тимлидов'); // plain text now
    expect(await page.evaluate(() => [...document.querySelectorAll('.cm-line')].find((l) => l.textContent!.includes('Собрать заявки'))!.querySelector('.cm-org-marker'))).toBeNull();
    await page.keyboard.press('Meta+z');
    await page.keyboard.press('Meta+z');
    await page.keyboard.press('Meta+z');
    await fileLine(page, 'Собрать заявки').toBe('*** DONE Собрать заявки от тимлидов');
  });

  test('typing stars at a line start makes it a heading at once; Alt+arrows change the level and the indent follows', async ({ page }) => {
    await open(page);
    await line(page, 'Нужны данные').click();
    await page.keyboard.press('Home');
    await page.keyboard.type('** ');
    await fileLine(page, 'Нужны данные').toBe('** Нужны данные за III квартал.');
    expect(await line(page, 'Нужны данные').innerText()).toBe('* Нужны данные за III квартал.'); // drawn with one star
    const w = await charW(page);
    const s1 = await leftOf(page, 'Q4 2026', 'Q');
    near((await leftOf(page, 'Нужны данные', 'Н')) - s1, 2 * w); // level 2: as «Подготовить…»
    await page.keyboard.press('Alt+ArrowRight');
    await fileLine(page, 'Нужны данные').toBe('*** Нужны данные за III квартал.');
    near((await leftOf(page, 'Нужны данные', 'Н')) - s1, 4 * w);
  });
});

test.describe('settings', () => {
  test('off: the file as it is; text only: moved by the step plus its own stars; the step 1–4; switching is not an edit', async ({ page }) => {
    await open(page);
    const set = (l: object) =>
      page.evaluate((l) => {
        localStorage.setItem('editor:levels', JSON.stringify(l));
        window.dispatchEvent(new StorageEvent('storage', { key: 'editor:levels', newValue: JSON.stringify(l) })); // as from the settings window
      }, l);
    const w = await charW(page);
    const s1 = await leftOf(page, 'Q4 2026', '*');
    await set({ oneStar: false, indent: false, step: 2 });
    await expect(page.locator('.cm-org-marker')).toHaveCount(0);
    near(await leftOf(page, 'Согласовать с финансами', '*'), s1); // all stars, at the edge
    near(await leftOf(page, 'Нужны данные', 'Н'), s1);
    await set({ oneStar: false, indent: true, step: 2 });
    near((await leftOf(page, 'Нужны данные', 'Н')) - s1, (3 * 2 + 5) * w); // (4−1)×2 + «**** »
    await set({ oneStar: true, indent: true, step: 4 });
    near((await leftOf(page, 'Нужны данные', 'Н')) - s1, 14 * w); // 3×4 + 2
    await expect(page.locator('section.pane.active .status')).toContainText('Сохранено'); // no edit, nothing to save
    expect(await disk(page)).toBe(WORK);
  });

  test('«Основные» in the settings window: the switches and the stepper reach the editor at once', async ({ page, context }) => {
    await open(page);
    const settings = await context.newPage();
    await installTauriMock(settings, { [FILE]: WORK });
    await settings.goto('/#settings');
    await settings.getByRole('tab', { name: 'Основные' }).click();
    await expect(settings.getByRole('switch', { name: 'Одна звёздочка на уровень' })).toHaveAttribute('aria-checked', 'true');
    await expect(settings.getByRole('switch', { name: 'Сдвигать текст по уровню' })).toHaveAttribute('aria-checked', 'true');
    await expect(settings.getByRole('group', { name: 'Шаг отступа' })).toContainText('2 симв.');
    await settings.getByRole('switch', { name: 'Одна звёздочка на уровень' }).click();
    await expect(page.locator('.cm-org-marker')).toHaveCount(0);
    await settings.getByRole('switch', { name: 'Одна звёздочка на уровень' }).click();
    await expect(page.locator('.cm-org-marker')).toHaveCount(8);
    await settings.getByRole('button', { name: 'Больше' }).click();
    await settings.getByRole('button', { name: 'Больше' }).click();
    await expect(settings.getByRole('button', { name: 'Больше' })).toBeDisabled(); // 4 is the most
    await expect(settings.getByRole('group', { name: 'Шаг отступа' })).toContainText('4 симв.');
    const w = await charW(page);
    await expect.poll(async () => Math.abs((await leftOf(page, 'Нужны данные', 'Н')) - (await leftOf(page, 'Q4 2026', '*')) - 14 * w)).toBeLessThanOrEqual(1);
  });
});

test('a file of 50 000 lines opens and takes typing without delay, as without the structural view', async ({ page }) => {
  const parts: string[] = [];
  for (let i = 0; i < 10000; i++) parts.push(`${'*'.repeat((i % 4) + 1)} Заголовок ${i}`, 'текст [[file:a.org][ссылка]]', '   SCHEDULED: <2026-10-12 Пн>', '- пункт', '');
  await page.setViewportSize({ width: 1440, height: 760 });
  await installTauriMock(page, { [FILE]: parts.join('\n') });
  const t0 = Date.now();
  await page.goto('/');
  await expect(page.locator('.cm-org-marker').first()).toBeVisible();
  expect(Date.now() - t0).toBeLessThan(3000); // was ~18 s: links were found by parsing the whole file
  await line(page, 'Заголовок 0').click();
  await page.keyboard.press('End');
  const t1 = Date.now();
  await page.keyboard.type('xyz');
  await expect(line(page, 'Заголовок 0xyz')).toBeVisible();
  expect(Date.now() - t1).toBeLessThan(1000);
  await expect(page.locator('.cm-link').first()).toHaveText('ссылка'); // links are still found
});

test('a long file scrolls past its end: the last line can go up to the top, and the file gets no new lines', async ({ page }) => {
  const text = Array.from({ length: 120 }, (_, i) => `строка ${i + 1}`).join('\n') + '\n';
  await open(page, text);
  const scroller = page.locator('section.pane.active .cm-scroller');
  await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const top = (await scroller.boundingBox())!.y;
  const last = (await page.locator('.cm-line', { hasText: /^строка 120$/ }).boundingBox())!.y;
  expect(last - top).toBeLessThan(60); // at the top of the editor, not at its bottom
  await page.locator('.cm-line', { hasText: /^строка 120$/ }).click();
  await page.keyboard.press('Meta+s');
  expect(await disk(page)).toBe(text);
  expect(await page.locator('.cm-line').count()).toBeLessThanOrEqual(122);
});
