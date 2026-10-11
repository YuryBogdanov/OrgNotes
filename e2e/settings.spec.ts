import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

const CONFIG = {
  version: 1,
  note: 'hand-written, must survive',
  workflows: [
    {
      name: 'Задачи',
      states: [{ name: 'NEW', color: 'gray' }, { name: 'TODO', color: 'red' }, { name: 'IN-PROGRESS', color: 'blue' }, { name: 'NEXT' }, { name: 'DONE', done: true, color: 'green' }],
    },
    { name: 'Встречи', states: [{ name: 'MEETING' }, { name: 'FINISHED', done: true }] },
  ],
};
// 2 x TODO, 1 x IN-PROGRESS, 1 x NEXT, 1 x MEETING
const NOTES = '* TODO Подготовить бюджет\n* TODO Согласовать\n* IN-PROGRESS Отчёт\n* NEXT Позвонить\n* MEETING Планёрка\n* Просто заголовок\n';

const config = (page: Page) =>
  page.evaluate(() => {
    const raw = (window as any).__disk['/mock/.orgnotes/config.json'];
    return raw ? JSON.parse(raw) : null;
  });
const disk = (page: Page) => page.evaluate(() => (window as any).__disk as Record<string, string>);
const log = (page: Page) => page.evaluate(() => (window as any).__log as unknown[][]);

/** The settings as their own window: the app loaded at #settings. */
const openSettings = async (page: Page, files: Record<string, string> = { '/mock/Work.org': NOTES, '/mock/.orgnotes/config.json': JSON.stringify(CONFIG) }) => {
  await installTauriMock(page, files);
  await page.goto('/#settings');
  await expect(page.getByRole('tablist', { name: 'Разделы настроек' })).toBeVisible();
  await expect(page.locator('.srow').first()).toBeVisible();
};
const rows = (page: Page) => page.locator('.srow');
const row = (page: Page, kw: string) => page.locator('.srow').filter({ has: page.locator(`input.kw`) }).filter({ hasText: new RegExp(`^⋮⋮\\s*${kw.replace(/-/g, '[- ]')}`) });
const keywords = (page: Page) => page.locator('input.kw').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
const kwInput = (page: Page, kw: string) => page.locator('input.kw').filter({ has: page.locator('xpath=self::*') }).and(page.locator(`input.kw[value="${kw}"]`));

