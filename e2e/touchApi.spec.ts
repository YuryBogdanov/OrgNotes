import { expect, test, type Page } from '@playwright/test';
import { openApp, diskFile as disk } from './helpers';

// ТЗ 40.2: the touches in the API (`touched`, `lastNote`, `markReviewed`, `Tx.addNote`, `heading.touched`), a tag
// renamed in every file is not a touch, the agenda's condition «Касание».

const MIDTERM = '/mock/Midterm.org';
const TEXT = ['* TODO Миграция биллинга :work:', 'Описание', '* TODO Найм в команду :work:', 'Вакансия', ''].join('\n');
const FILE_TIME = new Date(2026, 8, 1, 9, 0).getTime(); // long ago: both approximate, 45 days and more

async function open(page: Page, files: Record<string, string> = { [MIDTERM]: TEXT }) {
  await page.addInitScript((m) => ((window as any).__mtimeInit = m), { [MIDTERM]: FILE_TIME });
  await openApp(page, { files });
  await expect.poll(() => page.evaluate(async () => (await import('/src/touchIndex.svelte.ts' as string)).touches.ready)).toBe(true);
}
/** A ctx of «Привет» with these rights, as a plugin gets it; the result of `fn` over it. */
const withCtx = <T,>(page: Page, rights: string[], fn: string) =>
  page.evaluate(
    async ([rights, fn]) => {
      const { plugins } = await import('/src/api/host.svelte.ts' as string);
      const ctx = (plugins as any).ctxOf({ ...plugins.manifest('hello'), permissions: rights, net: [] });
      return await new Function('ctx', `return (async () => { ${fn} })()`)(ctx);
    },
    [rights, fn] as const,
  ) as Promise<T>;
const REF = "{ path: 'Midterm.org', line: 0, title: 'Миграция биллинга' }";

test('index.touched: approximate at first; Tx.addNote writes a note of Org, lastNote reads it, the heading is touched', async ({ page }) => {
  await open(page);
  expect(await withCtx(page, ['index.read'], `const t = await ctx.index.touched(${REF}); return { approx: t.approx, at: +t.at };`)).toEqual({ approx: true, at: FILE_TIME });
  const r = await withCtx<string>(page, ['index.read', 'files.edit'], `return ctx.edit.transaction('Статус', (tx) => tx.addNote(${REF}, 'бизнес ответил: стартуем после 4.2'));`);
  expect(r).toBe('ok');
  expect(await disk(page, MIDTERM)).toMatch(/^\* TODO Миграция биллинга :work:\n:LOGBOOK:\n- Note taken on \[\d{4}-\d{2}-\d{2} [А-Яа-я]{2} \d{2}:\d{2}\] \\\\\n {2}бизнес ответил: стартуем после 4\.2\n:END:\nОписание/);
  expect(await withCtx(page, ['index.read'], `return (await ctx.index.lastNote(${REF})).text;`)).toBe('бизнес ответил: стартуем после 4.2');
  await expect.poll(() => withCtx(page, ['index.read'], `return (await ctx.index.touched(${REF})).approx;`)).toBe(false);
  // the other heading: not touched
  expect(await withCtx(page, ['index.read'], `return (await ctx.index.heading({ path: 'Midterm.org', line: 4, title: 'Найм в команду' })).touched.approx;`)).toBe(true);
});

test('index.markReviewed: a touch without a change of the file, with the right only; heading.touched is heard', async ({ page }) => {
  await open(page);
  const ref = "{ path: 'Midterm.org', line: 2, title: 'Найм в команду' }";
  expect(await withCtx(page, ['index.read'], `try { await ctx.index.markReviewed(${ref}); return 'done'; } catch (e) { return e.message; }`)).toBe('нужно право index.touch');
  const heard = withCtx<{ title: string; at: number }>(page, ['index.read', 'index.touch'], `
    return await new Promise((ok) => {
      ctx.events.on('heading.touched', (p) => ok({ title: p.ref.title, at: +p.at }));
      ctx.index.markReviewed(${ref});
    });`);
  const before = Date.now();
  expect((await heard).title).toBe('Найм в команду');
  expect(await withCtx(page, ['index.read'], `const t = await ctx.index.touched(${ref}); return t.approx;`)).toBe(false);
  expect(await disk(page, MIDTERM)).toBe(TEXT); // the file is as it was
  expect((await heard).at).toBeGreaterThan(before - 10_000);
});

test('a tag renamed in every file is not a touch; its ⌘Z neither', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const { tagsState } = await import('/src/tagsState.svelte.ts' as string);
    await tagsState.rename('work', 'job');
  });
  await expect.poll(() => disk(page, MIDTERM)).toContain(':job:');
  await page.waitForTimeout(300);
  expect(await withCtx(page, ['index.read'], `return (await ctx.index.touched(${REF})).approx;`)).toBe(true);
  await page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.undoLast());
  await expect.poll(() => disk(page, MIDTERM)).toContain(':work:');
  await page.waitForTimeout(300);
  expect(await withCtx(page, ['index.read'], `return (await ctx.index.touched(${REF})).approx;`)).toBe(true);
  // a plugin's own mass edit says so too
  await withCtx(page, ['index.read', 'files.edit'], `return ctx.edit.transaction('Тег', (tx) => tx.setTags(${REF}, ['work']), { touch: false });`);
  await page.waitForTimeout(300);
  expect(await withCtx(page, ['index.read'], `return (await ctx.index.touched(${REF})).approx;`)).toBe(true);
});

test('the agenda: «Касание давнее чем 30 дней» lists what was not touched; the builder asks for the days', async ({ page }) => {
  await open(page);
  // touch one task now: an edit here
  await page.locator('.cm-line', { hasText: 'Вакансия' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' открыта');
  await expect.poll(() => withCtx(page, ['index.read'], "return (await ctx.index.touched({ path: 'Midterm.org', line: 2, title: 'Найм в команду' })).approx;")).toBe(false);
  const titles = await withCtx<string[]>(page, ['index.read'], `return (await ctx.index.query({ conds: [{ field: 'touched', op: 'older', days: 30 }] })).map((h) => h.title);`).catch(() => null);
  expect(titles).toEqual(['Миграция биллинга']);
  // the builder: the field «Касание», its days in a number field
  await page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Агенда' }).click();
  await page.getByRole('navigation', { name: 'Список агенд' }).getByRole('button', { name: 'Новая агенда' }).click();
  const b = page.getByRole('dialog', { name: 'Конструктор агенды' });
  await b.getByRole('button', { name: '+ Условие' }).first().click();
  await page.locator('.pop .opt', { hasText: 'Касание' }).click();
  const days = b.getByRole('spinbutton', { name: 'Дней' });
  await expect(days).toBeFocused();
  await page.keyboard.type('30');
  await expect(b.getByLabel('Предпросмотр')).toContainText('Миграция биллинга');
  await expect(b.getByLabel('Предпросмотр')).not.toContainText('Найм в команду');
});
