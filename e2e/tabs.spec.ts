import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, expandTree } from './tauriMock';
import { diskAll as disk } from './helpers';

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
  await expandTree(page); // folded by default (ТЗ 02)
  await navRow(page, 'work').click();
  await expect(page.locator('.cm-content').first()).toContainText('Q4 2026');
};
const navRow = (page: Page, label: string) => page.locator('.nav .row').filter({ has: page.locator('.label', { hasText: new RegExp(`^${label}$`) }) });
const panes = (page: Page) => page.locator('section.pane');
const tabs = (page: Page, i = 0) => panes(page).nth(i).locator('.tab');
const labels = (page: Page, i = 0) => tabs(page, i).locator('.lbl').allInnerTexts();
const activeLabel = (page: Page, i = 0) => panes(page).nth(i).locator('.tab.on .lbl').innerText();
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
    expect(await labels(page, 0)).toEqual(['work', 'Агенда']);
    await tabs(page, 0).first().click({ button: 'right' });
    const items = await page.getByRole('menuitem').allInnerTexts();
    expect(items.map((t) => t.replace(/\s+/g, ' ').trim())).toEqual([
      'Закрыть ⌘W', 'Закрыть остальные ⌥⌘W', 'Переместить в соседний редактор ⌃⌘→', 'Продублировать в соседнем редакторе ⌃⌥⌘→', 'Показать как ›', 'Показать в навигаторе ⇧⌘J', 'Скопировать путь ⌥⌘C',
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
    await expect(menuItem(page, /Продублировать/)).toContainText('⌃⌥⌘←');
  });

  test('"Закрыть остальные" keeps the clicked tab', async ({ page }) => {
    await open(page);
    await navRow(page, 'journal').click({ modifiers: [] });
    await page.keyboard.press('Meta+2'); // agenda tab
    // retargeting replaced work.org with journal.org; add work.org back as a tab via the agenda? use the navigator in a new tab:
    expect(await labels(page)).toEqual(['journal', 'Агенда']);
    await tabs(page).first().click({ button: 'right' });
    await menuItem(page, /Закрыть остальные/).click();
    expect(await labels(page)).toEqual(['journal']);
  });

  test('move takes the tab out of its pane, duplicate leaves it; an already open file is not opened twice', async ({ page }) => {
    await open(page);
    await twoPanes(page); // left: work.org, right: journal.org
    await page.keyboard.press('Meta+2'); // right: journal.org, Агенда
    await tabs(page, 1).nth(1).click({ button: 'right' });
    await menuItem(page, /Продублировать/).click();
    expect(await labels(page, 0)).toEqual(['work', 'Агенда']);
    expect(await labels(page, 1)).toEqual(['journal', 'Агенда']);
    await expect(panes(page).nth(0)).toHaveClass(/active/);
    // duplicating work.org into the right pane goes after its active tab; a second time it just activates it
    await tabs(page, 0).first().click({ button: 'right' });
    await menuItem(page, /Продублировать/).click();
    expect(await labels(page, 1)).toEqual(['journal', 'Агенда', 'work']);
    await tabs(page, 0).first().click({ button: 'right' });
    await menuItem(page, /Продублировать/).click();
    expect(await labels(page, 1)).toEqual(['journal', 'Агенда', 'work']);
    // move journal.org to the left: gone from the right, active on the left
    await tabs(page, 1).first().click({ button: 'right' });
    await menuItem(page, /Переместить/).click();
    expect(await labels(page, 1)).toEqual(['Агенда', 'work']);
    expect(await labels(page, 0)).toContain('journal');
    expect(await activeLabel(page, 0)).toBe('journal');
    await expect(panes(page).nth(0)).toHaveClass(/active/);
  });

  test('moving the last tab of a pane closes that pane', async ({ page }) => {
    await open(page);
    await twoPanes(page);
    await tabs(page, 1).first().click({ button: 'right' });
    await menuItem(page, /Переместить/).click();
    await expect(panes(page)).toHaveCount(1);
    expect(await labels(page, 0)).toEqual(['work', 'journal']);
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
    await navRow(page, 'Работа').locator('.chev').click(); // expand, open plan, collapse again
    await navRow(page, 'plan').click();
    await navRow(page, 'Работа').locator('.chev').click();
    await expect(navRow(page, 'plan')).toHaveCount(0);
    await tabs(page).filter({ hasText: 'plan' }).click({ button: 'right' });
    await menuItem(page, /Показать в навигаторе/).click();
    await expect(navRow(page, 'plan')).toBeVisible();
    await expect(navRow(page, 'plan')).toHaveClass(/flash|sel/);
    await tabs(page).filter({ hasText: 'plan' }).click({ button: 'right' });
    await menuItem(page, /Скопировать путь/).click();
    expect(await page.evaluate(() => (window as any).__clip)).toBe('/mock/Работа/2026/plan.org');
  });
});

