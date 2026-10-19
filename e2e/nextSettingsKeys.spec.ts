import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 54.4: «Клавиши» and «Мини-окно» of the new settings — the field, the sets, «Сбросить все»; a row's chips
// (recording one, «+», «Назначить», ↺, the dot), a clash asked under the row; «Мини-окно»'s schema in rows and its
// keys — a click opens «Клавиши» on that command.

const F: Record<string, string> = { '/mock/Midterm.org': '* TODO Переезд\n' };
async function open(page: Page, section: string) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: F, ready: false, viewport: { width: 1400, height: 900 } });
  await expect(page.getByRole('tree', { name: 'Файлы' })).toBeVisible();
  await page.keyboard.press('Meta+,');
  const s = page.getByRole('dialog', { name: 'Настройки' });
  await s.getByRole('tab', { name: section, exact: true }).click();
  return s;
}
const row = (page: Page, id: string) => page.locator(`.row[data-id="${id}"]`);
const chips = (page: Page, id: string) => row(page, id).locator('.chip');

test('a row: «+» records a second shortcut — the dot, ↺; ⎋ cancels a recording, not the sheet', async ({ page }) => {
  const s = await open(page, 'Клавиши');
  await expect(s.getByRole('textbox', { name: 'Команда или сочетание' })).toBeVisible();
  await expect(s.getByRole('radiogroup', { name: 'Набор сочетаний' }).getByRole('radio', { name: 'Как в Emacs' })).toHaveAttribute('aria-checked', 'true');
  await row(page, 'paletteGoto').hover();
  await row(page, 'paletteGoto').getByRole('button', { name: 'Добавить сочетание: Перейти к файлу…' }).click();
  await expect(row(page, 'paletteGoto').locator('.chip.rec')).toHaveText('Нажмите сочетание…');
  await page.keyboard.press('Meta+p');
  await expect(chips(page, 'paletteGoto')).toHaveText(['⇧⌘O', '⌘P']);
  await expect(row(page, 'paletteGoto').locator('.dot')).toHaveCount(1);
  await expect(s.getByRole('button', { name: 'Сбросить все' })).toBeEnabled();
  // ⎋ while recording: the recording's
  await chips(page, 'paletteGoto').first().click();
  await page.keyboard.press('Escape');
  await expect(s).toBeVisible();
  await expect(chips(page, 'paletteGoto')).toHaveText(['⇧⌘O', '⌘P']);
  await row(page, 'paletteGoto').getByRole('button', { name: 'Вернуть по умолчанию: Перейти к файлу…' }).click();
  await expect(chips(page, 'paletteGoto')).toHaveText(['⇧⌘O']);
  await expect(row(page, 'paletteGoto').locator('.dot')).toHaveCount(0);
});

test('a chord; a clash asked under the row, «Заменить» moves it; the search; «Сбросить все» asks', async ({ page }) => {
  const s = await open(page, 'Клавиши');
  await chips(page, 'tags').first().click();
  await page.keyboard.press('Control+c');
  await expect(row(page, 'tags').locator('.chip.rec')).toHaveText('⌃C …');
  await page.keyboard.press('g');
  await expect(chips(page, 'tags')).toHaveText(['⌃C G', '⌃C ⌃Q']);
  await expect(row(page, 'tags')).toContainText('Аккорд: ⌃C, затем G');
  await chips(page, 'refile').click();
  await page.keyboard.press('Meta+e');
  await expect(row(page, 'refile').getByRole('alert')).toContainText('⌘E уже назначено команде «Искать выделенное»');
  await row(page, 'refile').getByRole('button', { name: 'Заменить' }).click();
  await expect(chips(page, 'refile')).toHaveText(['⌘E']);
  await expect(chips(page, 'useSelection')).toHaveText(['Назначить']);
  await s.getByRole('textbox', { name: 'Команда или сочетание' }).fill('архив');
  await expect(row(page, 'archive')).toBeVisible();
  await expect(row(page, 'refile')).toHaveCount(0);
  await s.getByRole('textbox', { name: 'Команда или сочетание' }).fill('');
  await s.getByRole('button', { name: 'Сбросить все' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Сбросить' }).click();
  await expect(chips(page, 'tags')).toHaveText(['⌃C Q', '⌃C ⌃Q']);
  await expect(s).toBeVisible();
});

test('«Мини-окно»: its rows, its keys; a click — «Клавиши» on the command', async ({ page }) => {
  const s = await open(page, 'Мини-окно');
  await expect(s.locator('section.grp .cap')).toHaveText(['Прозрачность', 'Поведение', 'Клавиши'], { ignoreCase: true });
  await expect(s.locator('.row').filter({ hasText: 'Не гаснуть после ввода' }).getByRole('radio')).toHaveCount(4);
  await s.locator('.row').filter({ hasText: 'Открыть в мини-окне' }).click();
  await expect(s.locator('h1')).toHaveText('Клавиши');
  await expect(row(page, 'miniOpen').locator('.chip').first()).toBeFocused();
});
