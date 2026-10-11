import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';
import { MY_DAY, NOTES, withAgenda } from './agendaFixture';

// ТЗ «Конструктор агенды».
const config = (page: Page) => page.evaluate(() => JSON.parse((window as any).__disk['/mock/.orgnotes/config.json'] ?? 'null'));
const builder = (page: Page) => page.getByRole('dialog', { name: 'Конструктор агенды' });
const list = (page: Page) => page.getByRole('navigation', { name: 'Список агенд' });
const pop = (page: Page) => builder(page).locator('.pop');
const preview = (page: Page) => builder(page).getByLabel('Предпросмотр');
const previewBlocks = (page: Page) => preview(page).locator('.ph2 .pt');
const block = (page: Page, i: number) => builder(page).locator('.bwrap').nth(i);
const saveBtn = (page: Page) => builder(page).getByRole('button', { name: 'Сохранить агенду' });
const opt = (page: Page, label: string) => pop(page).locator('.opt', { has: page.locator('.ol', { hasText: new RegExp(`^${label}$`) }) });

/** The app with an agenda alone in the window (⌘2): the list of agendas takes the navigator's place. */
async function start(page: Page, files: Record<string, string> = NOTES()) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installTauriMock(page, files);
  await page.goto('/');
  await expect(page.locator('.cm-content').first()).toBeVisible();
  await page.keyboard.press('Meta+2');
  await expect(list(page)).toBeVisible();
}
const newAgenda = async (page: Page) => {
  await list(page).getByRole('button', { name: 'Новая агенда' }).click();
  await expect(builder(page)).toBeVisible();
};