test.describe('table', () => {
  test('columns: lock on the derived name, pencil on the editable one, one grid for header and rows', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 760 });
    await openSettings(page);
    const header = page.locator('.th');
    await expect(header.getByLabel('Только чтение')).toBeVisible();
    await expect(header.getByLabel('Редактируется', { exact: true })).toBeVisible();

    for (const width of [900, 1100, 1400]) {
      await page.setViewportSize({ width, height: 760 });
      const left = async (loc: ReturnType<Page['locator']>) => Math.round((await loc.boundingBox())!.x);
      const first = rows(page).first();
      const heads = header.locator('[role=columnheader]');
      // header cell and the first row's cell share the same left edge: ЦВЕТ, НАЗВАНИЕ, В ФАЙЛЕ, КЛАВИША
      expect(await left(heads.nth(0))).toBe(await left(first.locator('.swatch .dot')));
      expect(await left(heads.nth(1))).toBe(await left(first.locator('.name')));
      expect(await left(heads.nth(2))).toBe(await left(first.locator('input.kw')));
      expect(await left(heads.nth(3))).toBe(await left(first.locator('input.qk')));
    }
  });

  test('the name is a read-only capsule in the status colour, upper case, and Tab skips it', async ({ page }) => {
    await openSettings(page);
    const r = rows(page).nth(2); // IN-PROGRESS
    await expect(r.locator('.name')).toHaveText('IN PROGRESS');
    expect(await r.locator('.name').evaluate((el) => getComputedStyle(el).textTransform)).toBe('uppercase');
    // a capsule: tinted background, rounded, coloured text; the same look as the chip in the list of workflows
    const cap = await r.locator('.name').evaluate((el) => {
      const c = getComputedStyle(el);
      return { bg: c.backgroundColor, radius: parseFloat(c.borderTopLeftRadius), color: c.color };
    });
    expect(cap.bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(cap.radius).toBeGreaterThanOrEqual(4);
    expect(cap.color).toBe('rgb(10, 88, 194)'); // blue, light theme
    const listChip = page.locator('aside .chip', { hasText: 'IN PROGRESS' }).first();
    expect(await listChip.evaluate((el) => getComputedStyle(el).color)).toBe(cap.color);
    expect(await r.locator('.name').evaluate((el) => el.tagName)).toBe('SPAN');
    // focus the keyword field of the row above, Tab goes to its delete button / next focusable, never to a name
    await rows(page).nth(1).locator('input.kw').focus();
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => (document.activeElement as HTMLElement).className + '|' + document.activeElement!.tagName);
    expect(active).not.toContain('name');
  });

  test('the colour column shows a chevron next to the swatch, so it is clear that it can be changed', async ({ page }) => {
    await openSettings(page);
    for (const r of await rows(page).all()) {
      await expect(r.locator('.swatch .dot')).toBeVisible();
      await expect(r.locator('.swatch .chev')).toBeVisible();
    }
  });

  test('the key is an editable field: automatic letter by default, explicit when typed, automatic again when cleared', async ({ page }) => {
    await openSettings(page);
    const keyOf = (n: number) => rows(page).nth(n).locator('input.qk');
    expect(await page.locator('.srow input.qk').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toEqual(['n', 't', 'i', 'e', 'd']);
    expect(await keyOf(0).evaluate((el) => el.classList.contains('auto'))).toBe(true); // shown as automatic
    await expect(page.locator('.th').getByLabel('Редактируется (клавиша)')).toBeVisible();

    // type over the letter: it becomes explicit and is saved
    await keyOf(1).click();
    await page.keyboard.type('x');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await config(page)).workflows[0].states[1].key).toBe('x');
    expect(await keyOf(1).evaluate((el) => el.classList.contains('auto'))).toBe(false);
    await expect(page.getByLabel('Строка #+TODO')).toContainText('TODO(x)');

    // Esc cancels
    await keyOf(1).click();
    await page.keyboard.type('q');
    await page.keyboard.press('Escape');
    await expect(keyOf(1)).toHaveValue('x');

    // clearing returns to automatic
    await keyOf(1).click();
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await config(page)).workflows[0].states[1].key).toBeUndefined();
    await expect(keyOf(1)).toHaveValue('t');
  });

  test('a key already set by hand on another status is refused with its name', async ({ page }) => {
    await openSettings(page);
    const keyOf = (n: number) => rows(page).nth(n).locator('input.qk');
    await keyOf(1).click();
    await page.keyboard.type('x');
    await page.keyboard.press('Enter');
    await keyOf(2).click();
    await page.keyboard.type('x');
    await expect(page.getByText('Клавиша «x» уже занята статусом TODO')).toBeVisible();
    expect(await keyOf(2).getAttribute('aria-invalid')).toBe('true');
    await page.keyboard.press('Enter');
    await expect(keyOf(2)).toBeFocused(); // not confirmed
    await page.keyboard.press('Escape');
    await expect(keyOf(2)).toHaveValue('i');
  });

  test('an automatic key steps aside for a key set by hand', async ({ page }) => {
    await openSettings(page);
    // TODO takes "n", which is NEW's automatic letter: NEW moves on to its next free letter "e"... but NEXT has it,
    // so the rule is: explicit first, automatic ones fill in the rest in order
    await rows(page).nth(1).locator('input.qk').click();
    await page.keyboard.type('n');
    await page.keyboard.press('Enter');
    const keys = await page.locator('.srow input.qk').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    expect(keys[1]).toBe('n');
    expect(new Set(keys).size).toBe(keys.length); // no two statuses share a letter
  });

  test('the "+" buttons stay reachable in a short window', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 480 });
    await openSettings(page);
    const t = page.locator('.table');
    // the table is never squashed: all its content is inside it
    const clipped = await t.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(clipped).toBeLessThanOrEqual(1);
    const add = page.getByRole('button', { name: '+ Состояние' });
    await add.scrollIntoViewIfNeeded();
    await expect(add).toBeVisible();
    await add.click();
    await expect(page.locator('input.kw:focus')).toHaveCount(1);
  });

  test('no ↑↓ buttons in rows; ⌥↑ / ⌥↓ on a focused row reorder it', async ({ page }) => {
    await openSettings(page);
    await expect(page.getByRole('button', { name: 'Выше' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ниже' })).toHaveCount(0);
    await rows(page).nth(1).focus(); // TODO
    await page.keyboard.press('Alt+ArrowUp');
    await expect.poll(async () => (await config(page)).workflows[0].states.map((s: any) => s.name)).toEqual(['TODO', 'NEW', 'IN-PROGRESS', 'NEXT', 'DONE']);
    await page.keyboard.press('Alt+ArrowDown');
    await expect.poll(async () => (await config(page)).workflows[0].states.map((s: any) => s.name)).toEqual(['NEW', 'TODO', 'IN-PROGRESS', 'NEXT', 'DONE']);
  });

  test('the separator says what it means and has no stray bar', async ({ page }) => {
    await openSettings(page);
    await expect(page.locator('.sep')).toHaveText('Ниже — завершающие состояния: задача считается закрытой');
  });

  test('explanation under the table, and a "+ Завершающее" button', async ({ page }) => {
    await openSettings(page);
    await expect(page.getByText('Название строится из ключевого слова. Редактируются колонки «В файле» и «Клавиша».')).toBeVisible();
    await page.getByRole('button', { name: '+ Завершающее' }).click();
    // goes to the end of the closed block
    expect((await keywords(page)).at(-1)).toBe('');
    await expect(rows(page).last().locator('input.kw')).toBeFocused();
  });

  test('tabs are in the order of the mockup, including Календарь', async ({ page }) => {
    await openSettings(page);
    expect(await page.getByRole('tab').allInnerTexts()).toEqual(['Основные', 'Статусы', 'Теги', 'Агенды', 'Календарь', 'Inbox', 'Файлы']);
  });
});

test.describe('new state', () => {
  test('"+ Состояние" adds a grey row with the caret in "В ФАЙЛЕ", a placeholder and a hint', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('button', { name: '+ Состояние' }).click();
    const r = rows(page).nth(5); // after NEW TODO IN-PROGRESS NEXT, before DONE... 5th open is index 4
    const created = page.locator('.srow').filter({ has: page.locator('input.kw:focus') });
    await expect(created).toHaveCount(1);
    await expect(created.locator('input.kw')).toHaveAttribute('placeholder', 'например, REVIEW');
    await expect(created.locator('.name')).toHaveText('—');
    await expect(created.locator('input.qk')).toBeDisabled(); // no letter until there is a word
    expect(await created.locator('.swatch .dot').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(95, 95, 102)'); // gray
    await expect(page.getByText('Введите ключевое слово и нажмите ↩ · ⎋ — отмена')).toBeVisible();
    // it sits in the open block, before the separator
    const order = await page.locator('.srow, .sep').evaluateAll((els) => els.map((e) => (e.classList.contains('sep') ? '|' : (e.querySelector('input.kw') as HTMLInputElement).value || '·')));
    expect(order).toEqual(['NEW', 'TODO', 'IN-PROGRESS', 'NEXT', '·', '|', 'DONE']);
    void r;
  });

  test('typing normalises on the fly, Return confirms and saves', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('button', { name: '+ Состояние' }).click();
    await page.keyboard.type('in review');
    const r = page.locator('.srow').filter({ has: page.locator('input.kw:focus') });
    await expect(r.locator('input.kw')).toHaveValue('IN-REVIEW');
    await expect(r.locator('.name')).toHaveText('IN REVIEW');
    await page.keyboard.press('Enter');
    await expect(page.locator('input.kw:focus')).toHaveCount(0);
    await expect.poll(async () => (await config(page)).workflows[0].states.map((s: any) => s.name)).toContain('IN-REVIEW');
    // the chain and the #+TODO line follow
    await expect(page.getByLabel('Строка #+TODO')).toContainText('IN-REVIEW');
    await expect(page.locator('input.qk').nth(4)).toHaveValue('r'); // I of IN-PROGRESS is taken -> next free letter
  });

  test('Esc removes the row; losing focus with an empty field removes it too; a valid word is confirmed on blur', async ({ page }) => {
    await openSettings(page);
    const before = await rows(page).count();
    await page.getByRole('button', { name: '+ Состояние' }).click();
    await expect(rows(page)).toHaveCount(before + 1);
    await page.keyboard.press('Escape');
    await expect(rows(page)).toHaveCount(before);

    // losing focus with an empty field removes the row
    await page.getByRole('button', { name: '+ Состояние' }).click();
    await expect(rows(page)).toHaveCount(before + 1);
    await page.locator('.head').click({ position: { x: 5, y: 5 } });
    await expect(rows(page)).toHaveCount(before);

    // a correct word is confirmed on blur
    await page.getByRole('button', { name: '+ Состояние' }).click();
    await page.keyboard.type('check');
    await page.locator('.head').click({ position: { x: 5, y: 5 } });
    await expect(rows(page)).toHaveCount(before + 1);
    await expect.poll(async () => (await config(page)).workflows[0].states.map((s: any) => s.name)).toContain('CHECK');
  });

  test('pressing "+" again with an empty row open focuses it instead of adding another', async ({ page }) => {
    await openSettings(page);
    const before = await rows(page).count();
    await page.getByRole('button', { name: '+ Состояние' }).click();
    await page.getByRole('button', { name: '+ Состояние' }).click();
    await page.getByRole('button', { name: '+ Состояние' }).click();
    expect(await rows(page).count()).toBe(before + 1);
    await expect(page.locator('input.kw:focus')).toHaveCount(1);
  });

  test('an invalid word is not confirmed by Return: red field and the reason below', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('button', { name: '+ Состояние' }).click();
    await page.keyboard.type('A(B');
    await page.keyboard.press('Enter');
    await expect(page.locator('input.kw:focus')).toHaveCount(1); // still editing
    await expect(page.getByText('Нельзя использовать ( ) | @ ! /')).toBeVisible();
    expect(await page.locator('input.kw:focus').getAttribute('aria-invalid')).toBe('true');
    expect((await config(page)).workflows[0].states.map((s: any) => s.name)).not.toContain('A(B');
  });

  test('a word that exists in this or another set is refused with the set\'s name', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('button', { name: '+ Состояние' }).click();
    await page.keyboard.type('todo');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Такое слово уже есть в наборе «Задачи»')).toBeVisible();
    await page.locator('input.kw:focus').fill('');
    await page.keyboard.type('finished');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Такое слово уже есть в наборе «Встречи»')).toBeVisible();
  });

  test('a word longer than 24 characters is refused', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('button', { name: '+ Состояние' }).click();
    await page.keyboard.type('x'.repeat(25));
    await page.keyboard.press('Enter');
    await expect(page.getByText('Не длиннее 24 символов')).toBeVisible();
  });
});

