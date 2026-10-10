import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

const FILES = () => ({
  '/mock/work.org': '#+TITLE: Work\n\n* Q4 2026\n** TODO Бюджет\nтекст\n',
  '/mock/journal.org': '* Октябрь\n** Итоги\n',
  '/mock/Работа/2026/plan.org': '* План\n',
});

const open = async (page: Page, files: Record<string, string> = FILES()) => {
  await page.addInitScript(() => {
    // capture what "Скопировать путь" writes
    (window as any).__clip = '';
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => ((window as any).__clip = t) }, configurable: true });
  });
  await installTauriMock(page, files);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await navRow(page, 'work').click();
  await expect(page.locator('.cm-content').first()).toContainText('Q4 2026');
};
const navRow = (page: Page, label: string) => page.locator('.nav .row').filter({ has: page.locator('.label', { hasText: new RegExp(`^${label}$`) }) });
const panes = (page: Page) => page.locator('section.pane');
const tabs = (page: Page, i = 0) => panes(page).nth(i).locator('.tab');
const labels = (page: Page, i = 0) => tabs(page, i).locator('.lbl').allInnerTexts();
const activeLabel = (page: Page, i = 0) => panes(page).nth(i).locator('.tab.on .lbl').innerText();
const disk = (page: Page) => page.evaluate(() => (window as any).__disk as Record<string, string>);
const log = (page: Page) => page.evaluate(() => (window as any).__log as unknown[][]);
const menuItem = (page: Page, name: string | RegExp) => page.getByRole('menuitem', { name });
const strip = (page: Page, i = 0) => panes(page).nth(i).locator('.strip');
const blank = async (page: Page, i = 0) => {
  const b = (await strip(page, i).boundingBox())!;
  await page.mouse.dblclick(b.x + b.width - 60, b.y + b.height / 2);
};
const twoPanes = async (page: Page) => {
  await page.getByRole('button', { name: 'Второй редактор' }).click(); // copy of work.org on the right
  await navRow(page, 'journal').click(); // opens in the active (right) pane
};

