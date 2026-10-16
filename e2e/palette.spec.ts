import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, pluginsReady } from './tauriMock';
import { diskAll as disk, palette as pal } from './helpers';

// The command palette (ТЗ «Командная палитра»).
const WORK = '#+TITLE: Работа\n\n* Q4 2026\n** TODO [#A] Подготовить бюджет 2027 :budget:finance:\nDEADLINE: <2026-10-24 Сб> SCHEDULED: <2026-10-14 Ср>\nСвести заявки.\n*** DONE Собрать заявки\n** NEXT План найма\n';
const FILES = () => ({
  '/mock/work.org': WORK,
  '/mock/journal.org': '* Октябрь\n',
  '/mock/Команда/Рост/Сергей Белов.org': '* 1:1\n',
});

const open = async (page: Page, files: Record<string, string> = FILES()) => {
  await installTauriMock(page, files);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await pluginsReady(page); // «Добавить цели…» of the goals' plugin is in the list
  await page.locator('.nav .row[data-key="/mock/work.org"]').click();
  await expect(page.locator('.cm-content').first()).toContainText('Q4 2026');
};
const field = (page: Page) => pal(page).getByRole('combobox');
const rows = (page: Page) => pal(page).locator('.row');
const titles = (page: Page) => pal(page).locator('.row .t').allInnerTexts();
const groups = (page: Page) => pal(page).locator('.gh').allInnerTexts();
const selected = (page: Page) => pal(page).locator('.row.on .t');
const at = async (page: Page, text: string) => {
  await page.locator('.cm-line', { hasText: text }).first().click();
};
const palette = (page: Page) => page.keyboard.press('Shift+Meta+p');

test.describe('opening and closing', () => {
  test('⇧⌘P opens with the focus in an empty field; ⇧⌘P and Esc close; the focus goes back to the caret', async ({ page }) => {
    await open(page);
    await at(page, 'План найма');
    await page.keyboard.press('End');
    await palette(page);
    await expect(pal(page)).toBeVisible();
    await expect(field(page)).toBeFocused();
    await expect(field(page)).toHaveValue('');
    await expect(field(page)).toHaveAttribute('placeholder', 'Команда или файл…');
    await expect(pal(page).locator('.field kbd')).toHaveText('⇧⌘P');
    await palette(page);
    await expect(pal(page)).toHaveCount(0);
    await palette(page);
    await page.keyboard.type('соз');
    await page.keyboard.press('Escape');
    await expect(pal(page)).toHaveCount(0);
    await page.keyboard.type('!');
    await expect(page.locator('.cm-line', { hasText: 'План найма' })).toHaveText('** NEXT План найма!');
  });

  test('a click on the dim closes it and does not reach the window', async ({ page }) => {
    await open(page);
    await palette(page);
    await page.mouse.click(100, 400); // over the navigator
    await expect(pal(page)).toHaveCount(0);
    await expect(page.locator('.nav .row[data-key="/mock/journal.org"]')).not.toHaveClass(/sel/);
  });

  test('640 wide, 84 from the top, rounded 14', async ({ page }) => {
    await open(page);
    await palette(page);
    const b = (await pal(page).boundingBox())!;
    expect(Math.round(b.width)).toBe(640);
    expect(Math.round(b.y)).toBe(84);
    await expect(pal(page)).toHaveCSS('border-radius', '14px');
  });
});

