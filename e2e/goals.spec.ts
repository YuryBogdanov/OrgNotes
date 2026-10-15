import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { diskFile as disk } from './helpers';
import { CONFIG, FILES, KOZLOV, ME, NOW, PETROV } from './goalsFixture';

// ТЗ 23, the first part: the «Цели» navigator, «Обзор квартала» and a person's goals, «Добавить цели», «Новая цель».

async function open(page: Page, config: object | null = CONFIG) {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, FILES(config));
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.keyboard.press('Control+Meta+4');
  await expect(page.getByRole('navigation', { name: 'Цели' })).toBeVisible();
}
const nav = (page: Page) => page.getByRole('navigation', { name: 'Цели' });
const view = (page: Page) => page.locator('section.pane.active .goals');
const config = (page: Page) => page.evaluate(() => JSON.parse((window as any).__disk['/mock/.orgnotes/config.json'] ?? '{}'));
/** The sources of goals: their file in the notes folder (roadmap 0.6). */
// the goals are the plugin «quarter-goals» (ТЗ 27): its data in the notes folder
const sources = (page: Page) => page.evaluate(() => JSON.parse((window as any).__disk['/mock/.orgnotes/plugins/quarter-goals.json'] ?? '{"data":{"sources":[]}}').data.sources);
const group = (page: Page, name: string) => view(page).getByRole('region', { name });