test.describe('context menu', () => {
  test('six items with shortcuts; the clicked tab is highlighted with its cross; actions use it, not the active tab', async ({ page }) => {
    await open(page);
    await twoPanes(page);
    await panes(page).nth(0).locator('.cm-content').click();
    await page.keyboard.press('Meta+2'); // left pane: work.org, Агенда (active)
    expect(await labels(page, 0)).toEqual(['work.org', 'Агенда']);
    await tabs(page, 0).first().click({ button: 'right' });
    const items = await page.getByRole('menuitem').allInnerTexts();
    expect(items.map((t) => t.replace(/\s+/g, ' ').trim())).toEqual([
      'Закрыть ⌘W', 'Закрыть остальные ⌥⌘W', 'Переместить в соседний редактор ⌃⌘→', 'Продублировать в соседнем редакторе ⌥⌃⌘→', 'Показать в навигаторе ⇧⌘J', 'Скопировать путь ⌥⌘C',
    ]);
    await expect(tabs(page, 0).first()).toHaveClass(/menu/);
    await expect(tabs(page, 0).first().getByRole('button', { name: /Закрыть вкладку/ })).toHaveCSS('opacity', '1');
    expect(await activeLabel(page, 0)).toBe('Агенда'); // not activated by the right click
    await menuItem(page, /^Закрыть ⌘W/).click();
    expect(await labels(page, 0)).toEqual(['Агенда']);
  });

  test('the arrow points at the neighbour: ← for a tab in the right pane', async ({ page }) => {
    await open(page);
    await twoPanes(page);
    await tabs(page, 1).first().click({ button: 'right' });
    await expect(menuItem(page, /Переместить в соседний редактор/)).toContainText('⌃⌘←');
    await expect(menuItem(page, /Продублировать/)).toContainText('⌥⌃⌘←');
  });

  test('"Закрыть остальные" keeps the clicked tab', async ({ page }) => {
    await open(page);
    await navRow(page, 'journal').click({ modifiers: [] });
    await page.keyboard.press('Meta+2'); // agenda tab
    // retargeting replaced work.org with journal.org; add work.org back as a tab via the agenda? use the navigator in a new tab:
    expect(await labels(page)).toEqual(['journal.org', 'Агенда']);
    await tabs(page).first().click({ button: 'right' });
    await menuItem(page, /Закрыть остальные/).click();
    expect(await labels(page)).toEqual(['journal.org']);
  });

  test('move takes the tab out of its pane, duplicate leaves it; an already open file is not opened twice', async ({ page }) => {
    await open(page);
    await twoPanes(page); // left: work.org, right: journal.org
    await page.keyboard.press('Meta+2'); // right: journal.org, Агенда
    await tabs(page, 1).nth(1).click({ button: 'right' });
    await menuItem(page, /Продублировать/).click();
    expect(await labels(page, 0)).toEqual(['work.org', 'Агенда']);
    expect(await labels(page, 1)).toEqual(['journal.org', 'Агенда']);
    await expect(panes(page).nth(0)).toHaveClass(/active/);
    // duplicating work.org into the right pane goes after its active tab; a second time it just activates it
    await tabs(page, 0).first().click({ button: 'right' });
    await menuItem(page, /Продублировать/).click();
    expect(await labels(page, 1)).toEqual(['journal.org', 'Агенда', 'work.org']);
    await tabs(page, 0).first().click({ button: 'right' });
    await menuItem(page, /Продублировать/).click();
    expect(await labels(page, 1)).toEqual(['journal.org', 'Агенда', 'work.org']);
    // move journal.org to the left: gone from the right, active on the left
    await tabs(page, 1).first().click({ button: 'right' });
    await menuItem(page, /Переместить/).click();
    expect(await labels(page, 1)).toEqual(['Агенда', 'work.org']);
    expect(await labels(page, 0)).toContain('journal.org');
    expect(await activeLabel(page, 0)).toBe('journal.org');
    await expect(panes(page).nth(0)).toHaveClass(/active/);
  });

  test('moving the last tab of a pane closes that pane', async ({ page }) => {
    await open(page);
    await twoPanes(page);
    await tabs(page, 1).first().click({ button: 'right' });
    await menuItem(page, /Переместить/).click();
    await expect(panes(page)).toHaveCount(1);
    expect(await labels(page, 0)).toEqual(['work.org', 'journal.org']);
  });

  test('with one pane move and duplicate are greyed out; the agenda has no path items', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Meta+2');
    await tabs(page).first().click({ button: 'right' });
    await expect(menuItem(page, /Переместить/)).toBeDisabled();
    await expect(menuItem(page, /Продублировать/)).toBeDisabled();
    await page.keyboard.press('Escape');
    await tabs(page).nth(1).click({ button: 'right' }); // the agenda
    await expect(menuItem(page, /Показать в навигаторе/)).toHaveCount(0);
    await expect(menuItem(page, /Скопировать путь/)).toHaveCount(0);
  });

  test('"Показать в навигаторе" expands the tree and marks the file; "Скопировать путь" copies the full path', async ({ page }) => {
    await open(page);
    await navRow(page, 'Работа').locator('.chev').click(); // collapse the folder
    await expect(navRow(page, 'plan')).toHaveCount(0);
    await page.evaluate(() => {
      // open plan.org without the navigator: through a link in work.org would be overkill, use the store via a tab
    });
    await page.keyboard.press('Meta+2');
    await navRow(page, 'Работа').locator('.chev').click(); // expand, open plan, collapse again
    await navRow(page, 'plan').click();
    await navRow(page, 'Работа').locator('.chev').click();
    await expect(navRow(page, 'plan')).toHaveCount(0);
    await tabs(page).filter({ hasText: 'plan.org' }).click({ button: 'right' });
    await menuItem(page, /Показать в навигаторе/).click();
    await expect(navRow(page, 'plan')).toBeVisible();
    await expect(navRow(page, 'plan')).toHaveClass(/flash|sel/);
    await tabs(page).filter({ hasText: 'plan.org' }).click({ button: 'right' });
    await menuItem(page, /Скопировать путь/).click();
    expect(await page.evaluate(() => (window as any).__clip)).toBe('/mock/Работа/2026/plan.org');
  });
});