test.describe('entering, saving, cancelling', () => {
  test('«Новая агенда»: the name is selected for typing over, one empty block, every file; the preview shows all open tasks', async ({ page }) => {
    await start(page);
    await newAgenda(page);
    const name = builder(page).getByRole('textbox').first();
    await expect(name).toBeFocused();
    await expect(name).toHaveValue('Новая агенда');
    expect(await name.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 'Новая агенда'.length]);
    await expect(builder(page).getByLabel('Путь')).toHaveText(/Агенда\s*›\s*Новая агенда\s*›\s*Редактирование/);
    await expect(builder(page).locator('.src')).toContainText('все файлы');
    await expect(builder(page).locator('.bwrap')).toHaveCount(1);
    await expect(builder(page).locator('.bname')).toHaveValue('Без названия');
    await expect(builder(page).locator('.cond')).toHaveCount(0);
    // open tasks of every file: 9 (the finished one is not there)
    await expect(preview(page).locator('.ph2')).toContainText('9 задач');
    await expect(preview(page)).not.toContainText('Закрыть квартал');
    await expect(builder(page).locator('.qtext')).toHaveText('все задачи');
  });

  test('the name: empty or taken (any case, built-in too) — red text under the field and no saving', async ({ page }) => {
    await start(page, withAgenda(NOTES(), MY_DAY));
    await newAgenda(page);
    const name = builder(page).getByRole('textbox').first();
    await name.fill('');
    await expect(builder(page).locator('.err')).toHaveText('Введите название агенды');
    await expect(saveBtn(page)).toBeDisabled();
    await name.fill('мой ДЕНЬ');
    await expect(builder(page).locator('.err')).toHaveText('Агенда с таким названием уже есть');
    await expect(saveBtn(page)).toBeDisabled();
    await name.fill('агенда');
    await expect(saveBtn(page)).toBeDisabled();
    await name.fill('Утро');
    await expect(builder(page).locator('.err')).toHaveCount(0);
    await expect(saveBtn(page)).toBeEnabled();
  });

  test('made with the keyboard and saved with ⌘S: written to config.json, the builder closes and the agenda opens', async ({ page }) => {
    await start(page);
    await newAgenda(page);
    await page.keyboard.type('Утро');
    // block name
    await builder(page).locator('.bname').fill('Важное');
    await builder(page).getByRole('button', { name: '+ Условие' }).click();
    await expect(pop(page)).toBeVisible();
    await expect(pop(page)).toContainText('ПОЛЕ УСЛОВИЯ');
    await expect(pop(page).locator('.opt .ol')).toHaveText(['Статус', 'Запланировано', 'Дедлайн', 'Тег', 'Приоритет', 'Файл или папка', 'Заголовок содержит', 'Выполнено']);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter'); // Дедлайн
    // the row is there with its default operator, and the value list opens at once
    await expect(builder(page).locator('.cond .slot.f')).toHaveText('Дедлайн');
    await expect(builder(page).locator('.cond .slot.o')).toHaveText('равно');
    await expect(pop(page)).toContainText('ДЕДЛАЙН');
    await opt(page, 'ближайшие N дней…').click();
    const n = pop(page).getByLabel('Число дней');
    await expect(n).toBeFocused();
    await n.fill('14');
    await page.keyboard.press('Enter');
    await expect(pop(page)).toHaveCount(0);
    await expect(builder(page).locator('.cond .val')).toHaveText('ближайшие 14 дней');
    await expect(preview(page).locator('.ptt')).toHaveText(['Подготовить бюджет 2027']);
    await expect(builder(page).locator('.qtext')).toHaveText('deadline:today..+13d');
    await page.keyboard.press('Meta+s');
    await expect(builder(page)).toHaveCount(0);
    const cfg = await config(page);
    expect(cfg.workflows).toHaveLength(3); // the statuses stay
    expect(cfg.agendas).toMatchObject([{ name: 'Утро', sources: [], blocks: [{ name: 'Важное', conds: [{ field: 'deadline', op: 'eq', date: { kind: 'next', n: 14 } }] }] }]);
    await expect(list(page).getByRole('button', { name: 'Утро' })).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.toolbar .path')).toHaveText(/Агенда\s*›\s*Утро/);
    await expect(page.locator('.agenda .h1')).toHaveText('Утро');
    await expect(page.locator('.agenda .gh').first()).toContainText('Важное');
    await expect(page.locator('.agenda .ttl')).toHaveText([/^\[#A\]\s*Подготовить бюджет 2027$/]);
  });

  test('an unfinished condition: the block opens, its empty value is marked, nothing is saved', async ({ page }) => {
    await start(page);
    await newAgenda(page);
    await builder(page).getByRole('button', { name: '+ Условие' }).click();
    await opt(page, 'Тег').click();
    await page.keyboard.press('Escape'); // no tag picked
    await builder(page).getByRole('button', { name: '+ Добавить блок' }).click(); // the first block folds
    await expect(builder(page).locator('.cond')).toHaveCount(0);
    // an unfinished block is not in the preview
    await expect(previewBlocks(page)).toHaveText(['Без названия']);
    await saveBtn(page).click();
    await expect(builder(page)).toBeVisible();
    await expect(block(page, 0).locator('.block.open')).toHaveCount(1);
    await expect(block(page, 0).locator('.val.bad')).toBeFocused();
    expect((await config(page)).agendas).toBeUndefined();
  });

  test('«Отмена» and Esc: without changes the builder just closes; with changes it asks, «Остаться» is the default', async ({ page }) => {
    await start(page, withAgenda(NOTES(), MY_DAY));
    await list(page).getByRole('button', { name: 'Мой день' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Редактировать…' }).click();
    await expect(builder(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(builder(page)).toHaveCount(0);

    await list(page).getByRole('button', { name: 'Мой день' }).dblclick();
    await builder(page).getByRole('textbox').first().fill('Мой день 2');
    await builder(page).getByRole('button', { name: 'Отмена' }).click();
    const sheet = page.getByRole('alertdialog', { name: 'Отменить изменения агенды?' });
    await expect(sheet).toContainText('Изменения в агенде «Мой день» не сохранятся.');
    await expect(sheet.getByRole('button', { name: 'Остаться' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(sheet).toHaveCount(0);
    await expect(builder(page).getByRole('textbox').first()).toHaveValue('Мой день 2');
    await page.keyboard.press('Escape');
    await sheet.getByRole('button', { name: 'Отменить' }).click();
    await expect(builder(page)).toHaveCount(0);
    expect((await config(page)).agendas.map((a: { name: string }) => a.name)).toEqual(['Мой день']);
  });

  test('editing replaces the agenda whole; deleting asks first', async ({ page }) => {
    await start(page, withAgenda(NOTES(), MY_DAY));
    await list(page).getByRole('button', { name: 'Мой день' }).click();
    await page.locator('.agenda').getByRole('button', { name: 'Редактировать…' }).click();
    await builder(page).getByRole('textbox').first().fill('Мой день!');
    await block(page, 3).locator('.block').click();
    await block(page, 3).getByRole('button', { name: 'Удалить блок' }).click();
    await saveBtn(page).click();
    await expect(builder(page)).toHaveCount(0);
    const cfg = await config(page);
    expect(cfg.agendas).toHaveLength(1);
    expect(cfg.agendas[0]).toMatchObject({ id: 'a-my-day', name: 'Мой день!' });
    expect(cfg.agendas[0].blocks.map((b: { name: string }) => b.name)).toEqual(['Просрочено', 'На сегодня', 'Жду ответа']);

    await list(page).getByRole('button', { name: 'Мой день!' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Удалить агенду…' }).click();
    const dlg = page.getByRole('alertdialog', { name: 'Удаление агенды' });
    await expect(dlg).toContainText('Удалить агенду «Мой день!»?');
    await page.keyboard.press('Escape');
    expect((await config(page)).agendas).toHaveLength(1);
    await list(page).getByRole('button', { name: 'Мой день!' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Удалить агенду…' }).click();
    await dlg.getByRole('button', { name: 'Удалить' }).click();
    await expect(list(page).getByRole('button', { name: 'Мой день!' })).toHaveCount(0);
    expect((await config(page)).agendas).toBeUndefined();
    // the built-in agenda is shown again
    await expect(list(page).getByRole('button', { name: 'Агенда', exact: true })).toHaveAttribute('aria-current', 'true');
  });
});

test.describe('blocks', () => {
  test('one open block at a time; a new block opens with its name selected; the last block cannot be deleted', async ({ page }) => {
    await start(page, withAgenda(NOTES(), MY_DAY));
    await list(page).getByRole('button', { name: 'Мой день' }).dblclick();
    await expect(builder(page).locator('.block.open')).toHaveCount(1);
    await expect(block(page, 0).locator('.sum')).toHaveCount(0); // the first one is open
    await expect(block(page, 1).locator('.sum')).toHaveText('статус: TODO, NEXT · запланировано: сегодня · тег: не содержит later');
    await expect(block(page, 2).locator('.sum')).toHaveText('статус: WAIT · сортировка: по давности');
    await block(page, 2).locator('.block').click();
    await expect(builder(page).locator('.block.open')).toHaveCount(1);
    await expect(block(page, 2).locator('.block.open')).toHaveCount(1);
    await builder(page).getByRole('button', { name: '+ Добавить блок' }).click();
    const bn = block(page, 4).locator('.bname');
    await expect(bn).toBeFocused();
    expect(await bn.evaluate((el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!)).toBe('Без названия'.length);
    await expect(previewBlocks(page)).toHaveText(['Просрочено', 'На сегодня', 'Жду ответа', 'Дедлайны на 14 дней', 'Без названия']);
    for (let i = 4; i > 0; i--) await block(page, i).locator('.block.open, .block').first().click().then(() => block(page, i).getByRole('button', { name: 'Удалить блок' }).click());
    await expect(builder(page).locator('.bwrap')).toHaveCount(1);
    await expect(block(page, 0).getByRole('button', { name: 'Удалить блок' })).toBeDisabled();
  });

  test('the order: ⌥↓ / ⌥↑ on the handle, and drag and drop; the preview follows', async ({ page }) => {
    await start(page, withAgenda(NOTES(), MY_DAY));
    await list(page).getByRole('button', { name: 'Мой день' }).dblclick();
    await builder(page).locator('[data-grip]').first().focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(previewBlocks(page)).toHaveText(['На сегодня', 'Просрочено', 'Жду ответа', 'Дедлайны на 14 дней']);
    await expect(builder(page).locator('[data-grip]').nth(1)).toBeFocused();
    await page.keyboard.press('Alt+ArrowUp');
    await expect(previewBlocks(page)).toHaveText(['Просрочено', 'На сегодня', 'Жду ответа', 'Дедлайны на 14 дней']);
    // drag «Дедлайны на 14 дней» onto «На сегодня»: it goes before it
    await page.evaluate(() => {
      const w = window as any;
      w.__dt = new DataTransfer();
      const fire = (el: Element, type: string) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: w.__dt }));
      fire(document.querySelectorAll('[data-grip]')[3], 'dragstart');
      fire(document.querySelectorAll('.bwrap')[1], 'dragover');
    });
    await expect(block(page, 1)).toHaveClass(/over/); // the insertion line
    await page.evaluate(() => {
      const w = window as any;
      document.querySelectorAll('.bwrap')[1].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: w.__dt }));
    });
    await expect(previewBlocks(page)).toHaveText(['Просрочено', 'Дедлайны на 14 дней', 'На сегодня', 'Жду ответа']);
    await expect(builder(page).locator('.block.open')).toHaveCount(0); // the open block folded when the drag began
  });

  test('the colour of a block: the dot opens the palette; the preview and the agenda take it', async ({ page }) => {
    await start(page);
    await newAgenda(page);
    await builder(page).getByRole('button', { name: 'Цвет блока' }).click();
    const picker = page.getByRole('dialog', { name: /Цвет блока/ });
    await expect(picker).toContainText('Цвет блока');
    await picker.getByRole('radio', { name: 'Красный' }).click();
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(builder(page)).toBeVisible(); // Esc closed the palette only
    await expect(preview(page).locator('.ph2 .dot')).toHaveCSS('background-color', 'rgb(196, 38, 46)');
  });
});

test.describe('conditions', () => {
  test('statuses from three sets: groups with counters, search across groups, first chip and «+N»; Esc drops the choice', async ({ page }) => {
    await start(page, withAgenda(NOTES(), MY_DAY));
    await list(page).getByRole('button', { name: 'Мой день' }).dblclick();
    await block(page, 1).locator('.block').click();
    await block(page, 1).getByRole('button', { name: /^Значение: TODO, NEXT/ }).click();
    await expect(pop(page).getByRole('textbox', { name: 'Найти статус' })).toBeFocused();
    await expect(pop(page).locator('.gh')).toHaveText([/ЗАДАЧИ\s*выбрано 2 из 4/, /ВСТРЕЧИ\s*выбрано 0 из 3/, /ЦЕЛИ НА КВАРТАЛ\s*выбрано 0 из 3/]);
    await expect(pop(page)).toContainText('Условие сработает для заголовка любого набора, у которого есть выбранный статус.');
    // Space marks the highlighted one (the first checked: TODO); a click marks and the list stays open
    await page.keyboard.press('Space');
    await expect(pop(page).locator('.gh').first()).toContainText('выбрано 1 из 4');
    await opt(page, 'ACTIVE').click();
    await expect(pop(page).locator('.gh').nth(2)).toContainText('выбрано 1 из 3');
    // Esc: none of it is taken
    await page.keyboard.press('Escape');
    await expect(pop(page)).toHaveCount(0);
    await expect(block(page, 1).locator('.cond .val').first()).toHaveText(/TODO\s*NEXT/);

    await block(page, 1).getByRole('button', { name: /^Значение: TODO, NEXT/ }).click();
    await page.keyboard.type('acti'); // filters every group; the empty ones go
    await expect(pop(page).locator('.gh')).toHaveText([/ЦЕЛИ НА КВАРТАЛ/]);
    await expect(pop(page).locator('.opt .ol')).toHaveText(['ACTIVE']);
    await page.keyboard.press('Space');
    await page.getByRole('textbox', { name: 'Найти статус' }).fill('');
    await opt(page, 'MEETING').click();
    await page.keyboard.press('Enter');
    await expect(pop(page)).toHaveCount(0);
    const val = block(page, 1).locator('.cond .val').first();
    await expect(val.locator('.vchip')).toHaveText(['TODO', '+3']);
    await expect(val.locator('.more')).toHaveAttribute('title', 'TODO, NEXT, ACTIVE, MEETING');
    await expect(builder(page).locator('.qtext')).toHaveText('status:(TODO NEXT ACTIVE MEETING) and scheduled:today and not tag:later');
  });

  test('one set: a flat list, Space marks, a click outside takes the choice', async ({ page }) => {
    const files = NOTES();
    files['/mock/.orgnotes/config.json'] = JSON.stringify({ version: 1, workflows: [{ name: 'Задачи', states: [{ name: 'TODO' }, { name: 'NEXT' }, { name: 'WAIT' }, { name: 'DONE', done: true }] }] });
    await start(page, files);
    await newAgenda(page);
    await builder(page).getByRole('button', { name: '+ Условие' }).click();
    await page.keyboard.press('Enter'); // Статус
    await expect(pop(page)).toContainText('СТАТУС — ОДИН ИЛИ НЕСКОЛЬКО');
    await expect(pop(page).locator('.search')).toHaveCount(0);
    await expect(pop(page).locator('.opt .ol')).toHaveText(['TODO', 'NEXT', 'WAIT', 'DONE']);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space'); // WAIT
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space'); // DONE: finished statuses are picked like any other
    await builder(page).locator('.pvh').click();
    await expect(pop(page)).toHaveCount(0);
    await expect(builder(page).locator('.cond .vchip')).toHaveText(['WAIT', 'DONE']);
    await expect(preview(page).locator('.ptt')).toHaveText(['Ответ CTO по архитектуре', 'Закрыть квартал']);
  });

  test('dates: before today, not set, a range; tasks without the date never pass «раньше»', async ({ page }) => {
    await start(page);
    await newAgenda(page);
    await builder(page).getByRole('button', { name: '+ Условие' }).click();
    await opt(page, 'Запланировано').click();
    await expect(pop(page)).toContainText('Даты в условиях «сегодня» считаются от дня открытия агенды.');
    await opt(page, 'раньше сегодня').click();
    await expect(preview(page).locator('.ptt')).toHaveText(['Ревизия целей команд']);
    // «раньше» + «завтра»: everything planned before tomorrow, still no undated task
    await builder(page).getByRole('button', { name: 'Оператор: равно' }).click();
    await opt(page, 'раньше').click();
    await builder(page).getByRole('button', { name: /^Значение:/ }).click();
    await opt(page, 'завтра').click();
    await expect(preview(page).locator('.ptt')).toHaveText(['Ревизия целей команд', 'Разобрать входящие', 'Свести расходы по направлениям', 'Отложенное']);
    await builder(page).getByRole('button', { name: /^Значение:/ }).click();
    await opt(page, 'не задано').click();
    await expect(builder(page).locator('.cond .slot.o')).toHaveText('не задано');
    await expect(preview(page).locator('.ptt')).toHaveText(['Подготовить бюджет 2027', 'Ответ CTO по архитектуре', 'Нанять двух тимлидов', 'Купить подарки']);
    await builder(page).getByRole('button', { name: 'Оператор: не задано' }).click();
    await opt(page, 'равно').click(); // a value is asked for at once
    await opt(page, 'в диапазоне…').click();
    const today = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await pop(page).getByLabel('С даты').fill(iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)));
    await pop(page).getByLabel('По дату').fill(iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3)));
    await pop(page).getByRole('button', { name: 'Готово' }).click();
    await expect(preview(page).locator('.ptt')).toHaveText(['Планёрка с тимлидами']);
  });

  test('tag, priority, file or folder, title, done; a condition is removed with ×', async ({ page }) => {
    await start(page);
    await newAgenda(page);
    const add = async (field: string) => {
      await builder(page).getByRole('button', { name: '+ Условие' }).click();
      await opt(page, field).click();
    };
    await add('Тег');
    await expect(pop(page).locator('.opt .ol')).toHaveText(['budget', 'later', 'leads']);
    await page.keyboard.type('lea');
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect(preview(page).locator('.ptt')).toHaveText(['Ревизия целей команд']);
    await builder(page).getByRole('button', { name: 'Убрать условие' }).click();

    await add('Приоритет');
    await opt(page, 'A').click();
    await expect(preview(page).locator('.ptt')).toHaveText(['Подготовить бюджет 2027']);
    await builder(page).getByRole('button', { name: 'Убрать условие' }).click();

    await add('Файл или папка');
    await expect(pop(page).locator('.opt .ol')).toHaveText(['Личное', 'список', 'inbox', 'work']);
    await opt(page, 'Личное').click();
    await page.keyboard.press('Enter');
    await expect(preview(page).locator('.ptt')).toHaveText(['Купить подарки']);
    await builder(page).getByRole('button', { name: 'Оператор: находится в' }).click();
    await opt(page, 'не находится в').click();
    await expect(preview(page).locator('.ptt')).not.toContainText(['Купить подарки']);
    await builder(page).getByRole('button', { name: 'Убрать условие' }).click();

    await add('Заголовок содержит');
    const text = builder(page).getByLabel('Текст в заголовке');
    await expect(text).toBeFocused();
    await text.fill('ВХОДЯЩ');
    await expect(preview(page).locator('.ptt')).toHaveText(['Разобрать входящие']);
    await expect(builder(page).locator('.qtext')).toHaveText('title:"ВХОДЯЩ"');
    await builder(page).getByRole('button', { name: 'Убрать условие' }).click();

    await add('Выполнено');
    await expect(pop(page)).toHaveCount(0); // «да» / «нет» are the operator, no value
    await expect(builder(page).locator('.cond .slot.o')).toHaveText('да');
    await expect(preview(page).locator('.ptt')).toHaveText(['Закрыть квартал']);
  });

  test('the field and the operator keep their widths; the longest words do not run under the chevron', async ({ page }) => {
    await start(page);
    await newAgenda(page);
    await builder(page).getByRole('button', { name: '+ Условие' }).click();
    await opt(page, 'Запланировано').click();
    await page.keyboard.press('Escape');
    await builder(page).getByRole('button', { name: 'Оператор: равно' }).click();
    await opt(page, 'не задано').click();
    await builder(page).getByRole('button', { name: '+ Условие' }).click();
    await opt(page, 'Файл или папка').click();
    await page.keyboard.press('Escape');
    await builder(page).getByRole('button', { name: 'Оператор: находится в' }).click();
    await opt(page, 'не находится в').click();
    for (const slot of await builder(page).locator('.cond .slot').all()) {
      const fit = await slot.evaluate((el) => {
        const t = el.querySelector('span')!.getBoundingClientRect();
        const c = el.querySelector('.chev')!.getBoundingClientRect();
        return t.right <= c.left && el.scrollWidth <= el.clientWidth;
      });
      expect(fit).toBe(true);
    }
    expect(await builder(page).locator('.cond .slot.f').first().evaluate((el) => el.getBoundingClientRect().width)).toBe(140);
    expect(await builder(page).locator('.cond .slot.o').first().evaluate((el) => el.getBoundingClientRect().width)).toBe(116);
  });
});

test.describe('the rest', () => {
  test('sources: picked from the tree with a filter, removed with Backspace; a missing one is grey and the agenda keeps working', async ({ page }) => {
    await start(page, withAgenda(NOTES(), { ...MY_DAY, sources: ['work.org', 'Старое.org'] }));
    await list(page).getByRole('button', { name: 'Мой день' }).dblclick();
    const src = builder(page).locator('.src');
    await expect(src.locator('.chipx')).toHaveText([/work/, /Старое/]);
    await expect(src.locator('.chipx.gone')).toHaveText(/Старое/);
    await expect(src.locator('.chipx.gone')).toHaveAttribute('title', /не найден/);
    await expect(previewBlocks(page)).toHaveCount(4);
    await src.getByRole('button', { name: 'Добавить источник' }).click();
    await expect(pop(page).getByRole('textbox')).toBeFocused();
    await page.keyboard.type('спи');
    await expect(pop(page).locator('.opt .ol')).toHaveText(['список']);
    await page.keyboard.press('Enter'); // with a filter typed, ↩ takes the highlighted one
    await expect(src.locator('.chipx')).toHaveText([/work/, /Старое/, /список/]);
    await src.locator('.chipx').nth(1).focus();
    await page.keyboard.press('Backspace');
    await expect(src.locator('.chipx')).toHaveText([/work/, /список/]);
    await expect(src.locator('.chipx').nth(1)).toBeFocused();
  });

  test('the preview: «нет задач» under an empty block, «и ещё N» past the limit; the agenda shows the same', async ({ page }) => {
    await start(page);
    await newAgenda(page);
    await builder(page).getByRole('textbox').first().fill('Проверка');
    await builder(page).locator('.limit').fill('2');
    await expect(preview(page).locator('.prow')).toHaveCount(2);
    await expect(preview(page)).toContainText('и ещё 7');
    await expect(preview(page).locator('.ph2')).toContainText('9 задач'); // the count is exact
    await builder(page).getByRole('button', { name: '+ Добавить блок' }).click();
    await builder(page).getByRole('button', { name: '+ Условие' }).click();
    await opt(page, 'Заголовок содержит').click();
    await builder(page).getByLabel('Текст в заголовке').fill('такого нет');
    await expect(preview(page).locator('.pnone').last()).toHaveText('нет задач');
    await saveBtn(page).click();
    await expect(page.locator('.agenda .none')).toHaveText(['и ещё 7', 'нет задач']);
  });

  test('relative dates follow the day: after midnight «сегодня» is the new day', async ({ page }) => {
    const now = new Date();
    await page.clock.install({ time: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0) });
    await start(page, withAgenda(NOTES(), MY_DAY));
    await list(page).getByRole('button', { name: 'Мой день' }).click();
    const today = page.locator('.agenda .gh', { hasText: 'На сегодня' });
    await expect(today).toContainText('2 задачи');
    await page.clock.runFor(2 * 60_000);
    // the next day: nothing of today's is left for «сегодня» (the tasks of today are overdue now)
    await expect(today).toContainText('0 задач');
    await expect(page.locator('.agenda .gh', { hasText: 'Просрочено' })).toContainText('4 задачи');
  });

  test('in a narrow pane next to a file: long statuses are whole, the custom agenda keeps «Редактировать…»', async ({ page }) => {
    const meetings = { ...MY_DAY, id: 'a-m', name: 'Только встречи', blocks: [{ name: 'Встречи', color: 'blue', conds: [{ field: 'status', op: 'in', values: [{ set: 'Встречи', name: 'MEETING' }, { set: 'Цели на квартал', name: 'ACTIVE' }] }] }] };
    await start(page, withAgenda(NOTES(), meetings));
    await list(page).getByRole('button', { name: 'Только встречи' }).click();
    await page.keyboard.press('Meta+1'); // back to the file; the agenda goes to a second pane
    await page.getByRole('button', { name: 'Агенда', exact: true }).click();
    const ag = page.locator('section.pane').nth(1).locator('.agenda');
    await expect(ag.locator('.kw')).toHaveText(['MEETING', 'ACTIVE']);
    for (const kw of await ag.locator('.kw').all()) expect(await kw.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(ag.locator('.h1')).toHaveText('Только встречи');
    await ag.getByRole('button', { name: 'Редактировать…' }).click();
    await expect(builder(page)).toBeVisible();
    await expect(builder(page).getByRole('textbox').first()).toHaveValue('Только встречи');
  });

  test('the word is «статус» everywhere: «состояние» is on no screen of the builder', async ({ page }) => {
    await start(page, withAgenda(NOTES(), MY_DAY));
    await list(page).getByRole('button', { name: 'Мой день' }).dblclick();
    await block(page, 1).locator('.block').click();
    await block(page, 1).getByRole('button', { name: /^Значение: TODO, NEXT/ }).click();
    expect((await builder(page).innerText()).toLowerCase()).not.toContain('состояни');
    await page.keyboard.press('Escape');
    await builder(page).getByRole('button', { name: '+ Условие' }).click();
    expect((await builder(page).innerText()).toLowerCase()).not.toContain('состояни');
  });
});

test.describe('settings → «Агенды»', () => {
  test('«Мои агенды» with ×, asking first; a change of statuses keeps the agendas', async ({ page }) => {
    await installTauriMock(page, withAgenda(NOTES(), MY_DAY, { ...MY_DAY, id: 'a2', name: 'Пятничные 1:1' }));
    await page.goto('/#settings');
    await page.getByRole('tab', { name: 'Агенды' }).click();
    const rows = page.getByRole('list', { name: 'Мои агенды' }).getByRole('listitem');
    await expect(rows).toHaveText([/Мой день\s*4 блока/, /Пятничные 1:1\s*4 блока/]);
    await page.getByRole('button', { name: 'Удалить агенду Пятничные 1:1' }).click();
    await page.getByRole('alertdialog', { name: 'Удаление агенды' }).getByRole('button', { name: 'Удалить' }).click();
    await expect(rows).toHaveCount(1);
    expect((await config(page)).agendas.map((a: { name: string }) => a.name)).toEqual(['Мой день']);
    // statuses written from here keep what the main window wrote meanwhile
    await page.evaluate(() => {
      const d = (window as any).__disk;
      const c = JSON.parse(d['/mock/.orgnotes/config.json']);
      c.agendas.push({ id: 'a3', name: 'Свежая', sources: [], blocks: [{ name: 'Все', conds: [] }] });
      d['/mock/.orgnotes/config.json'] = JSON.stringify(c);
    });
    await page.getByRole('tab', { name: 'Статусы' }).click();
    await page.getByRole('button', { name: '+ Новый набор' }).click();
    await page.getByLabel('Название набора').fill('Проекты');
    await expect.poll(async () => (await config(page)).workflows.map((w: { name: string }) => w.name)).toContain('Проекты');
    expect((await config(page)).agendas.map((a: { name: string }) => a.name)).toEqual(['Мой день', 'Свежая']);
  });

  test('«Новая агенда в конструкторе…» opens the builder in the main window', async ({ page, context }) => {
    await start(page);
    const settings = await context.newPage();
    await installTauriMock(settings, NOTES());
    await settings.goto('/#settings');
    await settings.getByRole('tab', { name: 'Агенды' }).click();
    await expect(settings.getByText('Своих агенд пока нет.')).toBeVisible();
    await settings.getByRole('button', { name: 'Новая агенда в конструкторе…' }).click();
    await expect(builder(page)).toBeVisible();
    await expect(builder(page).getByRole('textbox').first()).toHaveValue('Новая агенда');
  });
});