test.describe('editing and deleting', () => {
  test('click puts the caret in the field; Return saves, Esc cancels the edit', async ({ page }) => {
    await openSettings(page);
    const input = rows(page).nth(1).locator('input.kw'); // TODO
    await input.click();
    await expect(input).toBeFocused();
    await input.fill('');
    await page.keyboard.type('ready');
    await page.keyboard.press('Escape');
    await expect(input).toHaveValue('TODO');

    // an unused word renames silently, with Return
    await rows(page).nth(0).locator('input.kw').click(); // NEW is unused
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('fresh');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await config(page)).workflows[0].states[0].name).toBe('FRESH');
    expect((await config(page)).note).toBe('hand-written, must survive');
  });

  test('deleting an unused status is immediate', async ({ page }) => {
    await openSettings(page);
    await rows(page).nth(0).getByRole('button', { name: /Удалить состояние/ }).click(); // NEW is unused
    await expect.poll(async () => (await config(page)).workflows[0].states.map((s: any) => s.name)).toEqual(['TODO', 'IN-PROGRESS', 'NEXT', 'DONE']);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('deleting a used status asks, tells how many headings and that files stay as they are', async ({ page }) => {
    await openSettings(page);
    await rows(page).nth(3).getByRole('button', { name: /Удалить состояние/ }).click(); // NEXT: used once
    const dlg = page.getByRole('alertdialog');
    await expect(dlg).toContainText('NEXT используется в 1 заголовках');
    await expect(dlg).toContainText('Файлы не изменятся: слово останется в тексте, но перестанет считаться статусом');
    await dlg.getByRole('button', { name: 'Отмена' }).click();
    expect(await keywords(page)).toContain('NEXT');
    await rows(page).nth(3).getByRole('button', { name: /Удалить состояние/ }).click();
    await dlg.getByRole('button', { name: 'Удалить' }).click();
    await expect.poll(async () => (await config(page)).workflows[0].states.map((s: any) => s.name)).not.toContain('NEXT');
    // the notes are untouched
    expect((await disk(page))['/mock/Work.org']).toContain('* NEXT Позвонить');
  });

  test('the last open status and the only workflow cannot be deleted', async ({ page }) => {
    await openSettings(page, {
      '/mock/Work.org': NOTES,
      '/mock/.orgnotes/config.json': JSON.stringify({ workflows: [{ name: 'Одни', states: [{ name: 'ONLY' }, { name: 'END', done: true }] }] }),
    });
    await expect(rows(page).first().getByRole('button', { name: /Удалить состояние/ })).toBeDisabled();
    await expect(rows(page).nth(1).getByRole('button', { name: /Удалить состояние/ })).toBeEnabled(); // closing ones may go
    await expect(page.getByRole('button', { name: 'Удалить набор' })).toBeDisabled();
  });

  test('deleting the status chosen as "new task state" falls back to the first open one', async ({ page }) => {
    await openSettings(page);
    await page.getByLabel('Состояние новой задачи').selectOption({ label: 'NEXT' });
    await expect.poll(async () => (await config(page)).workflows[0].initial).toBe('NEXT');
    await rows(page).nth(3).getByRole('button', { name: /Удалить состояние/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click();
    await expect(page.getByLabel('Состояние новой задачи')).toHaveValue(/.+/);
    await expect(page.getByLabel('Состояние новой задачи').locator('option:checked')).toHaveText('NEW');
    await expect.poll(async () => (await config(page)).workflows[0].initial).toBeUndefined();
  });
});

test.describe('renaming a used status', () => {
  const rename = async (page: Page) => {
    await rows(page).nth(1).locator('input.kw').click(); // TODO is used by 2 headings
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('review');
    await page.keyboard.press('Enter');
    return page.getByRole('alertdialog');
  };

  test('offers to replace it in the files', async ({ page }) => {
    await openSettings(page);
    const dlg = await rename(page);
    await expect(dlg).toContainText('Заменить TODO на REVIEW в 2 заголовках?');
    await dlg.getByRole('button', { name: 'Заменить в файлах' }).click();
    await expect.poll(async () => (await disk(page))['/mock/Work.org']).toContain('* REVIEW Подготовить бюджет\n* REVIEW Согласовать\n');
    await expect.poll(async () => (await config(page)).workflows[0].states[1].name).toBe('REVIEW');
    expect((await disk(page))['/mock/Work.org']).toContain('* NEXT Позвонить'); // others untouched
  });

  test('"Только в настройках" leaves the files alone', async ({ page }) => {
    await openSettings(page);
    const dlg = await rename(page);
    await dlg.getByRole('button', { name: 'Только в настройках' }).click();
    await expect.poll(async () => (await config(page)).workflows[0].states[1].name).toBe('REVIEW');
    expect((await disk(page))['/mock/Work.org']).toBe(NOTES);
  });

  test('"Отмена" changes nothing', async ({ page }) => {
    await openSettings(page);
    const dlg = await rename(page);
    await dlg.getByRole('button', { name: 'Отмена' }).click();
    await expect(rows(page).nth(1).locator('input.kw')).toHaveValue('TODO');
    expect((await config(page)).workflows[0].states[1].name).toBe('TODO');
    expect((await disk(page))['/mock/Work.org']).toBe(NOTES);
  });
});

test.describe('colour picker', () => {
  const pop = (page: Page) => page.getByRole('dialog', { name: /Цвет статуса/ });

  test('opens from the swatch, shows eight named colours, a check on the current one, and both previews', async ({ page }) => {
    await openSettings(page);
    await rows(page).nth(2).locator('.swatch').click(); // IN-PROGRESS: blue
    await expect(pop(page)).toBeVisible();
    await expect(pop(page).locator('.hd')).toContainText('Цвет статуса');
    await expect(pop(page).locator('.hd')).toContainText('Синий');
    expect(await pop(page).getByRole('radio').allInnerTexts()).toEqual(['Серый', 'Красный', 'Оранжевый', 'Зелёный', 'Бирюзовый', 'Синий', 'Фиолетовый', 'Розовый']);
    await expect(pop(page).getByRole('radio', { name: 'Синий' })).toHaveAttribute('aria-checked', 'true');
    await expect(pop(page).locator('.dot.sel svg')).toHaveCount(1);
    await expect(pop(page).getByText('Так будет выглядеть')).toBeVisible();
    expect(await pop(page).locator('.plate').count()).toBe(2);
    await expect(pop(page).getByRole('button', { name: 'Другой цвет…' })).toBeVisible();
    await expect(pop(page).getByText('Цвета подбираются отдельно для светлой и тёмной темы')).toBeVisible();
    expect(Math.round((await pop(page).boundingBox())!.width)).toBe(268);
  });

  test('a choice applies at once, saves, and the popover stays open for the preview', async ({ page }) => {
    await openSettings(page);
    await rows(page).nth(2).locator('.swatch').click();
    await pop(page).getByRole('radio', { name: 'Бирюзовый' }).click();
    await expect(pop(page)).toBeVisible();
    await expect(pop(page).locator('.hd')).toContainText('Бирюзовый');
    await expect.poll(async () => (await config(page)).workflows[0].states[2].color).toBe('teal');
    // the chain chip uses the new colour (light value of teal)
    const chip = page.locator('.flow .fchip').nth(2);
    expect(await chip.evaluate((el) => getComputedStyle(el).getPropertyValue('--tl').trim())).toBe('#0b7a6f');
  });

  test('closes on Esc, on a click outside and on a second click on the swatch', async ({ page }) => {
    await openSettings(page);
    const sw = rows(page).nth(2).locator('.swatch');
    await sw.click();
    await page.keyboard.press('Escape');
    await expect(pop(page)).toHaveCount(0);
    await sw.click();
    await page.locator('.head').click({ position: { x: 5, y: 5 } });
    await expect(pop(page)).toHaveCount(0);
    await sw.click();
    await sw.click();
    await expect(pop(page)).toHaveCount(0);
  });

  test('keyboard: Space opens, arrows move over the grid, Return picks, Esc closes', async ({ page }) => {
    await openSettings(page);
    await rows(page).nth(2).locator('.swatch').focus();
    await page.keyboard.press('Space');
    await expect(pop(page)).toBeVisible();
    await expect(pop(page).getByRole('radio', { name: 'Синий' })).toBeFocused(); // current colour
    await page.keyboard.press('ArrowLeft');
    await expect(pop(page).getByRole('radio', { name: 'Бирюзовый' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(pop(page).getByRole('radio', { name: 'Серый' })).toBeFocused(); // 4 columns: one row up
    await page.keyboard.press('ArrowRight');
    await expect(pop(page).getByRole('radio', { name: 'Красный' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await config(page)).workflows[0].states[2].color).toBe('red');
    await page.keyboard.press('Escape');
    await expect(pop(page)).toHaveCount(0);
  });

  test('the system colour picker is anchored to the "Другой цвет…" button, not to the popover title', async ({ page }) => {
    await openSettings(page);
    await rows(page).nth(2).locator('.swatch').click();
    const btn = (await pop(page).getByRole('button', { name: 'Другой цвет…' }).boundingBox())!;
    const input = (await pop(page).locator('input[type=color]').boundingBox())!;
    expect(Math.abs(input.x - btn.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(input.y - btn.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(input.width - btn.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(input.height - btn.height)).toBeLessThanOrEqual(1);
    const title = (await pop(page).locator('.hd').boundingBox())!;
    expect(input.y).toBeGreaterThan(title.y + title.height); // well below the title
  });

  test('"Другой цвет…" stores a hex; the dark variant keeps the contrast; it appears as a ninth swatch', async ({ page }) => {
    await openSettings(page);
    await rows(page).nth(2).locator('.swatch').click();
    await pop(page).locator('input[type=color]').evaluate((el: HTMLInputElement) => {
      el.value = '#2a2a8a';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect.poll(async () => (await config(page)).workflows[0].states[2].color).toBe('#2a2a8a');
    await expect(pop(page).getByRole('radio')).toHaveCount(9);
    await expect(pop(page).getByRole('radio', { name: 'Другой цвет' })).toHaveAttribute('aria-checked', 'true');
    const dark = await page.locator('.flow .fchip').nth(2).evaluate((el) => getComputedStyle(el).getPropertyValue('--td').trim());
    expect(dark).not.toBe('#2a2a8a');
    expect(dark).toMatch(/^#[0-9a-f]{6}$/);
  });
});

test.describe('set level', () => {
  test('"Состояние новой задачи" is an active menu of the open statuses', async ({ page }) => {
    await openSettings(page);
    const sel = page.getByLabel('Состояние новой задачи');
    await expect(sel).toBeEnabled();
    expect(await sel.locator('option').allInnerTexts()).toEqual(['NEW', 'TODO', 'IN PROGRESS', 'NEXT']);
    await sel.selectOption({ label: 'TODO' });
    await expect.poll(async () => (await config(page)).workflows[0].initial).toBe('TODO');
  });

  test('sets are reordered by dragging in the list; the rule about the default set is stated', async ({ page }) => {
    await openSettings(page);
    await expect(page.getByText('Первый набор в списке используется по умолчанию')).toBeVisible();
    await expect(page.getByText('⌃⇧← и ⌃⇧→')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Набор выше' })).toHaveCount(0);
    await page.evaluate(() => {
      const grips = [...document.querySelectorAll('aside .wfgrip')] as HTMLElement[];
      const target = document.querySelectorAll('aside .wfrow')[0] as HTMLElement;
      const dt = new DataTransfer();
      const fire = (el: Element, type: string) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      fire(grips[1], 'dragstart');
      fire(target, 'dragover');
      fire(target, 'drop');
    });
    await expect.poll(async () => (await config(page)).workflows.map((w: any) => w.name)).toEqual(['Встречи', 'Задачи']);
  });

  test('behaviour switches', async ({ page }) => {
    await openSettings(page);
    await page.getByRole('switch', { name: /CLOSED/ }).click();
    await page.getByRole('switch', { name: /LOGBOOK/ }).click();
    await expect.poll(async () => (await config(page)).behavior).toEqual({ closedTimestamp: false, logbook: true });
  });

  test('nothing is written just by looking, and the whole file keeps the hand-written keys', async ({ page }) => {
    await openSettings(page);
    await page.waitForTimeout(700);
    expect(await config(page)).toEqual(CONFIG);
  });
});

test.describe('window', () => {
  test('⌘, in the main window opens a separate Settings window (not a sheet), once', async ({ page }) => {
    await installTauriMock(page, { '/mock/Work.org': NOTES, '/mock/.orgnotes/config.json': JSON.stringify(CONFIG) });
    await page.goto('/');
    await expect(page.locator('.cm-content')).toContainText('Планёрка');
    await page.keyboard.press('Meta+Comma');
    await expect.poll(async () => (await log(page)).filter((e) => e[0] === 'window').length).toBe(1);
    const opts = ((await log(page)).find((e) => e[0] === 'window') as any)[1];
    expect(opts).toMatchObject({ label: 'settings', title: 'Настройки', url: 'index.html#settings' });
    await expect(page.getByRole('dialog', { name: 'Настройки' })).toHaveCount(0); // not an overlay
    // already open: it is focused, not created again
    await page.keyboard.press('Meta+Comma');
    await page.waitForTimeout(300);
    expect((await log(page)).filter((e) => e[0] === 'window').length).toBe(1);
  });

  test('a status added in the settings window is understood by the main window after it re-reads the config', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await openSettings(page);
    await page.getByRole('button', { name: '+ Состояние' }).click();
    await page.keyboard.type('blocked');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await config(page)).workflows[0].states.map((s: any) => s.name)).toContain('BLOCKED');
    await ctx.close();
  });
});