test.describe('new untitled tab', () => {
  test('a double click on the free part of the row opens "Без названия" with the caret in an empty editor', async ({ page }) => {
    await open(page);
    await blank(page);
    expect(await labels(page)).toEqual(['work', 'Без названия']);
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
    expect(await labels(page)).toEqual(['work', 'Без названия', 'Без названия 2']);
    await tabs(page).first().dblclick();
    expect(await labels(page)).toEqual(['work', 'Без названия', 'Без названия 2']);
  });
});

test.describe('save as', () => {
  const draft = async (page: Page, text = '* Идеи для ретро\nпервая мысль') => {
    await blank(page);
    await page.keyboard.type(text);
  };
  const sheet = (page: Page) => page.getByRole('dialog', { name: 'Сохранить как' });

  test('⌘S opens the sheet with the name from the first heading selected, without .org', async ({ page }) => {
    await open(page);
    await draft(page);
    await page.keyboard.press('Meta+s');
    await expect(sheet(page)).toBeVisible();
    const name = sheet(page).getByLabel('Сохранить как:');
    await expect(name).toHaveValue('Идеи для ретро');
    expect(await name.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 'Идеи для ретро'.length]);
    await expect(sheet(page)).not.toContainText('.org');
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
    await expect(t.locator('.lbl')).toHaveText('Идеи для ретро');
    expect(await t.locator('.lbl').evaluate((el) => getComputedStyle(el).fontStyle)).toBe('normal');
    await expect(t).not.toHaveClass(/dirty/);
    await expect(panes(page).nth(0).locator('.unsaved')).toHaveCount(0);
    await expect(page.locator('.nav .row[data-key="/mock/Работа/2026/Идеи для ретро.org"]')).toBeVisible();
    await expect(page.locator('.path')).toContainText('Идеи для ретро');
    // the caret is where it was: typing continues the last line
    await page.keyboard.type('!');
    await expect.poll(async () => (await disk(page))['/mock/Работа/2026/Идеи для ретро.org']).toBe('* Идеи для ретро\nпервая мысль!');
  });

  test('without a heading the name is the first line; the default folder is the one of the neighbour\'s file', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Второй редактор' }).click();
    await navRow(page, 'plan').click(); // right pane shows Работа/2026/plan.org
    await panes(page).nth(0).locator('.cm-content').click();
    await draft(page, 'просто текст');
    await page.keyboard.press('Meta+s');
    await expect(sheet(page).getByLabel('Сохранить как:')).toHaveValue('просто текст');
    await expect(sheet(page).getByLabel('Путь')).toHaveText('mock › Работа › 2026');
  });

  test('an existing name asks "Заменить", with "Отмена" as the default', async ({ page }) => {
    await open(page);
    await draft(page, '* journal\nновое');
    await page.keyboard.press('Meta+s');
    await page.keyboard.press('Enter');
    const ask = page.getByRole('alertdialog', { name: 'Заменить файл' });
    await expect(ask).toContainText('«journal» уже существует');
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

  test('.org is added once: "Привет" and "Привет.org" both save as Привет.org', async ({ page }) => {
    await open(page);
    await draft(page, 'раз');
    await page.keyboard.press('Meta+s');
    await sheet(page).getByLabel('Сохранить как:').fill('Привет.org');
    await page.keyboard.press('Enter');
    await expect.poll(async () => Object.keys(await disk(page))).toContain('/mock/Привет.org');
    await expect(tabs(page).last().locator('.lbl')).toHaveText('Привет');
    await draft(page, 'два');
    await page.keyboard.press('Meta+s');
    await sheet(page).getByLabel('Сохранить как:').fill('report.v2');
    await page.keyboard.press('Enter');
    await expect.poll(async () => Object.keys(await disk(page))).toContain('/mock/report.v2.org');
    await expect(tabs(page).last().locator('.lbl')).toHaveText('report.v2');
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

test.describe('many tabs', () => {
  test('the row scrolls, the active tab stays visible, tabs do not shrink below 110 pt', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 700 });
    await open(page);
    for (let i = 0; i < 9; i++) await page.keyboard.press('Meta+t');
    await expect(tabs(page)).toHaveCount(10);
    const widths = await tabs(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(110);
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
    expect(await activeLabel(page)).toBe('work');
  });
});

test.describe('overflow', () => {
  const more = (page: Page) => panes(page).nth(0).getByRole('button', { name: 'Все вкладки' });

  test('"⌵" shows only when the tabs do not fit; it lists them all and picks one; the edges fade', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 700 });
    await open(page);
    await expect(more(page)).toHaveCount(0);
    await blank(page);
    await page.keyboard.type('x');
    for (let i = 0; i < 8; i++) await page.keyboard.press('Meta+t'); // soon there is no free room to double-click
    await expect(more(page)).toBeVisible();
    await expect(strip(page)).toHaveClass(/fl/); // scrolled to the new tab at the end: the start fades
    await more(page).click();
    const items = page.getByRole('menuitem');
    await expect(items).toHaveCount(10);
    await expect(items.first()).toHaveText('work');
    await expect(items.nth(1).locator('.dot')).toHaveCount(1); // the unsaved one
    await expect(items.last().locator('.chk svg')).toHaveCount(1); // the active one
    await items.first().click();
    expect(await activeLabel(page)).toBe('work');
    await expect(strip(page)).not.toHaveClass(/fl/);
    await expect(strip(page)).toHaveClass(/fr/);
    // closing tabs until they fit again hides the button
    for (let i = 0; i < 9; i++) {
      await tabs(page).last().click();
      await page.keyboard.press('Meta+w');
      const ask = page.getByRole('alertdialog');
      if (await ask.count()) await ask.getByRole('button', { name: 'Не сохранять' }).click();
    }
    await expect(more(page)).toHaveCount(0);
  });

  test('a second over a file tab shows its full path on disk, with .org', async ({ page }) => {
    await open(page);
    await tabs(page).first().hover();
    await page.waitForTimeout(500);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await expect(page.getByRole('tooltip')).toHaveText('/mock/work.org', { timeout: 2000 });
    await page.mouse.move(5, 400);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('⌘T opens a new untitled tab even when there is no free room for a double click', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Meta+t');
    expect(await labels(page)).toEqual(['work', 'Без названия']);
    expect(await page.evaluate(() => !!document.activeElement?.closest('.cm-editor'))).toBe(true);
  });
});