test.describe('new untitled tab', () => {
  test('a double click on the free part of the row opens "Без названия" with the caret in an empty editor', async ({ page }) => {
    await open(page);
    await blank(page);
    expect(await labels(page)).toEqual(['work.org', 'Без названия']);
    const t = tabs(page).last();
    await expect(t).toHaveClass(/on/);
    expect(await t.locator('.lbl').evaluate((el) => getComputedStyle(el).fontStyle)).toBe('italic');
    await expect(t.locator('svg[stroke-dasharray]')).toHaveCount(1);
    await expect(panes(page).nth(0).getByText('Начните писать…')).toBeVisible();
    expect(await page.evaluate(() => !!document.activeElement?.closest('.cm-editor'))).toBe(true);
    await expect(page.locator('.path')).toContainText('Без названия');
    await expect(page.locator('.path')).toContainText('не сохранено');
    const bar = panes(page).nth(0).locator('.unsaved');
    await expect(bar).toContainText('Не сохранено');
    await expect(bar).toContainText('Файл появится на диске после «Сохранить как…»');
    await expect(bar).toContainText('⌘S');
    await expect(bar.getByRole('button', { name: 'Сохранить как…' })).toBeVisible();
    await expect(panes(page).nth(0).locator('.crumbs')).toHaveCount(0); // no heading yet
  });

  test('typing needs no extra click; the unsaved dot appears; nothing is written to disk; headings get highlighted', async ({ page }) => {
    await open(page);
    const before = Object.keys(await disk(page)).sort();
    await blank(page);
    await page.keyboard.type('* TODO Идеи для ретро');
    await expect(tabs(page).last()).toHaveClass(/dirty/);
    await expect(panes(page).nth(0).locator('.cm-line').first().locator('.cm-kw')).toHaveText('TODO');
    await expect(panes(page).nth(0).locator('.crumbs')).toContainText('Идеи для ретро');
    expect(Object.keys(await disk(page)).sort()).toEqual(before);
    await expect(page.locator('.nav')).not.toContainText('Без названия');
  });

  test('the next one is "Без названия 2"; a double click on a tab itself does not create one', async ({ page }) => {
    await open(page);
    await blank(page);
    await blank(page);
    expect(await labels(page)).toEqual(['work.org', 'Без названия', 'Без названия 2']);
    await tabs(page).first().dblclick();
    expect(await labels(page)).toEqual(['work.org', 'Без названия', 'Без названия 2']);
  });
});

