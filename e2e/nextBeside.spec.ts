import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 56.1: the file beside a list — the list and the file side by side (46 % by default, dragged 35–65 %, kept), the
// head (the file, the headings' path, «следует за выбором», «Открыть вкладкой ⌘↩», ×), «Исходник» with the line numbers
// and the subtree marked; the agenda's «Горизонт» hidden; under 1000 pt the file over the list; «Открыть вкладкой».

const F: Record<string, string> = {
  '/mock/Midterm.org': '#+TITLE: Midterm\n* Платформа\n** TODO Роадмап Q4\nSCHEDULED: <2026-10-16 Fri>\nСобрать роадмап платформы.\n** NEXT Переезд\n* Наём\n',
};
async function open(page: Page, width = 1440) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: F, ready: false, now: new Date(2026, 9, 16, 10), viewport: { width, height: 860 } });
  await expect(page.locator('.cm-content')).toBeVisible();
}
/** The agenda's tab with the file of «Роадмап Q4» (line 2) beside it. */
async function beside(page: Page) {
  await page.evaluate(async () => {
    const { store } = await import('/src/store.svelte.ts' as string);
    store.showAgendaHere();
  });
  await expect(page.locator('.hz')).toBeVisible();
  await page.evaluate(async () => {
    const { store } = await import('/src/store.svelte.ts' as string);
    const { openBeside } = await import('/src/beside.svelte.ts' as string);
    openBeside(store.tab.id, { path: 'Midterm.org', line: 2 });
  });
}
const side = (page: Page) => page.getByRole('region', { name: 'Файл сбоку' });

test('the list and the file: the head, «Исходник» with numbers, the subtree marked; «Горизонт» hidden; the share kept', async ({ page }) => {
  await open(page);
  await beside(page);
  await expect(side(page)).toBeVisible();
  await expect(side(page).locator('header')).toContainText('Midterm');
  await expect(side(page).locator('header')).toContainText('› Платформа › Роадмап Q4');
  await expect(side(page).getByRole('button', { name: 'следует за выбором' })).toBeVisible();
  await expect(side(page).locator('.cm-gutters .cm-lineNumbers')).toBeVisible(); // «Исходник»: the numbers
  await expect(side(page).locator('.cm-sub')).toHaveCount(3); // the heading and its two lines
  await expect(side(page).locator('.cm-sub.top')).toContainText('Роадмап Q4');
  await expect(page.locator('.hz')).toBeHidden(); // «Горизонт»
  // 46 % by default; dragged, kept
  const list = page.locator('.split.open > .list');
  const total = (await page.locator('.split.open').boundingBox())!;
  expect(Math.round(((await list.boundingBox())!.width / total.width) * 100)).toBe(46);
  const grip = (await page.locator('.split .div').boundingBox())!;
  await page.mouse.move(grip.x + 4, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(total.x + total.width * 0.9, grip.y + grip.height / 2, { steps: 4 });
  await page.mouse.up();
  expect(Math.round(((await list.boundingBox())!.width / total.width) * 100)).toBe(65);
  expect(await page.evaluate(() => localStorage.getItem('next:besideShare'))).toBe('0.65');
  // ×
  await side(page).getByRole('button', { name: 'Закрыть файл сбоку' }).click();
  await expect(side(page)).toHaveCount(0);
  await expect(page.locator('.hz')).toBeVisible();
});

test('«Открыть вкладкой»: the file as a tab at its line, beside closed; a narrow area — the file over the list', async ({ page }) => {
  await open(page, 1100);
  await beside(page);
  await expect(page.locator('.split.over')).toBeVisible(); // the area under 1000 (the sidebar takes its part)
  const sb = (await side(page).boundingBox())!;
  const area = (await page.locator('.split').boundingBox())!;
  expect(Math.round((sb.width / area.width) * 100)).toBe(60);
  await side(page).getByRole('button', { name: /Открыть вкладкой/ }).click();
  await expect(side(page)).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Midterm/ })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.tab?.cursor?.line)).toBe(3);
});

// ТЗ 56.2: opening and closing from the lists, the focus, the keys
const W = {
  '/mock/work.org': '* NEXT План переезда хранилища\nSCHEDULED: <2026-10-16 Fri>\nПеревезти бэкапы.\n* TODO Синк платформы\nSCHEDULED: <2026-10-16 Fri>\n',
};
async function agenda(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: W, local: { 'plugins:enabled': JSON.stringify({ calendar: false }) }, ready: false, now: new Date(2026, 9, 16, 10), viewport: { width: 1440, height: 860 } });
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.evaluate(async () => (await import('/src/store.svelte.ts' as string)).store.showAgendaHere());
  await expect(page.locator('.split .list .row').first()).toBeVisible();
}
const inSide = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('section[aria-label="Файл сбоку"]'));
const inList = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('.split > .list'));

test('⌥↩ opens beside, the focus kept in the list; ⌥↩ again — into the file; ⌃⌘← / ⌃⌘→; ⎋ in the list closes', async ({ page }) => {
  await agenda(page);
  const row = page.locator('.split .list .row', { hasText: 'План переезда' }).first();
  await row.click();
  await page.keyboard.press('Alt+Enter');
  await expect(side(page)).toBeVisible();
  await expect(side(page).locator('header')).toContainText('План переезда хранилища');
  await expect(side(page).locator('.cm-sub.top')).toContainText('План переезда');
  expect(await inList(page)).toBe(true);
  await page.keyboard.press('Alt+Enter'); // the same row: into the file
  await expect.poll(() => inSide(page)).toBe(true);
  await page.keyboard.press('Control+Meta+ArrowLeft');
  await expect.poll(() => inList(page)).toBe(true);
  await page.keyboard.press('Control+Meta+ArrowRight');
  await expect.poll(() => inSide(page)).toBe(true);
  await page.keyboard.press('Escape'); // in the file: not closed
  await expect(side(page)).toBeVisible();
  await page.keyboard.press('Control+Meta+ArrowLeft');
  await expect.poll(() => inList(page)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(side(page)).toHaveCount(0);
  // ⌥-click on another row; «Открыть сбоку» in its menu
  await page.locator('.split .list .row', { hasText: 'Синк платформы' }).first().click({ modifiers: ['Alt'] });
  await expect(side(page).locator('header')).toContainText('Синк платформы');
  await side(page).getByRole('button', { name: 'Закрыть файл сбоку' }).click();
  await row.click({ button: 'right' });
  await page.getByRole('menu', { name: 'Задача' }).getByRole('menuitem', { name: /Открыть сбоку/ }).click();
  await expect(side(page).locator('header')).toContainText('План переезда хранилища');
  // the command of the palette
  await page.evaluate(async () => {
    const { commands } = await import('/src/commands.ts' as string);
    commands.find((c: { id: string }) => c.id === 'besideClose').run();
  });
  await expect(side(page)).toHaveCount(0);
});
