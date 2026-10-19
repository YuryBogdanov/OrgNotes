import { expect, test, type Page } from '@playwright/test';
import { openApp, settingsSheet } from './helpers';

// ТЗ 44.10 (§12): a heading's status capsule (and its priority, its tags) centred on the middle of its capitals — the
// gaps above and below the same within 1 pt — at every level, in each «Шрифт текста»; the line's height unchanged.

const DOC = ['* TODO Роадмап Q4 :работа:', 'текст', '** NEXT Переезд хранилища', '*** WAIT Бенчмарк', '**** TODO Детали', ''].join('\n');

/** How far the capsule's middle is from the middle of the capitals of the text after it, in pt, per level. */
const offsets = (page: Page) =>
  page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    return [...document.querySelectorAll<HTMLElement>('[data-ui="next"] .cm-line.cm-r-h')].flatMap((line) => {
      const cap = line.querySelector<HTMLElement>('.cm-r-status');
      if (!cap) return [];
      // the first letter of the title after the status
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let node: Text | null = null;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!cap.contains(n) && /[А-ЯA-Z]/.test(n.textContent ?? '')) { node = n as Text; break; }
      if (!node) return [];
      const i = node.textContent!.search(/[А-ЯA-Z]/);
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      const cs = getComputedStyle(node.parentElement!);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = ctx.measureText('H');
      const baseline = r.top + m.fontBoundingBoxAscent;
      const capMid = baseline - m.actualBoundingBoxAscent / 2;
      const b = cap.getBoundingClientRect();
      return [Math.round((b.top + b.height / 2 - capMid) * 10) / 10];
    });
  });

test('the status capsule on the capitals\' middle at every level, in each text font', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('set')) return;
    sessionStorage.setItem('set', '1');
    localStorage.setItem('ui:next', '1');
    localStorage.setItem('editor:rich', '1');
  });
  await openApp(page, { files: { '/mock/a.org': DOC }, ready: false, viewport: { width: 1440, height: 820 } });
  await expect(page.locator('.next[data-ui="next"] .cm-r-status').first()).toBeVisible();
  await page.locator('.cm-line', { hasText: 'текст' }).click(); // the caret off the headings
  await page.evaluate(() => document.fonts.ready);
  // the text font is the theme's (ТЗ 57.5): an own one to change
  await page.evaluate(async () => {
    const { store } = await import('/src/store.svelte.ts' as string);
    await store.copyTheme(store.theme, 'Моя', store.appearance);
  });
  for (const font of ['Cormorant Garamond', 'Системный', 'IBM Plex Mono']) {
    if (font !== 'Cormorant Garamond') {
      await page.keyboard.press('Meta+,');
      await settingsSheet(page).getByRole('tab', { name: 'Оформление', exact: true }).click();
      await settingsSheet(page).getByRole('button', { name: /^Шрифт текста:/ }).click();
      await page.getByRole('listbox', { name: 'Шрифт текста' }).getByRole('option', { name: font }).click();
      await page.keyboard.press('Escape');
      await page.locator('.cm-line', { hasText: 'текст' }).click();
    }
    await expect.poll(async () => (await offsets(page)).length).toBe(4);
    await expect.poll(async () => (await offsets(page)).every((d) => Math.abs(d) <= 1), { message: font }).toBe(true);
  }
});
