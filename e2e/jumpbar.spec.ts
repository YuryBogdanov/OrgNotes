import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// ТЗ «Строка пути и переход с клавиатуры».
const R = '/mock/Работа/Планирование/2026/';
const FILES = () => ({
  [R + 'work.org']: '* Q4 2026\n** TODO Бюджет\nтекст\n',
  [R + 'journal.org']: '* Октябрь\n** Итоги\nстрока три\n',
  '/mock/Работа/Планирование/2025/итоги.org': '* Итоги года\n',
  '/mock/Работа/Проекты/портал.org': '* Портал\n',
  '/mock/Работа/Протоколы/планёрка.org': '* Планёрка\n',
  '/mock/Работа/Ёлка/праздник.org': '* Праздник\n',
  '/mock/Личное/список.org': '* Список\n',
  '/mock/inbox.org': '* Входящие\n',
});
const open = async (page: Page) => {
  await installTauriMock(page, FILES());
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.locator(`.nav .row[data-key="${R}work.org"]`).click();
  await page.locator('section.pane .cm-line', { hasText: 'Бюджет' }).click();
};
const jb = (page: Page) => page.getByRole('navigation', { name: 'Путь к файлу' });
const seg = (page: Page, i: number) => jb(page).locator(`[data-seg="${i}"]`);
const menus = (page: Page) => jb(page).locator('.menu');
const items = (m: ReturnType<Page['locator']>) => m.locator(':scope > .item .nm');
const on = (page: Page) => jb(page).locator('.item.on > .nm').last();
const status = (page: Page) => page.locator('section.pane.active .status').innerText();
const enter = (page: Page) => page.keyboard.press('Control+Meta+j');
/** The submenu is really seen: beside its menu, and the topmost thing at its first item's centre (not clipped). */
const submenuShown = (page: Page) =>
  page.evaluate(() => {
    const [top, sub] = [...document.querySelectorAll('.jb .menu')] as HTMLElement[];
    const it = sub?.querySelector('.item');
    if (!top || !sub || !it) return false;
    const a = top.getBoundingClientRect();
    const r = it.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.left >= a.right - 1 && !!hit && it.contains(hit);
  });
/** Letters as a keyboard with that layout sends them (Playwright inserts non-Latin text without key events). */
const typeKeys = (page: Page, text: string) =>
  page.evaluate((t) => {
    for (const ch of t) document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
  }, text);

