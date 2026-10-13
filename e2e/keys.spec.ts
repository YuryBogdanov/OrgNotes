import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, openSettingsSheet } from './tauriMock';

// ТЗ «Настройки: раздел „Клавиши“»: the list of commands, recording (one press, a chord, removing), clashes,
// the two sets, and a changed shortcut working at once in the window and the editor.

const WORK = '#+TITLE: Работа\n\n* TODO Подготовить бюджет 2027\nТекст под заголовком.\n* Идеи\n';
const FILES = () => ({ '/mock/work.org': WORK, '/mock/zz.org': '* Дневник\n' });

async function open(page: Page, init?: () => void) {
  await installTauriMock(page, FILES());
  if (init) await page.addInitScript(init);
  await page.goto('/');
  await expect(page.locator('.cm-content')).toContainText('Подготовить бюджет');
}
const keysSheet = async (page: Page) => {
  await openSettingsSheet(page, 'Клавиши');
  await expect(page.locator('.keys')).toBeVisible();
};
const row = (page: Page, id: string) => page.locator(`[data-cmd="${id}"]`);
const chips = (page: Page, id: string) => row(page, id).locator('.chip');
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Настройки' });
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('keys') ?? 'null'));
const onHeading = async (page: Page, text: string) => {
  await page.locator('.cm-line', { hasText: text }).click();
  await page.keyboard.press('End');
};

test.describe('the list', () => {
  test('every command by groups, with its shortcuts; the review row tells what ⌘1 does elsewhere', async ({ page }) => {
    await open(page);
    await keysSheet(page);
    await expect(sheet(page).locator('.gt')).toHaveText(['ГЛОБАЛЬНЫЕ', 'ПРИЛОЖЕНИЕ И ОКНО', 'ФАЙЛ И ВКЛАДКИ', 'ПОИСК', 'ВИД И ПАНЕЛИ', 'ПЕРЕХОДЫ', 'ЗАГОЛОВКИ И ЗАДАЧИ', 'БЫСТРЫЙ ВВОД', 'МИНИ-ОКНО', 'СЕГОДНЯ', 'КАЛЕНДАРЬ', 'КАНБАН', 'ДОСКА', 'ЦЕЛИ КВАРТАЛА', 'INBOX']); // the plugins' groups: their names, in the order of the plugins
    await expect(chips(page, 'capture')).toHaveText(['⇧⌘I']);
    await expect(chips(page, 'findNext')).toHaveText(['⌘G']);
    await expect(chips(page, 'searchPrev')).toHaveText(['⌥⇧⌘G']);
    await expect(chips(page, 'openFolder')).toHaveText(['Назначить']);
    await expect(chips(page, 'schedule')).toHaveText(['⌃C S']);
    await expect(row(page, 'schedule').locator('.sub')).toHaveText('Аккорд: ⌃C, затем S');
    await expect(row(page, 'inbox.done').locator('.sub')).toHaveText('Вне разбора ⌘1 — «Заметки»');
    await expect(sheet(page).locator('.group').filter({ hasText: 'ЗАГОЛОВКИ И ЗАДАЧИ' }).locator('.gn')).toHaveText('в редакторе, курсор на заголовке');
    await expect(sheet(page).locator('details.fixed summary')).toHaveText('НЕ НАСТРАИВАЮТСЯ');
  });

  test('search: by the name and synonyms, by a shortcut in symbols or words; empty groups go', async ({ page }) => {
    await open(page);
    await keysSheet(page);
    const search = page.getByRole('textbox', { name: 'Команда или сочетание' });
    const shown = () => sheet(page).locator('.row .name > span:first-child').allInnerTexts();
    await search.fill('найти далее');
    expect(await shown()).toEqual(['Найти далее']);
    await expect(sheet(page).locator('.gt')).toHaveText(['ПОИСК']);
    await search.fill('⌘G');
    expect(await shown()).toEqual(['Найти далее']);
    await search.fill('cmd g');
    expect(await shown()).toEqual(['Найти далее']);
    await search.fill('refile');
    expect(await shown()).toEqual(['Перенести в другой файл…']);
    await search.fill('ничегонет');
    await expect(sheet(page).getByText('Ничего не найдено')).toBeVisible();
    await page.keyboard.press('Escape'); // the query first
    await expect(search).toHaveValue('');
    await expect(sheet(page)).toBeVisible();
  });
});