test.describe('modes', () => {
  test('on a heading: its plate, then «К ЗАГОЛОВКУ» and «ОБЩИЕ»', async ({ page }) => {
    await open(page);
    await at(page, 'Подготовить бюджет');
    await palette(page);
    const plate = pal(page).locator('.plate');
    await expect(plate).toContainText('Действия применятся к заголовку');
    await expect(plate.locator('.kw')).toHaveText('TODO');
    await expect(plate).toContainText('[#A] Подготовить бюджет 2027');
    await expect(plate.locator('.right')).toHaveText('work · строка 4');
    expect(await groups(page)).toEqual(['К ЗАГОЛОВКУ', 'ОБЩИЕ']);
    expect(await titles(page)).toEqual(['Сменить статус…', 'Запланировать…', 'Поставить дедлайн…', 'Теги…', 'Добавить заметку…', 'Копировать ссылку на заголовок', 'Перенести в другой файл…', 'Создать файл…', 'Создать папку…', 'Новая задача', 'Перейти к файлу…', 'Показать структуру файла', 'Оформленный текст', 'Навигатор: свернуть всё', 'Навигатор: развернуть всё', 'Мини-окно: открыть текущую заметку', 'Мини-окно: показать', 'Открыть «Сегодня»', 'Завершить день…', 'Включить новый интерфейс', 'Настройки…', 'Долгие дела: открыть список', 'Календарь', 'Показать как доску / текст', 'Показать как доску', 'Добавить цели…']); // the plugins' commands after the core's
    await expect(selected(page)).toHaveText('Сменить статус…');
  });

  test('hints show the current state, keys show the shortcut', async ({ page }) => {
    await open(page);
    await at(page, 'Подготовить бюджет');
    await palette(page);
    const row = (t: string) => rows(page).filter({ has: page.locator('.t', { hasText: t }) });
    await expect(row('Сменить статус').locator('.hint')).toHaveText('сейчас TODO');
    await expect(row('Запланировать').locator('.hint')).toHaveText('14 окт');
    await expect(row('Поставить дедлайн').locator('.hint')).toHaveText('24 окт');
    await expect(row('Теги…').locator('.hint')).toHaveText('budget, finance');
    await expect(row('Создать файл').locator('.key')).toHaveText('⇧⌘N');
    await expect(row('Перейти к файлу').locator('.key')).toHaveText('⇧⌘O');
    await expect(row('Новая задача').locator('.hint')).toHaveText('в work');
    await expect(row('Перенести в другой файл').locator('.hint')).toHaveCount(0);
    await expect(row('Перенести в другой файл').locator('.key')).toHaveText('⌃C ⌃W'); // «Как в Emacs»
    await expect(row('Новая задача').locator('.key')).toHaveCount(0);
  });

  test('off a heading: the general plate and no heading group at all', async ({ page }) => {
    await open(page);
    await at(page, '#+TITLE');
    await palette(page);
    await expect(pal(page).locator('.plate')).toContainText('Курсор не на заголовке — доступны только общие действия');
    await expect(pal(page).locator('.plate .right')).toHaveText('work · строка 1');
    expect(await groups(page)).toEqual(['ОБЩИЕ']);
    await page.keyboard.type('статус');
    expect(await titles(page)).toEqual([]);
    await expect(rows(page)).toHaveText(['Ничего не найдено']);
  });

  test('«#» lists the headings of the file and jumps; «@» is an ordinary character', async ({ page }) => {
    await open(page);
    await at(page, '#+TITLE');
    await palette(page);
    await page.keyboard.type('#');
    await expect(pal(page).locator('.plate')).toContainText('Переход к заголовку в текущем файле. Для другого файла уберите «#»');
    await expect(pal(page).locator('.ghost')).toContainText('заголовок');
    expect(await groups(page)).toEqual(['ЗАГОЛОВКИ · work']);
    expect(await titles(page)).toEqual(['Q4 2026', 'Подготовить бюджет 2027', 'Собрать заявки', 'План найма']);
    await expect(selected(page)).toHaveText('Q4 2026'); // the cursor is above every heading
    await page.keyboard.type('найм');
    await page.keyboard.press('Enter');
    await expect(pal(page)).toHaveCount(0);
    await expect(page.locator('.status')).toContainText('Стр. 8');
    await palette(page);
    await page.keyboard.type('@');
    await expect(pal(page).locator('.plate')).toContainText('Действия применятся к заголовку');
    await expect(rows(page)).toHaveText(['Ничего не найдено']);
  });

  test('«№» (Shift+3 on the Russian layout) works as «#»', async ({ page }) => {
    await open(page);
    await at(page, '#+TITLE');
    await palette(page);
    await page.keyboard.type('№');
    await expect(pal(page).locator('.plate')).toContainText('Переход к заголовку в текущем файле');
    await expect(pal(page).locator('.ghost')).toContainText('заголовок');
    await page.keyboard.type('найм');
    expect(await titles(page)).toEqual(['План найма']);
    await page.keyboard.press('Enter');
    await expect(page.locator('.status')).toContainText('Стр. 8');
  });

  test('«#» starts on the heading the cursor is in; progress cookies are not shown', async ({ page }) => {
    await open(page, { ...FILES(), '/mock/work.org': WORK.replace('Подготовить бюджет 2027', 'Подготовить бюджет 2027 [1/3]') });
    await at(page, 'Свести заявки');
    await palette(page);
    await expect(pal(page).locator('.plate .ttl')).toHaveText('[#A] Подготовить бюджет 2027');
    await page.keyboard.type('#');
    await expect(selected(page)).toHaveText('Подготовить бюджет 2027');
  });

  test('no open file: no plate, only what needs no file', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Meta+w');
    await palette(page);
    await expect(pal(page).locator('.plate')).toHaveCount(0);
    expect(await titles(page)).toEqual(['Создать файл…', 'Создать папку…', 'Перейти к файлу…', 'Оформленный текст', 'Навигатор: свернуть всё', 'Навигатор: развернуть всё', 'Мини-окно: показать', 'Открыть «Сегодня»', 'Завершить день…', 'Включить новый интерфейс', 'Настройки…', 'Долгие дела: открыть список', 'Календарь', 'Добавить цели…']); // the plugins' commands after the core's
  });
});

