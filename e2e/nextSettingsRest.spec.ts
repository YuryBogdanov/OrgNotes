import { expect, test, type Page } from '@playwright/test';
import { diskAll, openApp } from './helpers';

// ТЗ 54.7: «Сегодня», «Теги», «Агенды», «Inbox» of the new settings — the rules of §2: groups, rows, the switches,
// segments and menus; the chips of «Сегодня» and «Теги»; deleting an agenda asks in a sheet.

const CFG = JSON.stringify({ version: 1, tags: { colors: {}, noInherit: [] }, agendas: [{ id: 'a1', name: 'Инфра', sources: [], blocks: [{ id: 'b1', name: 'X', color: 'blue', conds: [], group: 'none', sort: 'prio', limit: null }] }] });
const F: Record<string, string> = { '/mock/Work.org': '* TODO Задача :infra:\n* NEXT Ещё :infra:dev:\n', '/mock/.orgnotes/config.json': CFG };
async function open(page: Page, section: string) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: F, ready: false, viewport: { width: 1440, height: 900 } });
  await expect(page.getByRole('tree', { name: 'Файлы' })).toBeVisible();
  await page.keyboard.press('Meta+,');
  const s = page.getByRole('dialog', { name: 'Настройки' });
  await s.getByRole('tab', { name: section, exact: true }).click();
  await expect(s.locator('h1')).toHaveText(section);
  return s;
}
const cfg = async (page: Page) => JSON.parse((await diskAll(page))['/mock/.orgnotes/config.json']);

test('«Сегодня»: a status chip added by its menu and taken off; a block off', async ({ page }) => {
  const s = await open(page, 'Сегодня');
  const st = s.getByRole('group', { name: 'Статусы' });
  const before = await st.locator('.cap').count();
  await st.getByRole('button', { name: 'Добавить статус' }).click();
  await page.getByRole('menuitem').first().click();
  await expect(st.locator('.cap')).toHaveCount(before + 1);
  await st.locator('.cap').last().getByRole('button').click();
  await expect(st.locator('.cap')).toHaveCount(before);
  const blk = s.locator('.blk').first().getByRole('switch');
  const was = await blk.getAttribute('aria-checked');
  await blk.click();
  await expect(blk).not.toHaveAttribute('aria-checked', was!);
});

test('«Теги»: a tag not inherited added; a tag\'s colour by its menu', async ({ page }) => {
  const s = await open(page, 'Теги');
  const add = s.getByRole('textbox', { name: 'Добавить тег, который не наследуется' });
  await add.fill('1on1');
  await add.press('Enter');
  await expect(s.getByRole('group', { name: 'Не наследовать теги' })).toContainText(':1on1:');
  await expect.poll(async () => (await cfg(page)).tags.noInherit).toEqual(['1on1']);
  await s.getByRole('button', { name: 'Цвет тега infra' }).click();
  await page.getByRole('menuitem', { name: 'Синий' }).click();
  await expect(s.getByRole('button', { name: 'Цвет тега infra' })).toContainText('Синий');
  await expect.poll(async () => (await cfg(page)).tags.colors.infra).toBe('blue');
});

test('«Агенды»: my agendas, deleting asks in a sheet; «Inbox»: where to add, the status', async ({ page }) => {
  const s = await open(page, 'Агенды');
  await expect(s.locator('.row').first()).toContainText('Инфра');
  await expect(s.locator('.row').first()).toContainText('1 блок');
  await s.getByRole('button', { name: 'Удалить агенду Инфра' }).click();
  const sh = page.getByRole('alertdialog', { name: 'Удаление агенды' });
  await expect(sh).toContainText('Удалить агенду «Инфра»?');
  await sh.getByRole('button', { name: 'Удалить' }).click();
  await expect(s.locator('.row').first()).toContainText('Своих агенд пока нет');
  await s.getByRole('tab', { name: 'Inbox', exact: true }).click();
  await s.getByRole('radiogroup', { name: 'Куда добавлять' }).getByRole('radio', { name: 'В конец' }).click();
  await expect(s.getByRole('radiogroup', { name: 'Куда добавлять' }).getByRole('radio', { name: 'В конец' })).toHaveAttribute('aria-checked', 'true');
  await s.getByRole('button', { name: /^Статус новой задачи:/ }).click();
  await page.getByRole('menuitem', { name: 'Начальный статус набора' }).click();
  await expect(s.getByRole('button', { name: /^Статус новой задачи:/ })).toContainText('Начальный статус набора');
  await expect(s).toBeVisible();
});