test.describe('recording', () => {
  test('«+» adds a second shortcut: a dot and ↺; it works at once and is kept after a restart', async ({ page }) => {
    await open(page);
    await keysSheet(page);
    await row(page, 'paletteGoto').hover();
    await row(page, 'paletteGoto').getByRole('button', { name: 'Добавить сочетание: Перейти к файлу…' }).click();
    await expect(row(page, 'paletteGoto').locator('.chip.rec')).toHaveText('Нажмите сочетание…');
    await expect(row(page, 'paletteGoto').locator('.hint')).toHaveText('Нажмите сочетание · можно аккорд, например ⌃C, затем S · ⎋ отмена · ⌫ убрать сочетание');
    await page.keyboard.press('Meta+p');
    await expect(chips(page, 'paletteGoto')).toHaveText(['⇧⌘O', '⌘P']);
    await expect(row(page, 'paletteGoto').locator('.dot')).toHaveClass(/on/);
    await expect(sheet(page).locator('.info')).toContainText('Изменено: 1.');
    expect(await stored(page)).toEqual({ preset: 'emacs', overrides: { paletteGoto: ['⇧⌘O', '⌘P'] } });
    await page.getByRole('button', { name: 'Готово' }).click();
    await page.keyboard.press('Meta+p');
    await expect(page.locator('.pal')).toBeVisible();
    await expect(page.locator('.pal input')).toHaveAttribute('placeholder', /файл/i);
    await page.keyboard.press('Escape');
    await page.reload();
    await keysSheet(page);
    await expect(chips(page, 'paletteGoto')).toHaveText(['⇧⌘O', '⌘P']);
    await row(page, 'paletteGoto').getByRole('button', { name: 'Вернуть по умолчанию: Перейти к файлу…' }).click();
    await expect(chips(page, 'paletteGoto')).toHaveText(['⇧⌘O']);
    await expect(row(page, 'paletteGoto').locator('.dot')).not.toHaveClass(/on/);
  });

  test('a click on a chip records over it; ⎋ cancels, ⌫ removes; the system and plain letters are refused', async ({ page }) => {
    await open(page);
    await keysSheet(page);
    await row(page, 'jumpBar').getByRole('button', { name: 'Изменить сочетание ⌃⌘J' }).click();
    await page.keyboard.press('Escape');
    await expect(chips(page, 'jumpBar')).toHaveText(['⌃⌘J']);
    await expect(sheet(page)).toBeVisible(); // ⎋ was the recording's
    await row(page, 'jumpBar').getByRole('button', { name: 'Изменить сочетание ⌃⌘J' }).click();
    await page.keyboard.press('Meta+q');
    await expect(row(page, 'jumpBar').locator('.hint.err')).toHaveText('Это сочетание занято macOS');
    await page.keyboard.press('Shift+k');
    await expect(row(page, 'jumpBar').locator('.hint.err')).toHaveText('Нужна хотя бы одна из клавиш ⌘, ⌥ или ⌃');
    await page.keyboard.press('F6'); // F-keys alone are fine
    await expect(chips(page, 'jumpBar')).toHaveText(['F6']);
    await row(page, 'jumpBar').getByRole('button', { name: 'Изменить сочетание F6' }).click();
    await page.keyboard.press('Backspace');
    await expect(chips(page, 'jumpBar')).toHaveText(['Назначить']);
    expect((await stored(page)).overrides.jumpBar).toEqual([]);
  });

  test('a chord: ⌃ and then a key within a second; ⌃ alone waits a second and stays one press', async ({ page }) => {
    await open(page);
    await keysSheet(page);
    await page.getByRole('radio', { name: 'Как в macOS' }).click();
    await expect(chips(page, 'tags')).toHaveText(['Назначить']);
    await chips(page, 'tags').click();
    await page.keyboard.press('Control+c');
    await expect(row(page, 'tags').locator('.chip.rec')).toHaveText('⌃C …');
    await page.keyboard.press('g');
    await expect(chips(page, 'tags')).toHaveText(['⌃C G']);
    await expect(row(page, 'tags').locator('.sub')).toHaveText('Аккорд: ⌃C, затем G');
    await chips(page, 'outline').click();
    await page.keyboard.press('Control+Alt+o');
    await expect(chips(page, 'outline')).toHaveText(['⌃⌥O'], { timeout: 3000 });
    // the chord works in the editor, on a heading
    await page.getByRole('button', { name: 'Готово' }).click();
    await onHeading(page, 'Подготовить бюджет');
    await page.keyboard.press('Control+c');
    await page.keyboard.press('g');
    await expect(page.locator('.pal input')).toHaveAttribute('placeholder', 'Теги через пробел');
  });
});