test.describe('search', () => {
  test('fuzzy, case- and ё-blind, matched letters bold; files only for a query', async ({ page }) => {
    await open(page);
    await at(page, '#+TITLE');
    await palette(page);
    await expect(pal(page).locator('.gh', { hasText: 'ФАЙЛЫ' })).toHaveCount(0);
    await page.keyboard.type('СФ');
    await expect(selected(page)).toHaveText('Создать файл…');
    await expect(selected(page).locator('b')).toHaveText(['С', 'ф']);
    await field(page).fill('серге');
    expect(await groups(page)).toEqual(['ФАЙЛЫ']);
    await expect(rows(page).first().locator('.t')).toHaveText('Сергей Белов');
    await expect(rows(page).first().locator('.hint')).toHaveText('Команда/Рост');
    await page.keyboard.press('Enter');
    await expect(page.locator('.tab.on .lbl')).toHaveText('Сергей Белов');
  });

  test('a word start ranks first; synonyms find commands; an unused group hides', async ({ page }) => {
    await open(page);
    await at(page, 'Подготовить бюджет');
    await palette(page);
    await page.keyboard.type('дед');
    expect(await titles(page)).toEqual(['Поставить дедлайн…', 'Долгие дела: открыть список']); // «Д-олгие д-ела»: a fuzzy match, below
    await field(page).fill('теги');
    expect(await titles(page)).toEqual(['Теги…']);
    expect(await groups(page)).toEqual(['К ЗАГОЛОВКУ']);
  });

  test('often used commands rise among equal matches', async ({ page }) => {
    await open(page);
    await palette(page);
    await page.keyboard.type('со');
    expect((await titles(page)).slice(0, 2)).toEqual(['Создать файл…', 'Создать папку…']);
    for (let i = 0; i < 2; i++) {
      await field(page).fill('создать папку');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      await palette(page);
    }
    await field(page).fill('со');
    expect((await titles(page)).slice(0, 2)).toEqual(['Создать папку…', 'Создать файл…']);
  });

  test('nothing found: Enter does nothing and the palette stays', async ({ page }) => {
    await open(page);
    await palette(page);
    await page.keyboard.type('щщщ');
    await expect(rows(page)).toHaveText(['Ничего не найдено']);
    await page.keyboard.press('Enter');
    await expect(pal(page)).toBeVisible();
  });
});