test.describe('save as', () => {
  const draft = async (page: Page, text = '* Идеи для ретро\nпервая мысль') => {
    await blank(page);
    await page.keyboard.type(text);
  };
  const sheet = (page: Page) => page.getByRole('dialog', { name: 'Сохранить как' });

  test('⌘S opens the sheet with the name from the first heading selected and .org after it', async ({ page }) => {
    await open(page);
    await draft(page);
    await page.keyboard.press('Meta+s');
    await expect(sheet(page)).toBeVisible();
    const name = sheet(page).getByLabel('Сохранить как:');
    await expect(name).toHaveValue('Идеи для ретро');
    expect(await name.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 'Идеи для ретро'.length]);
    await expect(sheet(page).locator('.ext')).toHaveText('.org');
    expect(Math.round((await sheet(page).boundingBox())!.width)).toBe(480);
  });

  test('Return saves into the chosen folder; the tab becomes an ordinary file tab; the file shows in the navigator', async ({ page }) => {
    await open(page);
    await draft(page);
    await panes(page).nth(0).locator('.unsaved').getByRole('button', { name: 'Сохранить как…' }).click();
    await sheet(page).getByLabel('Где:').selectOption({ label: '    2026' });
    await expect(sheet(page).getByLabel('Путь')).toHaveText('mock › Работа › 2026');
    await page.keyboard.press('Enter');
    await expect(sheet(page)).toHaveCount(0);
    expect((await disk(page))['/mock/Работа/2026/Идеи для ретро.org']).toBe('* Идеи для ретро\nпервая мысль');
    const t = tabs(page).last();
    await expect(t.locator('.lbl')).toHaveText('Идеи для ретро.org');
    expect(await t.locator('.lbl').evaluate((el) => getComputedStyle(el).fontStyle)).toBe('normal');
    await expect(t).not.toHaveClass(/dirty/);
    await expect(panes(page).nth(0).locator('.unsaved')).toHaveCount(0);
    await expect(page.locator('.nav .row[data-key="/mock/Работа/2026/Идеи для ретро.org"]')).toBeVisible();
    await expect(page.locator('.path')).toContainText('Идеи для ретро.org');
    // the caret is where it was: typing continues the last line
    await page.keyboard.type('!');
    await expect.poll(async () => (await disk(page))['/mock/Работа/2026/Идеи для ретро.org']).toBe('* Идеи для ретро\nпервая мысль!');
  });

  test('without a heading the name is "Без названия"; the default folder is the one of the neighbour\'s file', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Второй редактор' }).click();
    await navRow(page, 'plan').click(); // right pane shows Работа/2026/plan.org
    await panes(page).nth(0).locator('.cm-content').click();
    await draft(page, 'просто текст');
    await page.keyboard.press('Meta+s');
    await expect(sheet(page).getByLabel('Сохранить как:')).toHaveValue('Без названия');
    await expect(sheet(page).getByLabel('Путь')).toHaveText('mock › Работа › 2026');
  });

  test('an existing name asks "Заменить", with "Отмена" as the default', async ({ page }) => {
    await open(page);
    await draft(page, '* journal\nновое');
    await page.keyboard.press('Meta+s');
    await page.keyboard.press('Enter');
    const ask = page.getByRole('alertdialog', { name: 'Заменить файл' });
    await expect(ask).toContainText('«journal.org» уже существует');
    await expect(ask.getByRole('button', { name: 'Отмена' })).toBeFocused();
    await ask.getByRole('button', { name: 'Отмена' }).click();
    expect((await disk(page))['/mock/journal.org']).toBe('* Октябрь\n** Итоги\n');
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press('Enter');
    await page.getByRole('alertdialog', { name: 'Заменить файл' }).getByRole('button', { name: 'Заменить' }).click();
    await expect.poll(async () => (await disk(page))['/mock/journal.org']).toBe('* journal\nновое');
  });

  test('Esc closes the sheet and changes nothing; a failed write keeps the tab unsaved and says why', async ({ page }) => {
    await open(page);
    await draft(page);
    await page.keyboard.press('Meta+s');
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await expect(tabs(page).last()).toHaveClass(/dirty/);
    await page.keyboard.press('Meta+s');
    await sheet(page).getByLabel('Сохранить как:').fill('fail');
    await page.keyboard.press('Enter');
    await expect(sheet(page)).toHaveCount(0);
    await expect(tabs(page).last().locator('.lbl')).toHaveText('Без названия');
    await expect(page.getByText(/Не удалось сохранить: disk full/)).toBeVisible();
  });

  test('"Новая папка" creates a folder and saves into it', async ({ page }) => {
    await open(page);
    await draft(page);
    await page.keyboard.press('Meta+s');
    await sheet(page).getByRole('button', { name: 'Новая папка' }).click();
    await sheet(page).getByLabel('Новая папка:').fill('Ретро');
    await page.keyboard.press('Enter');
    await expect(sheet(page).getByLabel('Путь')).toHaveText('mock › Ретро');
    await sheet(page).getByRole('button', { name: 'Сохранить' }).click();
    await expect.poll(async () => Object.keys(await disk(page))).toContain('/mock/Ретро/Идеи для ретро.org');
  });
});