test.describe('narrow panes', () => {
  const LONG = '/mock/Команда/Платформа/Регулярные встречи/Сергей Белов.org';
  const narrow = async (page: Page, files: Record<string, string>, row: string) => {
    await page.setViewportSize({ width: 1000, height: 700 });
    await open(page, files);
    await page.getByRole('button', { name: 'Второй редактор' }).click();
    await navRowAny(page, row).click();
  };
  const navRowAny = (page: Page, label: string) => page.locator(`.nav .row[data-key$="/${label}.org"]`);
  const fits = (loc: ReturnType<Page['locator']>) => loc.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);

  test('the status path loses whole folders from the start; the file name stays, without .org', async ({ page }) => {
    await narrow(page, { ...FILES(), [LONG]: '* Встреча\n' }, 'Сергей Белов');
    const where = panes(page).nth(1).locator('.status .where');
    await expect(where).toContainText('Сергей Белов');
    const t = await where.innerText();
    expect(t).not.toContain('.org');
    expect(t === 'Команда/Платформа/Регулярные встречи/Сергей Белов' || t.startsWith('…/') || t === 'Сергей Белов').toBe(true);
    expect(t).not.toBe('Команда/Платформа/Регулярные встречи/Сергей Белов'); // it is a narrow pane
    expect(await fits(where)).toBe(true);
    const st = panes(page).nth(1).locator('.status');
    await expect(st).toContainText('Стр. 1');
    await expect(st).toContainText('Сохранено');
  });

  test('a very long name pushes out UTF-8 first, then Org; the cursor and the save state stay', async ({ page }) => {
    const name = 'Очень длинное название заметки про ретроспективу команды платформы';
    await narrow(page, { ...FILES(), [`/mock/${name}.org`]: '* Ретро\n' }, name);
    const st = panes(page).nth(1).locator('.status');
    await expect(st).not.toContainText('UTF-8');
    await expect(st).toContainText('Стр. 1');
    await expect(st).toContainText('Сохранено');
  });

  test('the untitled bar drops the whole hint, never cutting it; "Не сохранено" and the button stay', async ({ page }) => {
    await narrow(page, FILES(), 'journal');
    await page.keyboard.press('Meta+t');
    const bar = panes(page).nth(1).locator('.unsaved');
    await expect(bar).toContainText('Не сохранено');
    await expect(bar.getByRole('button', { name: 'Сохранить как…' })).toBeVisible();
    await expect(bar).not.toContainText('Файл появится');
    expect(await fits(bar)).toBe(true);
    // a wide pane has room for all of it
    await page.getByRole('button', { name: 'Второй редактор' }).click();
    await page.setViewportSize({ width: 1500, height: 700 });
    await tabs(page).filter({ hasText: 'Без названия' }).click();
    await expect(panes(page).nth(0).locator('.unsaved')).toContainText('Файл появится на диске после «Сохранить как…»');
    await expect(panes(page).nth(0).locator('.unsaved')).toContainText('⌘S');
  });
});