test.describe('the segments', () => {
  test('⌃⌘J puts a ring on the file segment with a hint; Esc goes back to the caret', async ({ page }) => {
    await open(page);
    await page.keyboard.press('End');
    await expect(jb(page).locator('.seg span')).toHaveText(['Работа', 'Планирование', '2026', 'work']);
    await enter(page);
    await expect(seg(page, 3)).toBeFocused();
    await expect(seg(page, 3)).toHaveClass(/ring/);
    await expect(seg(page, 3)).toHaveCSS('box-shadow', /2px/);
    await expect(jb(page).locator('.hint')).toHaveText('← → сегменты · ↓ или ↩ меню · Esc вернуться в текст');
    await page.keyboard.press('Escape');
    await expect(jb(page).locator('.hint')).toHaveCount(0);
    await page.keyboard.type('!');
    await expect(page.locator('section.pane .cm-line', { hasText: 'Бюджет' })).toHaveText('** TODO Бюджет!');
  });

  test('← → move without going round, Home and End jump; ↓ and ↩ open the menu', async ({ page }) => {
    await open(page);
    await enter(page);
    await page.keyboard.press('ArrowRight'); // already the last
    await expect(seg(page, 3)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(seg(page, 2)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(seg(page, 0)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(seg(page, 0)).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowDown');
    await expect(items(menus(page).first())).toHaveText(['journal', 'work']);
    await page.keyboard.press('Escape');
    await expect(menus(page)).toHaveCount(0);
    await expect(seg(page, 3)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(menus(page)).toHaveCount(1);
  });
});

test.describe('the menus', () => {
  test('the file segment: everything in its folder, the current one checked and lit first', async ({ page }) => {
    await open(page);
    await enter(page);
    await page.keyboard.press('ArrowDown');
    const m = menus(page).first();
    await expect(m.locator('.item').filter({ hasText: 'work' }).locator('.chk')).toHaveText('✓');
    await expect(on(page)).toHaveText('work');
    await page.keyboard.press('ArrowUp');
    await expect(on(page)).toHaveText('journal');
    await page.keyboard.press('ArrowUp'); // no going round
    await expect(on(page)).toHaveText('journal');
  });

  test('a folder segment: everything in the folder that holds it; → opens a folder, ← closes it, Esc one level at a time', async ({ page }) => {
    await open(page);
    await enter(page);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowDown'); // «2026»
    await expect(items(menus(page).first())).toHaveText(['2025', '2026']);
    await expect(on(page)).toHaveText('2026');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowRight');
    await expect(menus(page)).toHaveCount(2);
    await expect(items(menus(page).nth(1))).toHaveText(['итоги']);
    expect(await submenuShown(page)).toBe(true);
    await page.keyboard.press('ArrowLeft');
    await expect(menus(page)).toHaveCount(1);
    await expect(on(page)).toHaveText('2025');
    await page.keyboard.press('Enter'); // a folder: its contents, like →
    await expect(menus(page)).toHaveCount(2);
    await page.keyboard.press('ArrowRight'); // on a file: nothing
    await expect(menus(page)).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(menus(page)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(menus(page)).toHaveCount(0);
    await expect(seg(page, 2)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('section.pane .cm-content')).toBeFocused();
  });

  test('folders and files together: folders (with ›) first, a line, then files, each by name; the filter looks at both', async ({ page }) => {
    await installTauriMock(page, {
      '/mock/Работа/Планирование/план.org': '* План\n** TODO Бюджет\n',
      '/mock/Работа/Планирование/Архив/старое.org': '* Старое\n',
      '/mock/Работа/Планирование/Встречи/планёрка.org': '* Планёрка\n',
      '/mock/Работа/Планирование/бюджет.org': '* Бюджет\n',
      '/mock/Работа/итоги.org': '* Итоги\n',
      '/mock/Работа/Команды/цели.org': '* Цели\n',
    });
    await page.goto('/');
    await expect(page.locator('.cm-content').first()).toBeVisible();
    await page.locator('.nav .row[data-key="/mock/Работа/Планирование/план.org"]').click();
    await page.locator('section.pane .cm-line', { hasText: 'Бюджет' }).click();
    await enter(page);
    await page.keyboard.press('ArrowDown'); // the file «план»: its folder has five things — two folders, three files
    const m = menus(page).first();
    await expect(items(m)).toHaveText(['Архив', 'Встречи', 'бюджет', 'план']);
    await expect(m.locator(':scope > .line')).toHaveCount(1);
    expect(await m.locator(':scope > *').evaluateAll((els) => els.map((e) => (e.classList.contains('line') ? '—' : e.querySelector('.nm')?.textContent)))).toEqual(['Архив', 'Встречи', '—', 'бюджет', 'план']);
    await expect(m.locator('.item', { hasText: 'Архив' }).locator('.more')).toHaveCount(1); // a folder opens a submenu
    await expect(m.locator('.item', { hasText: 'бюджет' }).locator('.more')).toHaveCount(0);
    await expect(on(page)).toHaveText('план');
    // a folder segment: everything in «Работа» — its folders and its own file
    await page.keyboard.press('ArrowLeft');
    await expect(items(menus(page).first())).toHaveText(['Команды', 'Планирование', 'итоги']);
    await expect(on(page)).toHaveText('Планирование');
    // the filter looks at folders and files alike, the line only where both are left
    await typeKeys(page, 'и');
    await expect(items(menus(page).first())).toHaveText(['Планирование', 'итоги']);
    await expect(menus(page).first().locator(':scope > .line')).toHaveCount(1);
    await typeKeys(page, 'т');
    await expect(items(menus(page).first())).toHaveText(['итоги']);
    await expect(menus(page).first().locator(':scope > .line')).toHaveCount(0);
    await page.keyboard.press('Enter'); // a file from the menu of a folder segment opens
    await expect(page.locator('section.pane.active .tab.active, section.pane .tab[aria-selected="true"]').first()).toContainText('итоги');
  });

  test('← → on a top menu go to the neighbour segment\'s menu', async ({ page }) => {
    await open(page);
    await enter(page);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown'); // «Работа»: everything at the top, folders then files
    await expect(items(menus(page).first())).toHaveText(['Личное', 'Работа', 'inbox']);
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown'); // «Планирование»
    await expect(items(menus(page).first())).toHaveText(['Планирование', 'Проекты', 'Протоколы', 'Ёлка'].sort((a, b) => a.localeCompare(b, 'ru')));
    await page.keyboard.press('ArrowLeft'); // to «Работа»'s menu, without closing
    await expect(menus(page)).toHaveCount(1);
    await expect(items(menus(page).first())).toHaveText(['Личное', 'Работа', 'inbox']);
    await expect(seg(page, 0)).toHaveClass(/open/);
  });

  test('typing filters: substring, any case, ё = е, the match bold and underlined; nothing found does nothing', async ({ page }) => {
    await open(page);
    await enter(page);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowDown'); // «Планирование» and its neighbours
    await expect(menus(page).first().locator('.keys')).toHaveCount(0); // no hint without a filter
    await typeKeys(page, 'ПРО');
    const m = menus(page).first();
    await expect(m.locator('.filter')).toContainText('ПРО');
    await expect(items(m)).toHaveText(['Проекты', 'Протоколы']);
    await expect(m.locator('.item').first().locator('b')).toHaveText('Про');
    await expect(m.locator('.item').first().locator('b')).toHaveCSS('text-decoration-line', 'underline');
    await expect(on(page)).toHaveText('Проекты');
    await expect(m.locator('.keys')).toHaveText('↑↓ выбор · ↩ открыть · → вложенная папка · Esc закрыть');
    await page.keyboard.press('Backspace');
    await expect(m.locator('.filter')).toContainText('ПР');
    await page.keyboard.press('Meta+Backspace');
    await expect(m.locator('.filter')).toHaveCount(0);
    await typeKeys(page, 'елка');
    await expect(items(m)).toHaveText(['Ёлка']);
    await page.keyboard.press('Alt+Backspace');
    await typeKeys(page, 'щщ');
    await expect(m.locator('.item.none')).toHaveText('Ничего не найдено');
    await page.keyboard.press('Enter');
    await expect(menus(page)).toHaveCount(1);
  });

  test('a submenu has its own filter, empty at first', async ({ page }) => {
    await open(page);
    await enter(page);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await typeKeys(page, 'раб');
    await page.keyboard.press('ArrowRight');
    await expect(menus(page)).toHaveCount(2);
    await expect(menus(page).nth(1).locator('.filter')).toHaveCount(0);
    await expect(items(menus(page).nth(1))).toHaveText(['Планирование', 'Проекты', 'Протоколы', 'Ёлка'].sort((a, b) => a.localeCompare(b, 'ru')));
  });
});

test.describe('opening a file', () => {
  test('↩ opens it in the active pane with the focus in its text; the path follows', async ({ page }) => {
    await open(page);
    await enter(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp'); // journal
    await page.keyboard.press('Enter');
    await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('journal');
    await expect(page.locator('section.pane.active .cm-content')).toBeFocused();
    await expect(jb(page).locator('.seg span').last()).toHaveText('journal');
    await expect(page.locator('section.pane.active .tab')).toHaveCount(1); // retargeted, as from the navigator
  });

  test('a file deep in another folder, through submenus', async ({ page }) => {
    await open(page);
    await enter(page);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await typeKeys(page, 'лич');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('список');
    await expect(jb(page).locator('.seg span')).toHaveText(['Личное', 'список']);
  });

  test('⌥↩ opens it in the neighbour pane, which is made if there is none', async ({ page }) => {
    await open(page);
    await enter(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Alt+Enter');
    await expect(page.locator('section.pane')).toHaveCount(2);
    await expect(page.locator('section.pane').nth(1).locator('.tab.on .lbl')).toHaveText('journal');
    await expect(page.locator('section.pane').nth(1)).toHaveClass(/active/);
    await expect(page.locator('section.pane').nth(0).locator('.tab.on .lbl')).toHaveText('work');
  });

  test('a tab with unsaved text stays; the file comes in a new tab, no question', async ({ page }) => {
    await open(page);
    // edits that cannot reach the disk: the tab stays «with edits»
    await page.evaluate((p) => ((window as any).__failWrites = [p]), R + 'work.org');
    await page.keyboard.press('End');
    await page.keyboard.type(' правка');
    await expect(page.locator('section.pane .tab.on')).toHaveClass(/dirty/);
    await page.waitForTimeout(700);
    await enter(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page.locator('section.pane .tab .lbl')).toHaveText(['work', 'journal']);
    await expect(page.locator('section.pane .tab.on .lbl')).toHaveText('journal');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('a file open in the other pane: that pane becomes active, no second copy', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Второй редактор' }).click();
    await page.locator(`.nav .row[data-key="${R}journal.org"]`).click(); // right: journal
    await page.locator('section.pane').nth(0).locator('.cm-content').click(); // left: work
    await enter(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page.locator('section.pane').nth(1)).toHaveClass(/active/);
    await expect(page.locator('section.pane').nth(0).locator('.tab .lbl')).toHaveText(['work']);
  });

  test('the caret goes back where it was in that file', async ({ page }) => {
    await open(page);
    await page.locator(`.nav .row[data-key="${R}journal.org"]`).click();
    await page.locator('section.pane .cm-line', { hasText: 'строка три' }).click();
    await page.keyboard.press('End');
    await page.locator(`.nav .row[data-key="${R}work.org"]`).click();
    await page.locator('section.pane .cm-line', { hasText: 'Бюджет' }).click();
    await enter(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect.poll(() => status(page)).toContain('Стр. 3, кол. 11');
    await page.keyboard.type('!');
    await expect(page.locator('section.pane .cm-line', { hasText: 'строка три' })).toHaveText('строка три!');
  });
});

test.describe('the mouse', () => {
  test('a click opens a menu, hovering a folder opens it, a click on a file opens the file, a click outside closes', async ({ page }) => {
    await open(page);
    await seg(page, 2).click();
    await expect(items(menus(page).first())).toHaveText(['2025', '2026']);
    await menus(page).first().locator('.item').filter({ hasText: '2025' }).first().hover();
    await expect(items(menus(page).nth(1))).toHaveText(['итоги']);
    expect(await submenuShown(page)).toBe(true);
    await menus(page).nth(1).locator('.item').first().click();
    await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('итоги');
    await seg(page, 0).click();
    await expect(menus(page)).toHaveCount(1);
    await page.mouse.click(700, 500);
    await expect(menus(page)).toHaveCount(0);
  });
});