test.describe('keyboard and mouse', () => {
  test('↑↓ skip the group headers and go round; hover picks a row after the pointer moves', async ({ page }) => {
    await open(page);
    await pluginsReady(page); // the last row is a plugin's command: there once the plugins have started
    await at(page, 'Подготовить бюджет');
    await palette(page);
    await page.keyboard.press('ArrowUp'); // round to the last
    await expect(selected(page)).toHaveText('Добавить цели…'); // the goals' plugin's, after the core's
    await page.keyboard.press('ArrowDown');
    await expect(selected(page)).toHaveText('Сменить статус…');
    for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowDown');
    await expect(selected(page)).toHaveText('Создать файл…'); // past «ОБЩИЕ»
    await rows(page).nth(2).hover();
    await expect(selected(page)).toHaveText('Поставить дедлайн…');
    await expect(field(page)).toBeFocused(); // the field keeps the focus
    await page.keyboard.type('с');
    await expect(rows(page).first()).toHaveClass(/on/); // typing selects the first result
  });

  test('a long list scrolls and the selected row stays in view', async ({ page }) => {
    const files: Record<string, string> = FILES();
    for (let i = 0; i < 30; i++) files[`/mock/заметка ${String(i).padStart(2, '0')}.org`] = '* x\n';
    await page.setViewportSize({ width: 1200, height: 600 });
    await open(page, files);
    await palette(page);
    await page.keyboard.type('заметка');
    const list = pal(page).locator('.list');
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    const b = (await pal(page).boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(600 - 32 + 1);
    for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowDown');
    const inView = await page.evaluate(() => {
      const l = document.querySelector('#pal-list')!.getBoundingClientRect();
      const r = document.querySelector('#pal-list .row.on')!.getBoundingClientRect();
      return r.top >= l.top - 1 && r.bottom <= l.bottom + 1;
    });
    expect(inView).toBe(true);
  });

  test('the selected row: accent fill, white text at 4.5:1 or more, in both themes', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      await palette(page);
      const ratio = await pal(page).locator('.row.on').evaluate((el) => {
        const rgb = (s: string) => s.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
        const lum = ([r, g, b]: number[]) => {
          const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const cs = getComputedStyle(el);
        const a = lum(rgb(cs.backgroundColor));
        const b = lum(rgb(cs.color));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      await page.keyboard.press('Escape');
    }
  });
});

test.describe('steps', () => {
  test('«Сменить статус…» opens the list of statuses in the same window', async ({ page }) => {
    await open(page);
    await at(page, 'Подготовить бюджет');
    await palette(page);
    await page.keyboard.press('Enter');
    await expect(field(page)).toHaveAttribute('placeholder', 'Статус');
    await expect(pal(page).locator('.plate')).toContainText('Подготовить бюджет 2027');
    await expect(rows(page).filter({ hasText: 'TODO' }).locator('.hint')).toHaveText('сейчас');
    await page.keyboard.type('don');
    await page.keyboard.press('Enter');
    await expect(pal(page)).toHaveCount(0);
    await expect(page.locator('.cm-line', { hasText: 'Подготовить бюджет' })).toContainText('DONE');
  });

  test('«Запланировать…»: a typed date, shown in words; «Поставить дедлайн…»: a quick choice', async ({ page }) => {
    await open(page);
    await at(page, 'План найма');
    await palette(page);
    await page.keyboard.type('заплан');
    await page.keyboard.press('Enter');
    await page.keyboard.type('14.11.2026');
    await expect(rows(page).first().locator('.t')).toHaveText('сб, 14 ноября 2026');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await disk(page))['/mock/work.org']).toContain('** NEXT План найма\nSCHEDULED: <2026-11-14 Сб>');
    await palette(page);
    await page.keyboard.type('дедлайн');
    await page.keyboard.press('Enter');
    await expect(titles(page)).resolves.toEqual(['Сегодня', 'Завтра', 'Через неделю', 'Выбрать дату…']);
    await field(page).fill('купить молоко');
    await expect(rows(page)).toHaveText(['Не похоже на дату']);
  });

  test('«Теги…» opens the field of the heading\'s tags in the editor (ТЗ 38)', async ({ page }) => {
    await open(page);
    await at(page, 'Подготовить бюджет');
    await palette(page);
    await page.keyboard.type('теги');
    await pal(page).getByRole('option', { name: /^Теги…/ }).click();
    const pop = page.getByRole('dialog', { name: 'Теги заголовка' });
    await expect(pop.locator('.chip')).toHaveText([/:budget:/, /:finance:/]);
    await page.keyboard.press('Backspace');
    await page.keyboard.type('q4');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(page.locator('.cm-line', { hasText: 'Подготовить бюджет' })).toHaveText('** TODO [#A] Подготовить бюджет 2027 :budget:q4:');
  });

  test('⇧⌘N goes straight to the name of a new file; it is created and opened', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Shift+Meta+n');
    await expect(field(page)).toHaveAttribute('placeholder', 'Имя файла');
    await expect(pal(page).locator('.plate')).toContainText('Новый файл в папке «mock»');
    await expect(rows(page)).toHaveText(['Введите имя файла']);
    await page.keyboard.type('Ретро');
    await expect(selected(page)).toHaveText('Создать «Ретро»');
    await page.keyboard.press('Enter');
    await expect.poll(async () => Object.keys(await disk(page))).toContain('/mock/Ретро.org');
    await expect(page.locator('.tab.on .lbl')).toHaveText('Ретро');
  });

  test('⇧⌘O goes straight to the file list', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Shift+Meta+o');
    expect(await titles(page)).toEqual(['journal', 'work', 'Сергей Белов']);
    await page.keyboard.type('jo');
    await page.keyboard.press('Enter');
    await expect(page.locator('.tab.on .lbl')).toHaveText('journal');
  });

  test('«Новая задача» adds «* TODO » at the end of the file with the caret after it', async ({ page }) => {
    await open(page);
    await at(page, 'Подготовить бюджет');
    await palette(page);
    await page.keyboard.type('нов зад');
    await page.keyboard.press('Enter');
    await expect(pal(page)).toHaveCount(0);
    await page.keyboard.type('Позвонить CTO');
    await expect.poll(async () => (await disk(page))['/mock/work.org']).toContain('** NEXT План найма\n* TODO Позвонить CTO\n');
  });

  test('Esc in a step cancels the whole thing: nothing changes', async ({ page }) => {
    await open(page);
    await at(page, 'Подготовить бюджет');
    await palette(page);
    await page.keyboard.press('Enter'); // the status list
    await page.keyboard.press('Escape');
    await expect(pal(page)).toHaveCount(0);
    await page.waitForTimeout(700);
    expect((await disk(page))['/mock/work.org']).toBe(WORK);
  });
});