test.describe('inspector', () => {
  test('a heading without a status offers "Сделать задачей", not "Выполнено"; a final one offers "Вернуть в работу"', async ({ page }) => {
    await open(page);
    await page.locator('.cm-line', { hasText: 'Q4 2026' }).click();
    const insp = page.locator('.insp');
    await expect(insp.getByRole('button', { name: 'Выполнено' })).toHaveCount(0);
    await insp.getByRole('button', { name: 'Сделать задачей' }).click();
    await expect(page.locator('.cm-line', { hasText: 'Q4 2026' })).toContainText('TODO');
    await insp.getByRole('button', { name: 'Выполнено' }).click();
    await expect(page.locator('.cm-line', { hasText: 'Q4 2026' })).toContainText('DONE');
    await expect(insp.getByRole('button', { name: 'Вернуть в работу' })).toBeVisible();
  });

  test('state and priority are grey plates with a chevron', async ({ page }) => {
    await open(page);
    await page.locator('.cm-line', { hasText: 'Бюджет' }).click();
    const pick = page.locator('.insp select').first();
    expect(await pick.evaluate((el) => [getComputedStyle(el).appearance || getComputedStyle(el).webkitAppearance, getComputedStyle(el).height, getComputedStyle(el).borderRadius])).toEqual(['none', '24px', '6px']);
    await expect(page.locator('.insp .plate .chev')).toHaveCount(2);
  });
});