test.describe('the navigator', () => {
  test('«Мои цели» pinned on top, «Обзор квартала», the team by name with counts and the dot of a silent goal', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('tab', { name: 'Цели' })).toHaveAttribute('aria-selected', 'true');
    const mine = nav(page).locator('.mine');
    await expect(mine).toContainText('Мои цели');
    await expect(mine).toContainText('Q4 2026 · 2 активных');
    await expect(mine.locator('.dot')).toHaveCount(1); // «Запустить гильдию тимлидов»: 15 days
    await expect(nav(page).getByRole('button', { name: /Обзор квартала/ })).toContainText('9');
    const team = nav(page).locator('.lst .row').filter({ hasNot: page.locator('svg') });
    await expect(team.locator('.nm')).toHaveText(['Иванова Мария', 'Петров Алексей', 'Смирнов Олег']);
    await expect(team.locator('.n')).toHaveText(['2', '3', '2']);
    await expect(team.nth(0).locator('.dot')).toHaveCount(0);
    await expect(team.nth(1).locator('.dot')).toHaveCount(1);
    await expect(nav(page).locator('.hint')).toContainText('кварталы — 2-й уровень, цели — 3-й');
  });

  test('a double click opens the file at the heading; the menu renames and removes a source, the file stays', async ({ page }) => {
    await open(page);
    await nav(page).getByRole('button', { name: /Петров Алексей/ }).dblclick();
    await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('petrov');
    await expect(page.locator('section.pane.active .status')).toContainText('Стр. 6');
    await page.keyboard.press('Control+Meta+4');
    await nav(page).getByRole('button', { name: /Смирнов Олег/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Переименовать…' }).click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.type('Олег Смирнов');
    await page.keyboard.press('Enter');
    await expect(nav(page).getByRole('button', { name: /Олег Смирнов/ })).toBeVisible();
    await expect.poll(async () => (await sources(page))[2].title).toBe('Олег Смирнов');
    await nav(page).getByRole('button', { name: /Олег Смирнов/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Удалить из целей' }).click();
    await expect.poll(async () => (await sources(page)).length).toBe(3);
    await expect(nav(page).getByRole('button', { name: /Олег Смирнов/ })).toHaveCount(0);
  });
});

test.describe('the views', () => {
  test('«Обзор квартала»: the quarter, four tiles, a group per person, «Мои цели» last; a row as on the mockup', async ({ page }) => {
    await open(page);
    await nav(page).getByRole('button', { name: /Обзор квартала/ }).click();
    await expect(view(page).locator('h1')).toHaveText('Обзор квартала');
    await expect(view(page).locator('.ttl > span')).toHaveText('4 квартал 2026 · 1 окт – 31 дек · осталось 80 дней');
    await expect(view(page).locator('.tile')).toHaveText([/7\s*активных/, /1\s*закрыта/, /1\s*в бэклоге/, /3\s*молчат больше 2 недель/]);
    await expect(view(page).locator('.gn')).toHaveText(['Иванова Мария', 'Петров Алексей', 'Смирнов Олег', 'Мои цели']);
    const ci = group(page, 'Петров Алексей').locator('.row', { hasText: 'Сократить время сборки CI' });
    await expect(ci.locator('.st')).toHaveText('ACTIVE');
    await expect(ci.locator('.res')).toHaveText('Результат: p90 сборки main ≤ 10 минут; медиана PR ≤ 6 минут; без роста флаки-тестов');
    await expect(ci.locator('.dl')).toHaveText('30 ноя');
    await expect(ci.locator('.note')).toHaveText('20 дней без отметок');
    await expect(ci.locator('.note')).toHaveClass(/silent/);
    await expect(group(page, 'Смирнов Олег').locator('.row', { hasText: 'Витрина' }).locator('.dl')).toHaveClass(/soon/); // 20 ноя: under 6 weeks
    await expect(group(page, 'Иванова Мария').locator('.row', { hasText: 'дизайн-систему' }).locator('.note')).toHaveText('закрыта 8 окт');
    await expect(group(page, 'Петров Алексей').locator('.sum')).toHaveText('2 активных');
    await expect(group(page, 'Иванова Мария').locator('.sum')).toHaveText('1 активная · 1 закрыта');
  });

  test('a tile filters the rows, a second click takes the filter off; the quarter switch shows another quarter', async ({ page }) => {
    await open(page);
    await nav(page).getByRole('button', { name: /Обзор квартала/ }).click();
    await view(page).locator('.tile', { hasText: 'молчат' }).click();
    await expect(view(page).locator('.row .t')).toHaveText(['Сократить время сборки CI до 10 минут', 'Витрина продуктовых метрик', 'Запустить гильдию тимлидов']);
    await expect(view(page).locator('.gn')).toHaveText(['Петров Алексей', 'Смирнов Олег', 'Мои цели']);
    await view(page).locator('.tile', { hasText: 'молчат' }).click();
    await expect(view(page).locator('.row')).toHaveCount(9);
    await view(page).getByRole('button', { name: 'Предыдущий квартал' }).click();
    await expect(view(page).locator('.qs .cur')).toHaveText('Q3 2026');
    await expect(view(page).locator('.row .t')).toHaveText(['Перевести сборку на новые раннеры']);
    await expect(view(page).locator('.none').first()).toHaveText('В Q3 2026 целей нет');
    await expect(nav(page).locator('.mine')).toContainText('Q3 2026 · 0 активных'); // the navigator follows
  });

  test('a person: their goals only; a click on a row opens the file at the goal', async ({ page }) => {
    await open(page);
    await nav(page).getByRole('button', { name: /Петров Алексей/ }).click();
    await expect(view(page).locator('h1')).toHaveText('Петров Алексей');
    await expect(view(page).locator('.ttl > span')).toHaveText('petrov.org › Квартальные задачи › Квартал Q4 2026 · осталось 80 дней');
    await expect(page.locator('.toolbar .path')).toContainText('Цели›Петров Алексей');
    await expect(view(page).locator('.tile')).toHaveText([/2\s*активных/, /0\s*закрыто/, /1\s*в бэклоге/, /1\s*молчит больше 2 недель/]);
    await view(page).locator('.row', { hasText: 'Наставничество' }).click();
    await expect(page.locator('section.pane.active .tab.on .lbl')).toHaveText('petrov');
    await expect(page.locator('section.pane.active .status')).toContainText('Стр. 39');
  });
});

test.describe('«Добавить цели»', () => {
  test('a file and its heading; «Создать „Квартальные задачи“» writes it; the person is in the navigator at once', async ({ page }) => {
    await open(page);
    await nav(page).getByRole('button', { name: 'Добавить ещё цели' }).click();
    const dlg = page.getByRole('dialog', { name: 'Добавить цели' });
    await expect(dlg.getByRole('option', { name: /petrov/ })).toContainText('уже в целях');
    await expect(dlg.getByRole('option', { name: /^me/ })).toContainText('мои цели');
    await dlg.getByRole('textbox', { name: 'Файл' }).fill('kozl');
    await expect(dlg.getByRole('listbox', { name: 'Файлы' }).getByRole('option')).toHaveCount(1);
    await dlg.getByRole('option', { name: /kozlov/ }).click();
    await expect(dlg.getByRole('listbox', { name: 'Заголовки первого уровня' }).getByRole('option')).toHaveText(['О человеке', '1-1', 'Развитие', '+ Создать «Квартальные задачи» в конце файла']);
    await expect(dlg.getByRole('option', { name: /Создать/ })).toHaveAttribute('aria-selected', 'true');
    await expect(dlg.getByRole('textbox', { name: 'Название в навигаторе' })).toHaveValue('Козлов Сергей');
    await expect(dlg.locator('.av')).toHaveText('СК');
    await expect(dlg.getByLabel('Что найдено под заголовком')).toContainText('будет создан в конце файла');
    await dlg.getByRole('button', { name: 'Добавить' }).click();
    await expect(dlg).toHaveCount(0);
    await expect.poll(() => disk(page, KOZLOV)).toBe('#+TITLE: Козлов Сергей\n* О человеке\n* 1-1\n* Развитие\n\n* Квартальные задачи\n');
    expect((await sources(page)).at(-1)).toEqual({ file: 'Работа/Тимлиды/kozlov.org', heading: 'Квартальные задачи', title: 'Козлов Сергей' });
    await expect(nav(page).getByRole('button', { name: /Козлов Сергей/ })).toHaveClass(/on/);
    await expect(view(page).locator('h1')).toHaveText('Козлов Сергей');
  });

  test('a heading that looks like a source says what is in it; «Это мои цели» asks before moving «мои»', async ({ page }) => {
    await open(page);
    await nav(page).getByRole('button', { name: 'Добавить ещё цели' }).click();
    const dlg = page.getByRole('dialog', { name: 'Добавить цели' });
    await dlg.getByRole('option', { name: /petrov/ }).click();
    await expect(dlg.getByRole('option', { name: /Квартальные задачи/ })).toContainText('2 квартала · 4 цели');
    await expect(dlg.getByRole('option', { name: /Квартальные задачи/ })).toHaveAttribute('aria-selected', 'true');
    await expect(dlg.getByLabel('Что найдено под заголовком')).toContainText(/\* Квартал Q4 2026\s*3 цели/);
    await dlg.getByRole('switch', { name: /Это мои цели/ }).click();
    await dlg.getByRole('button', { name: 'Добавить' }).click();
    const ask = page.getByRole('alertdialog', { name: 'Мои цели' });
    await expect(ask).toContainText('Сейчас «Мои цели» — me.org › Квартальные задачи');
    await ask.getByRole('button', { name: 'Сделать' }).click();
    await expect.poll(async () => (await sources(page)).filter((g: any) => g.me).map((g: any) => g.file)).toEqual(['Работа/Тимлиды/petrov.org']);
  });

  test('no goals yet: «Указать, где мои цели»; the set «Цели на квартал» comes into the statuses', async ({ page }) => {
    await open(page, null);
    await nav(page).getByRole('button', { name: 'Указать, где мои цели' }).click();
    const dlg = page.getByRole('dialog', { name: 'Добавить цели' });
    await expect(dlg.getByRole('switch', { name: /Это мои цели/ })).toHaveAttribute('aria-checked', 'true');
    await dlg.getByRole('option', { name: /^me/ }).click();
    await dlg.getByRole('button', { name: 'Добавить' }).click();
    // the set of the goals is in the statuses (in memory, roadmap 0.6), not written to config.json
    await expect.poll(async () => (await sources(page)).length).toBe(1);
    expect((await config(page)).workflows).toBeUndefined();
    expect((await sources(page))).toEqual([{ file: 'Работа/me.org', heading: 'Квартальные задачи', title: 'Юрий', me: true }]);
    await expect(nav(page).locator('.mine')).toContainText('Q4 2026 · 2 активных');
  });

  test('a heading renamed in the file: «не найден», the goals are not lost, «Выбрать заново»', async ({ page }) => {
    await open(page, { ...CONFIG, goals: [...CONFIG.goals.slice(0, 3).map((g, i) => (i === 0 ? { ...g, heading: 'Цели' } : g)), CONFIG.goals[3]] });
    await expect(nav(page).getByRole('button', { name: /Петров Алексей/ }).locator('.lost')).toHaveText('не найден');
    await nav(page).getByRole('button', { name: /Петров Алексей/ }).click();
    await expect(view(page).locator('.lost')).toContainText('Заголовок «Цели» не найден в Работа/Тимлиды/petrov.org');
    await view(page).getByRole('button', { name: 'Выбрать заново' }).click();
    const dlg = page.getByRole('dialog', { name: 'Добавить цели' });
    await expect(dlg.getByRole('option', { name: /Квартальные задачи/ })).toHaveAttribute('aria-selected', 'true');
    await dlg.getByRole('button', { name: 'Сохранить' }).click();
    await expect.poll(async () => (await sources(page)).map((g: any) => g.heading)).toEqual(['Квартальные задачи', 'Квартальные задачи', 'Квартальные задачи', 'Квартальные задачи']);
    await expect(view(page).locator('.row')).toHaveCount(3);
  });
});

test.describe('«Новая цель»', () => {
  test('the person of the view; lists as in the editor; the deadline as text; written at the end of the quarter', async ({ page }) => {
    await open(page);
    await nav(page).getByRole('button', { name: /Петров Алексей/ }).click();
    await view(page).getByRole('button', { name: '+ Новая цель' }).click();
    const dlg = page.getByRole('dialog', { name: 'Новая цель' });
    await expect(dlg.getByRole('combobox', { name: 'Чья цель' })).toHaveValue('Работа/Тимлиды/petrov.org#Квартальные задачи');
    await expect(dlg.locator('.qchip')).toHaveText('Квартал Q4 2026 ⌄');
    await expect(dlg.getByRole('textbox', { name: 'Название' })).toBeFocused();
    await page.keyboard.type('Сократить время сборки до 8 минут');
    await page.keyboard.press('Control+Tab');
    await expect(dlg.getByRole('textbox', { name: 'Что будешь делать' })).toBeFocused();
    await page.keyboard.type('План:');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- кэш');
    await page.keyboard.press('Enter'); // the next item
    await page.keyboard.type('потоки');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab'); // in
    await page.keyboard.type('по времени');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Shift+Tab'); // out
    await page.keyboard.press('Enter'); // an empty item: out of the list
    await page.keyboard.type('Раннеры — SRE.');
    await expect(dlg.getByRole('textbox', { name: 'Что будешь делать' })).toHaveValue('План:\n- кэш\n- потоки\n  - по времени\nРаннеры — SRE.');
    await dlg.getByRole('textbox', { name: 'Ожидаемый результат' }).fill('- p90 ≤ 8 минут');
    await dlg.getByRole('textbox', { name: 'Срок' }).fill('15 дек');
    await expect(dlg.locator('.fld', { hasText: 'Срок' }).locator('.hint')).toContainText('Вторник, 15 декабря 2026');
    await expect(dlg.locator('.where')).toHaveText('Запишется в petrov.org › Квартальные задачи › Квартал Q4 2026 как *** ACTIVE … с DEADLINE и подзаголовками «Что буду делать», «Ожидаемый результат», «Отметки».');
    await page.keyboard.press('Meta+Enter');
    await expect(dlg).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText('Цель добавлена — Петров Алексей');
    await expect.poll(() => disk(page, PETROV)).toContain(
      '*** ACTIVE Сократить время сборки до 8 минут\nDEADLINE: <2026-12-15 Вт>\n:PROPERTIES:\n:CREATED: [2026-10-12 Пн 14:00]\n:END:\n' +
        '**** Что буду делать\nПлан:\n- кэш\n- потоки\n  - по времени\nРаннеры — SRE.\n**** Ожидаемый результат\n- p90 ≤ 8 минут\n**** Отметки\n** Квартал Q3 2026',
    );
    await expect(view(page).locator('.row', { hasText: 'до 8 минут' }).locator('.note')).toHaveText('нет отметок');
  });

  test('another quarter: a new heading of the quarter in its place; ⇧ + arrows open the calendar', async ({ page }) => {
    await open(page);
    await nav(page).locator('.mine').click();
    await view(page).getByRole('button', { name: '+ Новая цель' }).click();
    const dlg = page.getByRole('dialog', { name: 'Новая цель' });
    await expect(dlg.getByRole('combobox', { name: 'Чья цель' })).toHaveValue('Работа/me.org#Квартальные задачи');
    await dlg.locator('.qchip').click();
    await dlg.getByRole('menuitemradio', { name: 'Q1 2027' }).click();
    await expect(dlg.locator('.where')).toContainText('Квартала ещё нет — будет создан');
    await dlg.getByRole('textbox', { name: 'Название' }).fill('Ротация дежурств тимлидов');
    await dlg.getByRole('textbox', { name: 'Срок' }).click();
    await page.keyboard.press('Shift+ArrowLeft'); // a day before 31 Mar 2027
    await expect(dlg.locator('.calbox')).toBeVisible();
    await expect(dlg.locator('.fld', { hasText: 'Срок' }).locator('.hint')).toContainText('Вторник, 30 марта 2027');
    await page.keyboard.press('Enter');
    await expect(dlg.locator('.calbox')).toHaveCount(0);
    await dlg.getByRole('button', { name: /Создать/ }).click();
    await expect.poll(() => disk(page, ME)).toContain('* Квартальные задачи\n** Квартал Q1 2027\n*** ACTIVE Ротация дежурств тимлидов\nDEADLINE: <2027-03-30 Вт>');
    await expect(view(page).locator('.qs .cur')).toHaveText('Q1 2027'); // the view goes to the quarter of the goal
  });

  test('⎋ keeps a draft till the next time; the palette in a person\'s file picks that person', async ({ page }) => {
    await open(page);
    await nav(page).getByRole('button', { name: /Смирнов Олег/ }).dblclick(); // the file in the editor
    await page.keyboard.press('Shift+Meta+p');
    await page.keyboard.type('новая цель');
    await page.keyboard.press('Enter');
    const dlg = page.getByRole('dialog', { name: 'Новая цель' });
    await expect(dlg.getByRole('combobox', { name: 'Чья цель' })).toHaveValue('Работа/Тимлиды/smirnov.org#Квартальные задачи');
    await page.keyboard.type('Черновик цели');
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await page.keyboard.press('Shift+Meta+p');
    await page.keyboard.type('новая цель');
    await page.keyboard.press('Enter');
    await expect(dlg.getByRole('textbox', { name: 'Название' })).toHaveValue('Черновик цели');
  });
});
