import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { diskAll as disk } from './helpers';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `<${ymd(d)}>`;
};
const WORK = ['#+TITLE: Work', '', '* Q4 2026', '** TODO Подготовить бюджет', `SCHEDULED: ${day(0)}`, 'текст бюджета', '** TODO Свести расходы', `SCHEDULED: ${day(1)}`, '* Идеи', 'просто текст', ''].join('\n');
const JOURNAL = ['#+TITLE: Journal', '', '* Октябрь', '** TODO Синк с CTO', `SCHEDULED: ${day(2)}`, ''].join('\n');
const FILES = () => ({ '/mock/work.org': WORK, '/mock/journal.org': JOURNAL });

const open = async (page: Page, files: Record<string, string> = FILES()) => {
  await installTauriMock(page, files);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  // start from work.org (the first file alphabetically would be journal.org)
  if (files['/mock/work.org']) {
    await page.locator('.nav .row').filter({ has: page.locator('.label', { hasText: /^work$/ }) }).click();
    await expect(page.locator('.cm-content').first()).toContainText('Q4 2026');
  }
};
const panes = (page: Page) => page.locator('section.pane');
const tabsOf = (page: Page, i: number) => panes(page).nth(i).locator('.tab .lbl').allInnerTexts();
const group = (page: Page) => page.getByRole('group', { name: 'Открыть в панели' });
const btn = (page: Page, name: string) => group(page).getByRole('button', { name });
const status = async (page: Page, i: number) => +/Стр\. (\d+)/.exec(await panes(page).nth(i).locator('.status').innerText())![1];