test.describe('clashes', () => {
  test('a shortcut taken where both work asks; «Заменить» moves it, «Отмена» changes nothing', async ({ page }) => {
    await open(page);
    await keysSheet(page);
    await chips(page, 'refile').click();
    await page.keyboard.press('Meta+e');
    const warn = row(page, 'refile').locator('.warn');
    await expect(warn).toContainText('⌘E уже назначено команде «Искать выделенное» (Поиск). Назначить здесь и снять там?');
    await expect(row(page, 'refile').locator('.chip.bad')).toHaveText('⌘E');
    await warn.getByRole('button', { name: 'Отмена' }).click();
    await expect(chips(page, 'refile')).toHaveText(['⌃C ⌃W']);
    await expect(chips(page, 'useSelection')).toHaveText(['⌘E']);
    await chips(page, 'refile').click();
    await page.keyboard.press('Meta+e');
    await warn.getByRole('button', { name: 'Заменить' }).click();
    await expect(chips(page, 'refile')).toHaveText(['⌘E']);
    await expect(chips(page, 'useSelection')).toHaveText(['Назначить']);
    await expect(row(page, 'useSelection').locator('.dot')).toHaveClass(/on/);
    await expect(sheet(page).locator('.info')).toContainText('Изменено: 2.');
  });

  test('⌘1 in the review and in the window is not a clash; a first press of a chord is', async ({ page }) => {
    await open(page);
    await keysSheet(page);
    await chips(page, 'inbox.skip').click();
    await page.keyboard.press('Meta+n'); // «Новый файл» outside the review: nested, fine
    await expect(chips(page, 'inbox.skip')).toHaveText(['⌘N']);
    await expect(row(page, 'inbox.skip').locator('.warn')).toHaveCount(0);
    // but «Отменить» of the review has ⌘2 too: the same scope (the goals' review has its own: no clash, ТЗ 28)
    await chips(page, 'inbox.done').click();
    await page.keyboard.press('Meta+2');
    await expect(row(page, 'inbox.done').locator('.warn')).toContainText('⌘2 уже назначено команде «Разбор: Отменить» (Inbox)');
    await row(page, 'inbox.done').getByRole('button', { name: 'Отмена' }).click();
    await chips(page, 'find').click();
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(1200); // no second press: ⌃C alone, which begins the chords of the headings
    await expect(row(page, 'find').locator('.warn')).toContainText('⌃C пересекается с аккордом');
  });
});

test.describe('sets and reset', () => {
  test('«Как в Emacs» gives the ⌃C chords, «Как в macOS» none; «Сбросить все» asks and keeps the set', async ({ page }) => {
    await open(page);
    await keysSheet(page);
    await expect(chips(page, 'status')).toHaveText(['⌃C ⌃T']);
    await chips(page, 'find').click();
    await page.keyboard.press('Meta+Shift+k');
    await page.getByRole('radio', { name: 'Как в macOS' }).click();
    await expect(chips(page, 'status')).toHaveText(['Назначить']);
    await expect(chips(page, 'find')).toHaveText(['⇧⌘K']); // a change stays over the set
    await page.getByRole('button', { name: 'Сбросить все' }).click();
    const dlg = page.getByRole('alertdialog', { name: 'Сбросить сочетания' });
    await expect(dlg).toContainText('Вернуть все сочетания по умолчанию для набора «Как в macOS»?');
    await expect(dlg).toContainText('Изменено: 1.');
    await dlg.getByRole('button', { name: 'Сбросить' }).click();
    await expect(chips(page, 'find')).toHaveText(['⌘F']);
    await expect(page.getByRole('radio', { name: 'Как в macOS' })).toHaveAttribute('aria-checked', 'true');
    expect(await stored(page)).toEqual({ preset: 'mac', overrides: {} });
  });

  test('Emacs chords in the editor: ⌃C ⌃T the statuses, ⌃C S the date; off a heading they do nothing', async ({ page }) => {
    await open(page);
    await onHeading(page, 'Подготовить бюджет');
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+t');
    await expect(page.locator('.pal .tok')).toHaveCount(0);
    await expect(page.locator('.pal')).toContainText('DONE');
    await page.keyboard.press('Escape');
    await onHeading(page, 'Подготовить бюджет');
    await page.keyboard.press('Control+c');
    await page.keyboard.press('s');
    await expect(page.locator('.pal .tok')).toHaveText('Запланировать');
    await page.keyboard.press('Escape');
    await page.locator('.cm-line', { hasText: 'Текст под заголовком' }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Control+c');
    await page.keyboard.press('x'); // a chord that means nothing: not typed either
    await expect(page.locator('.cm-line', { hasText: 'Текст под заголовком' })).toHaveText('Текст под заголовком.');
  });
});

test('a changed shortcut shows in tooltips and the palette at once', async ({ page }) => {
  await open(page);
  await keysSheet(page);
  await chips(page, 'back').click();
  await page.keyboard.press('Meta+Alt+u'); // ⌥⌘B is the board's (the plugin «Канбан»)
  await chips(page, 'paletteNewFile').click();
  await page.keyboard.press('Meta+Alt+n');
  await page.getByRole('button', { name: 'Готово' }).click();
  await expect(page.locator('.toolbar').getByRole('button', { name: 'Назад (⌥⌘U)' })).toBeVisible();
  await page.keyboard.press('Shift+Meta+p');
  await expect(page.locator('.pal .row').filter({ hasText: 'Создать файл…' }).locator('.key')).toHaveText('⌥⌘N');
});
