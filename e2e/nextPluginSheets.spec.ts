import { expect, test, type Page } from '@playwright/test';
import { diskAll as disk, openApp } from './helpers';

// ТЗ 44.4 (§4): the plugins' forms and sheets in the new interface — over the title the plugin's name in `plug`; the
// fields under their labels (a text with its suggestions in a popover, a day from the palette's calendar, a check, a
// file and its heading in two columns, the plugin's own field in the compatibility layer); `validate` under the first
// field; a plugin's own sheet with its buttons; its menu; the choice of a place in the new palette.

const NOW = new Date(2026, 9, 16, 11, 0);
const WORK = '* Проекты\n* Встречи\n';
const MID = ['#+TODO: TODO NEXT WAIT | DONE', '* NEXT Миграция биллинга', '* Квартальный план команды', ':PROPERTIES:', ':WAITING_ON: бизнес', ':END:', ''].join('\n');
const store = (page: Page, code: string) => page.evaluate(async (c) => new Function('store', `return (async () => { ${c} })()`)((await import('/src/store.svelte.ts' as string)).store), code);

async function open(page: Page, plugins: Record<string, string[]>) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/Work.org': WORK, '/mock/Midterm.org': MID }, plugins, now: NOW, ready: false, viewport: { width: 1440, height: 860 } });
  await expect(page.locator('.next[data-ui="next"]')).toBeVisible();
  await expect.poll(() => store(page, 'return store.loaded')).toBe(true);
}
async function command(page: Page, title: string) {
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type(title);
  await expect(page.getByRole('dialog', { name: 'Командная палитра' }).getByRole('option', { selected: true })).toContainText(title);
  await page.keyboard.press('Enter');
}
async function run(page: Page, title: string) {
  await store(page, "store.setNavMode('files')");
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'Work' }).click();
  await command(page, title);
}

test('«Привет: заметка…»: 640 pt, the plugin over the title, the columns, the day from the palette, the reason under the first field', async ({ page }) => {
  await open(page, { hello: ['index.read', 'files.edit'] });
  await run(page, 'Привет: заметка');
  const f = page.getByRole('dialog', { name: 'Заметка' });
  await expect(f).toBeVisible();
  expect(await f.evaluate((e) => !e.closest('.compat'))).toBe(true);
  expect(Math.round((await f.boundingBox())!.width)).toBe(640);
  await expect(f.locator('.eyebrow')).toHaveText('Привет');
  await expect(f.locator('.hx')).toHaveText('0 стр.'); // the plugin's piece by the title
  // the reason, under the first field
  await f.getByRole('button', { name: /^Добавить/ }).click();
  await expect(f.getByRole('alert')).toHaveText('Выберите файл и заголовок');
  // the columns: the file, then its heading; the plugin sets the title on the file chosen
  await f.getByRole('listbox', { name: 'Файлы' }).getByRole('option', { name: /Work/ }).click();
  await expect(f.getByRole('textbox', { name: 'Заголовок' })).toHaveValue('Заметка о Work');
  await f.getByRole('listbox', { name: 'Заголовки первого уровня' }).getByRole('option', { name: 'Встречи' }).click();
  await expect(f.getByRole('listbox', { name: 'Заголовки первого уровня' }).getByRole('option', { name: 'Встречи' })).toHaveAttribute('aria-selected', 'true');
  // the plugin's own field draws in the old variables
  await expect(f.locator('.compat .hello-mood')).toHaveCount(2);
  await f.getByRole('textbox', { name: 'Текст' }).fill('- первое');
  await expect(f.locator('.hx')).toHaveText('1 стр.');
  // the day: the field with «◷» opens the palette's calendar over the form
  await f.getByRole('button', { name: 'День' }).click();
  const cal = page.getByRole('dialog', { name: 'Командная палитра' });
  await expect(cal).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(cal).toHaveCount(0);
  await expect(f.getByRole('button', { name: 'День' })).toContainText('16 октября 2026');
  await f.getByRole('button', { name: /^Добавить/ }).click();
  await expect(f).toHaveCount(0);
  await expect.poll(async () => (await disk(page))['/mock/Work.org']).toMatch(/\* Встречи\n\*\* Заметка о Work +:ok:\nSCHEDULED: <2026-10-16 [^>]+>\n- первое\n/);
});