test.describe('toolbar group', () => {
  test('three mutually exclusive buttons: none pressed with one pane', async ({ page }) => {
    await open(page);
    for (const n of ['Второй редактор', 'Агенда', 'Календарь']) await expect(btn(page, n)).toHaveAttribute('aria-pressed', 'false');
  });

  test('"Агенда" opens the agenda in a second pane on the right and is pressed; pressing again closes it', async ({ page }) => {
    await open(page);
    await btn(page, 'Агенда').click();
    await expect(panes(page)).toHaveCount(2);
    expect(await tabsOf(page, 0)).toEqual(['work']);
    expect(await tabsOf(page, 1)).toEqual(['Агенда']);
    await expect(btn(page, 'Агенда')).toHaveAttribute('aria-pressed', 'true');
    await expect(btn(page, 'Второй редактор')).toHaveAttribute('aria-pressed', 'false');
    await btn(page, 'Агенда').click();
    await expect(panes(page)).toHaveCount(1);
    await expect(btn(page, 'Агенда')).toHaveAttribute('aria-pressed', 'false');
  });

  test('"Второй редактор" opens a copy of the current tab (same file, same place) and becomes active', async ({ page }) => {
    await open(page);
    await page.locator('.cm-line', { hasText: 'текст бюджета' }).click();
    await btn(page, 'Второй редактор').click();
    await expect(panes(page)).toHaveCount(2);
    expect(await tabsOf(page, 1)).toEqual(['work']);
    expect(await status(page, 1)).toBe(await status(page, 0));
    await expect(panes(page).nth(1)).toHaveClass(/active/);
    await expect(btn(page, 'Второй редактор')).toHaveAttribute('aria-pressed', 'true');
    // with the editor there, "Агенда" opens as a new tab of the second pane and becomes the pressed one
    await btn(page, 'Агенда').click();
    expect(await tabsOf(page, 1)).toEqual(['work', 'Агенда']);
    await expect(btn(page, 'Агенда')).toHaveAttribute('aria-pressed', 'true');
    await expect(btn(page, 'Второй редактор')).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('active pane', () => {
  test('a single pane has no accent bar: it is always the active one', async ({ page }) => {
    await open(page);
    await expect(panes(page)).toHaveCount(1);
    await expect(page.locator('section.pane .accent')).toHaveCount(0);
    await btn(page, 'Второй редактор').click();
    await expect(page.locator('section.pane .accent')).toHaveCount(2);
    await btn(page, 'Второй редактор').click();
    await expect(panes(page)).toHaveCount(1);
    await expect(page.locator('section.pane .accent')).toHaveCount(0);
  });

  test('exactly one pane is active, marked with the accent bar; a click anywhere in a pane makes it active', async ({ page }) => {
    await open(page);
    await btn(page, 'Второй редактор').click();
    await expect(page.locator('section.pane.active')).toHaveCount(1);
    await panes(page).nth(0).locator('.strip').click({ position: { x: 300, y: 10 } });
    await expect(panes(page).nth(0)).toHaveClass(/active/);
    await expect(panes(page).nth(1)).not.toHaveClass(/active/);
    const bar = (i: number) => panes(page).nth(i).locator('.accent').evaluate((el) => [getComputedStyle(el).height, getComputedStyle(el).backgroundColor]);
    const [h0, c0] = await bar(0);
    const [, c1] = await bar(1);
    expect(h0).toBe('2px');
    expect(c0).not.toBe('rgba(0, 0, 0, 0)');
    expect(c1).toBe('rgba(0, 0, 0, 0)');
    await panes(page).nth(1).locator('.cm-content').click();
    await expect(panes(page).nth(1)).toHaveClass(/active/);
  });

  test('⌥⌘← / ⌥⌘→ move between panes, nothing happens past the edge', async ({ page }) => {
    await open(page);
    await btn(page, 'Второй редактор').click();
    await page.keyboard.press('Alt+Meta+ArrowLeft');
    await expect(panes(page).nth(0)).toHaveClass(/active/);
    await page.keyboard.press('Alt+Meta+ArrowLeft');
    await expect(panes(page).nth(0)).toHaveClass(/active/);
    await page.keyboard.press('Alt+Meta+ArrowRight');
    await expect(panes(page).nth(1)).toHaveClass(/active/);
  });

  test('the inspector follows the active pane', async ({ page }) => {
    await open(page);
    await btn(page, 'Второй редактор').click();
    await panes(page).nth(1).locator('.cm-line', { hasText: 'Свести расходы' }).click();
    await expect(page.locator('.insp')).toContainText('Свести расходы');
    await panes(page).nth(0).locator('.cm-line', { hasText: 'Подготовить бюджет' }).click();
    await expect(page.locator('.insp')).toContainText('Подготовить бюджет');
  });
});

test.describe('agenda and its neighbour', () => {
  test('a click chooses the task, ↩ opens it in the neighbour pane at its heading; the focus stays in the agenda', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Meta+2'); // the agenda in the only pane
    expect(await tabsOf(page, 0)).toEqual(['work', 'Агенда']);
    await page.locator('.item', { hasText: 'Синк с CTO' }).click();
    // a click only chooses (ТЗ 34): highlighted, with the arrow; nothing opens
    await expect(page.locator('.item.sel')).toContainText('Синк с CTO');
    await expect(page.locator('.item.sel .go')).toBeVisible();
    await expect(panes(page)).toHaveCount(1);
    await page.keyboard.press('Enter');
    // the file opens on the LEFT, the agenda stays on the right
    await expect(panes(page)).toHaveCount(2);
    expect(await tabsOf(page, 0)).toEqual(['journal']);
    await expect(panes(page).nth(1).locator('.agenda')).toBeVisible();
    await expect(panes(page).nth(0).locator('.cm-activeLine')).toHaveText('** TODO Синк с CTO');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.agenda'))).toBe(true);
    await expect(panes(page).nth(1)).toHaveClass(/active/);
    await expect(page.locator('.agenda .foot')).toHaveText(/↩открыть.*⇧← →статус.*⌥⇧← →дата ±1 день.*⇧↑ ↓приоритет.*⌃C Sзапланировать.*Агенда/);
  });

  test('↑ ↓ and ↩ from the keyboard; the neighbour that already shows the file only moves to the heading', async ({ page }) => {
    await open(page);
    await btn(page, 'Агенда').click(); // work.org | Агенда
    await page.locator('.agenda .scroll').focus();
    await page.keyboard.press('ArrowDown'); // first task
    await page.keyboard.press('Enter');
    await expect(panes(page).nth(0).locator('.cm-activeLine')).toHaveText('** TODO Подготовить бюджет');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(panes(page).nth(0).locator('.cm-activeLine')).toHaveText('** TODO Свести расходы');
    expect(await tabsOf(page, 0)).toEqual(['work']); // no new tab
    expect(await page.evaluate(() => !!document.activeElement?.closest('.agenda'))).toBe(true);
  });

  test('⌥↩ opens the task as a new tab in the agenda\'s own pane', async ({ page }) => {
    await open(page);
    await btn(page, 'Агенда').click();
    await page.locator('.agenda .scroll').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown'); // Синк с CTO (journal.org)
    await page.keyboard.press('Alt+Enter');
    expect(await tabsOf(page, 1)).toEqual(['Агенда', 'journal']);
    await expect(panes(page).nth(1).locator('.cm-activeLine')).toHaveText('** TODO Синк с CTO');
    expect(await tabsOf(page, 0)).toEqual(['work']);
  });

  test('a double click moves the focus to the opened file', async ({ page }) => {
    await open(page);
    await btn(page, 'Агенда').click();
    await page.locator('.item', { hasText: 'Свести расходы' }).dblclick();
    await expect(panes(page).nth(0)).toHaveClass(/active/);
    expect(await page.evaluate(() => !!document.activeElement?.closest('.cm-editor'))).toBe(true);
  });

  test('"Открыто из агенды" appears and goes away when the caret leaves the heading', async ({ page }) => {
    await open(page);
    await btn(page, 'Агенда').click();
    await page.locator('.item', { hasText: 'Подготовить бюджет' }).dblclick();
    const cap = panes(page).nth(0).locator('.caption');
    await expect(cap).toHaveText(/Открыто из агенды:\s*Подготовить бюджет/);
    await panes(page).nth(0).locator('.cm-line', { hasText: 'текст бюджета' }).click(); // still the same heading
    await expect(cap).toBeVisible();
    await panes(page).nth(0).locator('.cm-line', { hasText: 'просто текст' }).click();
    await expect(cap).toHaveCount(0);
  });

  test('a status changed in the file shows up in the agenda without a reload', async ({ page }) => {
    await open(page);
    await btn(page, 'Агенда').click();
    await page.locator('.item', { hasText: 'Подготовить бюджет' }).click();
    await panes(page).nth(0).locator('.cm-line', { hasText: 'Подготовить бюджет' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+ArrowRight'); // TODO -> NEXT
    await expect(page.locator('.item', { hasText: 'Подготовить бюджет' }).locator('.kw')).toHaveText('NEXT');
  });
});

test.describe('layout commands', () => {
  test('⌘\\ splits right with a copy; ⇧⌘\\ keeps one pane and its tabs are not lost', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Meta+Backslash');
    await expect(panes(page)).toHaveCount(2);
    await page.keyboard.press('Meta+Backslash'); // two panes already: nothing more
    await expect(panes(page)).toHaveCount(2);
    await page.locator('.nav .row', { hasText: 'journal' }).first().click(); // opens in the active (right) pane
    expect(await tabsOf(page, 1)).toEqual(['journal']);
    await panes(page).nth(0).locator('.cm-content').click(); // make the left one active
    await page.keyboard.press('Shift+Meta+Backslash'); // closes the inactive (right) pane
    await expect(panes(page)).toHaveCount(1);
    expect(await tabsOf(page, 0)).toEqual(['work', 'journal']);
  });

  test('swap exchanges the panes with their tabs; the same pane stays active', async ({ page }) => {
    await open(page);
    await btn(page, 'Агенда').click();
    await panes(page).nth(0).locator('.cm-content').click();
    await page.keyboard.press('Shift+Control+Meta+ArrowRight');
    expect(await tabsOf(page, 0)).toEqual(['Агенда']);
    expect(await tabsOf(page, 1)).toEqual(['work']);
    await expect(panes(page).nth(1)).toHaveClass(/active/);
  });

  test('there is no pane "×"; pressing the lit "Второй редактор" closes the second pane and keeps its tabs', async ({ page }) => {
    await open(page);
    await btn(page, 'Второй редактор').click();
    await expect(page.getByRole('button', { name: 'Закрыть панель' })).toHaveCount(0);
    await page.locator('.nav .row', { hasText: 'journal' }).first().click(); // right pane: journal
    await page.keyboard.press('Meta+t'); // right pane: journal, Без названия
    await page.keyboard.type('черновик');
    await expect(btn(page, 'Второй редактор')).toHaveAttribute('aria-pressed', 'true');
    await btn(page, 'Второй редактор').click();
    await expect(panes(page)).toHaveCount(1);
    expect(await tabsOf(page, 0)).toEqual(['work', 'journal', 'Без названия']); // no question: nothing was closed
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('⌃⌘W closes the active pane, its tabs go to the end of the other', async ({ page }) => {
    await open(page);
    await btn(page, 'Агенда').click();
    await panes(page).nth(0).locator('.cm-content').click();
    await page.keyboard.press('Meta+2'); // left: work, Агенда — already in the right pane, so it is not doubled
    await page.keyboard.press('Control+Meta+w');
    await expect(panes(page)).toHaveCount(1);
    expect(await tabsOf(page, 0)).toEqual(['Агенда', 'work']);
  });

  test('closing the last tab of the left pane leaves the right one as the only, active pane', async ({ page }) => {
    await open(page);
    await btn(page, 'Агенда').click();
    await panes(page).nth(0).locator('.cm-content').click();
    await page.keyboard.press('Meta+w');
    await expect(panes(page)).toHaveCount(1);
    expect(await tabsOf(page, 0)).toEqual(['Агенда']);
    await expect(panes(page).nth(0)).toHaveClass(/active/);
  });
});

test.describe('tabs', () => {
  test('the close cross appears on hover only and the tab keeps its width; a click closes without activating', async ({ page }) => {
    await open(page);
    await page.locator('.nav .row', { hasText: 'journal' }).first().click({ modifiers: [] });
    await page.keyboard.press('Meta+2');
    expect(await tabsOf(page, 0)).toEqual(['journal', 'Агенда']);
    const t = panes(page).nth(0).locator('.tab').first();
    const x = t.getByRole('button', { name: /Закрыть вкладку/ });
    expect(await x.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    const w0 = (await t.boundingBox())!.width;
    await t.hover();
    await expect.poll(() => x.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    expect((await t.boundingBox())!.width).toBe(w0);
    await x.click();
    expect(await tabsOf(page, 0)).toEqual(['Агенда']);
  });

  test('the middle button closes a tab', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Meta+2');
    await panes(page).nth(0).locator('.tab').first().click({ button: 'middle' });
    expect(await tabsOf(page, 0)).toEqual(['Агенда']);
  });

  test('⌘W closes the active tab', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Meta+2');
    await page.keyboard.press('Meta+w');
    expect(await tabsOf(page, 0)).toEqual(['work']);
  });
});

test.describe('one file in two editors', () => {
  test('an edit shows in both editors at once; each keeps its own caret', async ({ page }) => {
    await open(page);
    await page.locator('.cm-line', { hasText: 'просто текст' }).click();
    await page.keyboard.press('End');
    await btn(page, 'Второй редактор').click();
    await panes(page).nth(1).locator('.cm-line', { hasText: 'Q4 2026' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' (план)');
    await expect(panes(page).nth(0).locator('.cm-line', { hasText: 'Q4 2026 (план)' })).toBeVisible();
    expect(await status(page, 0)).toBe(10); // still on "просто текст"
    expect(await status(page, 1)).toBe(3);
    await expect.poll(async () => (await disk(page))['/mock/work.org']).toContain('* Q4 2026 (план)');
  });
});

test.describe('room and restarts', () => {
  test('a narrow window hides the inspector, then the navigator, and never makes a pane narrower than 320', async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 800 });
    await open(page);
    await btn(page, 'Второй редактор').click();
    await expect(page.locator('.insp')).toBeVisible();
    await page.setViewportSize({ width: 950, height: 800 }); // 2*320 + nav fits, the inspector does not
    await expect(page.locator('.insp')).toHaveCount(0);
    await expect(page.locator('.nav')).toBeVisible();
    for (const i of [0, 1]) expect((await panes(page).nth(i).boundingBox())!.width).toBeGreaterThanOrEqual(319);
    await page.setViewportSize({ width: 700, height: 800 }); // no navigator either
    await expect(page.locator('.nav')).toHaveCount(0);
    await expect(panes(page)).toHaveCount(2);
    for (const i of [0, 1]) expect((await panes(page).nth(i).boundingBox())!.width).toBeGreaterThanOrEqual(319);
    await page.setViewportSize({ width: 600, height: 800 }); // even that is not enough: the panes merge
    await expect(panes(page)).toHaveCount(1);
    expect(await tabsOf(page, 0)).toEqual(['work']); // the copy merged into the original
    await page.setViewportSize({ width: 1360, height: 800 });
    await expect(page.locator('.insp')).toBeVisible(); // the inspector comes back
  });

  test('the divider can be dragged and a double click returns 50/50', async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 800 });
    await open(page);
    await btn(page, 'Второй редактор').click();
    const d = (await page.locator('.divider').boundingBox())!;
    await page.mouse.move(d.x, d.y + 200);
    await page.mouse.down();
    await page.mouse.move(d.x - 120, d.y + 200, { steps: 4 });
    await page.mouse.up();
    const w = async () => [(await panes(page).nth(0).boundingBox())!.width, (await panes(page).nth(1).boundingBox())!.width];
    const [a, b] = await w();
    expect(b - a).toBeGreaterThan(150);
    await page.locator('.divider').dblclick();
    const [c, e] = await w();
    expect(Math.abs(c - e)).toBeLessThanOrEqual(2);
  });

  test('the layout comes back after a restart', async ({ page }) => {
    await open(page);
    await btn(page, 'Агенда').click();
    await panes(page).nth(0).locator('.cm-line', { hasText: 'просто текст' }).click();
    await page.waitForTimeout(200);
    await page.reload();
    await expect(panes(page)).toHaveCount(2);
    expect(await tabsOf(page, 0)).toEqual(['work']);
    expect(await tabsOf(page, 1)).toEqual(['Агенда']);
    await expect(panes(page).nth(0)).toHaveClass(/active/);
    expect(await status(page, 0)).toBe(10);
  });

  test('renaming a file in the navigator updates its tabs in both panes; deleting closes them', async ({ page }) => {
    await open(page);
    await btn(page, 'Второй редактор').click();
    const navRow = (label: string) => page.locator('.nav .row').filter({ has: page.locator('.label', { hasText: new RegExp(`^${label}$`) }) });
    await navRow('work').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Переименовать' }).click();
    await page.getByRole('textbox', { name: 'Новое имя' }).fill('plan');
    await page.keyboard.press('Enter');
    await expect.poll(() => tabsOf(page, 0)).toEqual(['plan']);
    expect(await tabsOf(page, 1)).toEqual(['plan']);
    await navRow('plan').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Переместить в Корзину…' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Переместить в Корзину' }).click();
    await expect(panes(page)).toHaveCount(1);
    await expect(page.getByText('Нет открытых вкладок')).toBeVisible();
  });
});
