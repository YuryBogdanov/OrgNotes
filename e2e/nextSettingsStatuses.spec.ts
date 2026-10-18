import { expect, test, type Page } from '@playwright/test';
import { diskAll, openApp } from './helpers';

// ТЗ 54.6: «Статусы» of the new settings — the sets on the left, the chosen one's states in «В работе» and
// «Завершённые» (the colour by a menu, the keyword, its key, «новая задача», ×, «+ Состояние»), «В файле» `#+TODO:`;
// a keyword in use asks before it is renamed in the files; the order by ⌥↑↓; written to the config at once.

const CONFIG = JSON.stringify({
  version: 1,
  workflows: [
    { name: 'Задачи', states: [{ name: 'TODO' }, { name: 'NEXT', color: 'blue' }, { name: 'DONE', done: true }] },
    { name: 'Встречи', states: [{ name: 'MEETING' }, { name: 'FINISHED', done: true }] },
  ],
});
const F: Record<string, string> = { '/mock/Work.org': '* TODO Задача\n* NEXT Следующая\n', '/mock/.orgnotes/config.json': CONFIG };
async function open(page: Page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: F, ready: false, viewport: { width: 1440, height: 900 } });
  await expect(page.getByRole('tree', { name: 'Файлы' })).toBeVisible();
  await page.keyboard.press('Meta+,');
  const s = page.getByRole('dialog', { name: 'Настройки' });
  await s.getByRole('tab', { name: 'Статусы', exact: true }).click();
  return s;
}
const cfg = async (page: Page) => JSON.parse((await diskAll(page))['/mock/.orgnotes/config.json']);
const work = (page: Page) => page.getByRole('region', { name: 'Состояния в работе' });

test('the sets and the chosen one; a state added with its key; the colour; «новая задача»; the line in the file', async ({ page }) => {
  const s = await open(page);
  const sets = s.getByRole('listbox', { name: 'Наборы статусов' }).getByRole('option');
  await expect(sets).toHaveCount(2);
  await expect(sets.first()).toContainText('TODO · NEXT · DONE');
  await expect(s.getByRole('textbox', { name: 'Название набора' })).toHaveValue('Задачи');
  await expect(s.getByLabel('Строка #+TODO')).toContainText('#+TODO: TODO(t) NEXT(n) | DONE(d)');
  await expect(work(page).getByRole('group').first()).toContainText('новая задача');
  // + Состояние: REVIEW, then its key
  await work(page).getByRole('button', { name: '+ Состояние' }).click();
  const kw = work(page).getByRole('textbox', { name: 'Ключевое слово в файле' }).last();
  await expect(kw).toBeFocused();
  await kw.fill('review');
  await kw.press('Enter');
  await expect(s.getByLabel('Строка #+TODO')).toContainText('REVIEW(r)');
  await expect.poll(async () => (await cfg(page)).workflows[0].states.map((x: { name: string }) => x.name)).toEqual(['TODO', 'NEXT', 'REVIEW', 'DONE']);
  // the colour of REVIEW: a menu of the named ones
  await work(page).getByRole('group', { name: /^REVIEW/ }).getByRole('button', { name: /^Цвет:/ }).click();
  await page.getByRole('menuitem', { name: 'Фиолетовый' }).click();
  await expect.poll(async () => (await cfg(page)).workflows[0].states[2].color).toBe('purple');
  // NEXT made the new task's state
  const next = work(page).getByRole('group', { name: /^NEXT/ });
  await next.hover();
  await next.getByRole('button', { name: 'сделать новой' }).click();
  await expect(next).toContainText('новая задача');
  // ⌥↓ on NEXT: after REVIEW
  await next.focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(s.getByLabel('Строка #+TODO')).toContainText('TODO(t) REVIEW(r) NEXT(n)');
  // another set
  await sets.nth(1).click();
  await expect(s.getByRole('textbox', { name: 'Название набора' })).toHaveValue('Встречи');
});

test('a keyword in use: «Заменить в файлах» renames it in the notes; deleting one in use asks', async ({ page }) => {
  const s = await open(page);
  const kw = work(page).getByRole('textbox', { name: 'Ключевое слово в файле' }).nth(1);
  await kw.fill('LATER');
  await kw.press('Enter');
  const sh = page.getByRole('alertdialog', { name: 'Переименование статуса' });
  await expect(sh).toContainText('Заменить NEXT на LATER в 1 заголовках?');
  await sh.getByRole('button', { name: 'Заменить в файлах' }).click();
  await expect.poll(async () => (await diskAll(page))['/mock/Work.org']).toContain('* LATER Следующая');
  await work(page).getByRole('button', { name: 'Удалить состояние TODO' }).click();
  const del = page.getByRole('alertdialog', { name: 'Удаление статуса' });
  await expect(del).toContainText('TODO используется в 1 заголовках');
  await page.keyboard.press('Escape');
  await expect(del).toHaveCount(0);
  await expect(s).toBeVisible();
  await expect(work(page).getByRole('textbox', { name: 'Ключевое слово в файле' }).first()).toHaveValue('TODO');
});