test('«Ждём…» of «Долгие дела»: the text\'s suggestions in a popover, ↓ ↩ takes one; the check; ⎋ closes the popover first', async ({ page }) => {
  await open(page, { 'long-matters': ['index.read', 'files.edit'] });
  await page.getByRole('tree', { name: 'Файлы' }).getByRole('treeitem', { name: 'Midterm' }).click();
  await page.locator('.cm-line', { hasText: 'Миграция биллинга' }).click();
  await command(page, 'Ждём');
  const f = page.getByRole('dialog', { name: 'Ждём: Миграция биллинга' });
  await expect(f).toBeVisible();
  expect(Math.round((await f.boundingBox())!.width)).toBe(460);
  await expect(f.locator('.eyebrow')).toHaveText('Долгие дела');
  await expect(f.getByRole('checkbox', { name: 'Поставить статус WAIT' })).toBeChecked();
  const who = f.getByRole('textbox', { name: 'Кого или что ждём' });
  await expect(who).toBeFocused();
  await page.keyboard.type('би');
  const sug = f.getByRole('listbox', { name: 'Подсказки' });
  await expect(sug.getByRole('option')).toHaveText(['биновое', 'бизнес1 дело']);
  await expect(sug.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(sug).toHaveCount(0);
  await expect(f).toBeVisible();
  await page.keyboard.type('з'); // typing brings it back
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(who).toHaveValue('бизнес');
  await expect(f).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(f).toHaveCount(0);
  await expect.poll(async () => (await disk(page))['/mock/Midterm.org']).toContain('* WAIT Миграция биллинга\n:PROPERTIES:\n:WAITING_ON: бизнес\n:END:\n');
});

test('a plugin\'s own sheet, its menu and the choice of a place: the new ones', async ({ page }) => {
  await open(page, { hello: ['index.read', 'files.edit'] });
  await run(page, 'Привет: о плагине');
  const s = page.getByRole('dialog', { name: 'О плагине «Привет»' });
  await expect(s).toBeVisible();
  expect(await s.evaluate((e) => !e.closest('.compat'))).toBe(true);
  await expect(s.locator('.compat .hello-about')).toHaveText('Пример плагина: всё — через API.');
  await expect(s.getByRole('button', { name: /Понятно/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(s).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Лист закрыт: ok');
  // its menu: the new one
  await page.getByRole('button', { name: 'Привет' }).click();
  await page.locator('.hello-files button', { hasText: 'Work' }).click({ button: 'right' });
  const m = page.getByRole('menu');
  await expect(m.getByRole('menuitem')).toHaveText(['Открыть', 'Скопировать путь', 'Поздороваться']);
  expect(await m.evaluate((e) => !e.closest('.compat'))).toBe(true);
  await page.keyboard.press('Escape');
  // a form with segments and a check, then `ui.pickPlace`: the new palette
  await run(page, 'Привет: новая задача');
  const f = page.getByRole('dialog', { name: 'Новая задача' });
  await page.keyboard.type('Позвонить');
  await f.getByRole('radio', { name: 'NEXT' }).click();
  await expect(f.getByRole('radio', { name: 'NEXT' })).toHaveAttribute('aria-checked', 'true');
  await expect(f.getByRole('checkbox', { name: 'Запланировать на день' })).not.toBeChecked();
  await f.getByRole('button', { name: /^Дальше/ }).click();
  const p = page.getByRole('dialog', { name: 'Куда добавить' });
  await expect(p).toBeVisible();
  expect(await p.evaluate((e) => !e.closest('.compat'))).toBe(true);
  await page.keyboard.type('Work');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // its 1st level
  await expect(p).toHaveCount(0);
  await expect.poll(async () => (await disk(page))['/mock/Work.org']).toContain('* NEXT Позвонить');
});