test.describe('closing unsaved text', () => {
  const unsaved = (page: Page) => page.getByRole('alertdialog', { name: 'Несохранённые изменения' });

  test('the cross asks "Сохранить / Не сохранять / Отмена"', async ({ page }) => {
    await open(page);
    await blank(page);
    await page.keyboard.type('черновик');
    await tabs(page).last().hover();
    await tabs(page).last().getByRole('button', { name: /Закрыть вкладку/ }).click();
    await expect(unsaved(page)).toContainText('Сохранить изменения в «Без названия»?');
    await unsaved(page).getByRole('button', { name: 'Отмена' }).click();
    expect(await labels(page)).toEqual(['work.org', 'Без названия']);
    await page.keyboard.press('Meta+w');
    await unsaved(page).getByRole('button', { name: 'Не сохранять' }).click();
    expect(await labels(page)).toEqual(['work.org']);
  });

  test('"Сохранить" goes through "Сохранить как…" and closes the tab only after the write', async ({ page }) => {
    await open(page);
    await blank(page);
    await page.keyboard.type('* Черновик\nтекст');
    await page.keyboard.press('Meta+w');
    await unsaved(page).getByRole('button', { name: 'Сохранить' }).click();
    const sheet = page.getByRole('dialog', { name: 'Сохранить как' });
    await expect(sheet).toBeVisible();
    expect(await labels(page)).toEqual(['work.org', 'Без названия']); // still open while choosing
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await disk(page))['/mock/Черновик.org']).toBe('* Черновик\nтекст');
    await expect.poll(() => labels(page)).toEqual(['work.org']);
  });

  test('cancelling the save sheet keeps the tab', async ({ page }) => {
    await open(page);
    await blank(page);
    await page.keyboard.type('x');
    await page.keyboard.press('Meta+w');
    await unsaved(page).getByRole('button', { name: 'Сохранить' }).click();
    await page.keyboard.press('Escape');
    expect(await labels(page)).toEqual(['work.org', 'Без названия']);
  });

  test('an empty untitled tab closes without a question', async ({ page }) => {
    await open(page);
    await blank(page);
    await page.keyboard.press('Meta+w');
    await expect(unsaved(page)).toHaveCount(0);
    expect(await labels(page)).toEqual(['work.org']);
  });

  test('"Закрыть остальные" asks for each unsaved tab in turn', async ({ page }) => {
    await open(page);
    await blank(page);
    await page.keyboard.type('один');
    await blank(page);
    await page.keyboard.type('два');
    await tabs(page).first().click({ button: 'right' });
    await menuItem(page, /Закрыть остальные/).click();
    await expect(unsaved(page)).toContainText('«Без названия»');
    await unsaved(page).getByRole('button', { name: 'Не сохранять' }).click();
    await expect(unsaved(page)).toContainText('«Без названия 2»');
    await unsaved(page).getByRole('button', { name: 'Не сохранять' }).click();
    expect(await labels(page)).toEqual(['work.org']);
  });

  test('quitting asks about every unsaved tab and stops on "Отмена"', async ({ page }) => {
    await open(page);
    await blank(page);
    await page.keyboard.type('один');
    await page.keyboard.press('Meta+q');
    await unsaved(page).getByRole('button', { name: 'Отмена' }).click();
    expect((await log(page)).some((e) => e[0] === 'quit')).toBe(false);
    await page.keyboard.press('Meta+q');
    await unsaved(page).getByRole('button', { name: 'Не сохранять' }).click();
    await expect.poll(async () => (await log(page)).some((e) => e[0] === 'quit')).toBe(true);
  });
});

test.describe('many tabs', () => {
  test('the row scrolls, the active tab stays visible, tabs do not shrink below 100 pt', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 700 });
    await open(page);
    for (let i = 0; i < 9; i++) await blank(page);
    const widths = await tabs(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(100);
    const visible = async (loc: ReturnType<Page['locator']>) => {
      const s = (await strip(page).boundingBox())!;
      const b = (await loc.boundingBox())!;
      return b.x >= s.x - 1 && b.x + b.width <= s.x + s.width + 1;
    };
    expect(await visible(tabs(page).last())).toBe(true);
    await tabs(page).first().click();
    await expect.poll(() => visible(tabs(page).first())).toBe(true);
  });

  test('closing the active tab activates the one to its right, else the one to its left', async ({ page }) => {
    await open(page);
    await blank(page);
    await blank(page);
    await tabs(page).nth(1).click();
    await page.keyboard.press('Meta+w');
    expect(await activeLabel(page)).toBe('Без названия 2');
    await page.keyboard.press('Meta+w');
    expect(await activeLabel(page)).toBe('work.org');
  });
});
