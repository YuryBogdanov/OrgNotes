import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 40.4: the plugin «Долгие дела» — which headings are long matters, the navigator's section (groups, ages, a click
// and ⌥-click), the tab of the list (counts, the filter kept, the bar of approximate dates, ↑↓ ↩), an edit moving a
// matter out of «Пора проверить».

const NOW = new Date(2026, 9, 16, 11, 0);
const MID = [
  '* WAIT Миграция биллинга',
  ':PROPERTIES:',
  ':WAITING_ON: бизнес',
  ':NEXT_REVIEW: [2026-10-30 Пт]',
  ':END:',
  ':LOGBOOK:',
  '- Note taken on [2026-10-02 Чт 11:20] \\\\',
  '  ждём решения бизнеса по срокам',
  ':END:',
  '* Квартальный план команды',
  ':LOGBOOK:',
  '- Note taken on [2026-09-06 Вс 10:00] \\\\',
  '  черновик у Глеба',
  ':END:',
  '* TODO Регламент дежурств',
  '** TODO Подзадача',
  '* DONE Закрытое',
  '',
].join('\n');
const WORK = ['* TODO Обновить онбординг :long:', '** TODO Анкета', '* TODO Не долгое', ''].join('\n');
const FILE_TIME = new Date(2026, 9, 12, 9, 0).getTime(); // 4 days before NOW: «Регламент» is calm

async function open(page: Page) {
  await page.addInitScript((m) => ((window as any).__mtimeInit = m), { '/mock/Midterm.org': FILE_TIME, '/mock/work.org': new Date(2026, 8, 1).getTime() });
  await openApp(page, { files: { '/mock/Midterm.org': MID, '/mock/work.org': WORK }, now: NOW });
  await page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Долгие дела' }).click();
}
const nav = (page: Page) => page.getByRole('navigation', { name: 'Долгие дела' });
const tab = (page: Page) => page.getByRole('grid', { name: 'Долгие дела' });

test('the navigator: long matters by place and by own tag, by group, the most overdue first; «В норме» folded', async ({ page }) => {
  await open(page);
  await expect(nav(page)).toContainText('ДОЛГИЕ ДЕЛА · 4');
  await expect(nav(page).locator('.grp')).toHaveText([/Пора проверить\s*2/, /Ждём\s*1/, /В норме\s*1/]);
  await expect(nav(page).locator('.row .nm')).toHaveText(['Обновить онбординг', 'Квартальный план команды', 'Миграция биллинга']);
  await expect(nav(page).locator('.row').first().locator('.age')).toHaveText('≈ 45 дн.');
  await expect(nav(page).locator('.row').first().locator('.age')).toHaveClass(/late/);
  await nav(page).getByRole('button', { name: /В норме/ }).click();
  await expect(nav(page).locator('.row .nm').last()).toHaveText('Регламент дежурств');
  // the hint: the last status, whom we wait for, the day to look
  await expect(nav(page).locator('.row', { hasText: 'Миграция' })).toHaveAttribute('title', /2 окт: ждём решения бизнеса по срокам\nЖдём: бизнес\nПроверить: 30 окт/);
  // a click opens the heading in the editor
  await nav(page).locator('.row', { hasText: 'Квартальный план' }).click();
  await expect(page.locator('.tab.on')).toContainText('Midterm');
  await expect(page.locator('.cm-activeLine')).toContainText('Квартальный план команды');
});

test('the tab: the counts, the filter kept with the tab, the bar of approximate dates; ↑↓ choose, ↩ opens', async ({ page }) => {
  await open(page);
  await nav(page).locator('.row', { hasText: 'Миграция' }).click({ modifiers: ['Alt'] }); // ⌥-click: the tab with it
  await expect(page.locator('.tab.on')).toContainText('Долгие дела');
  await expect(page.locator('.lmv .sub')).toHaveText('4 дела · 2 пора проверить');
  await expect(tab(page).locator('.row.on')).toContainText('Миграция биллинга');
  await expect(tab(page).locator('.row.on')).toContainText('ждём: бизнес');
  await expect(tab(page).locator('.row.on .due')).toHaveText('30 окт');
  await expect(tab(page).locator('.row', { hasText: 'Обновить онбординг' })).toContainText('work.org');
  await expect(tab(page).locator('.row', { hasText: 'Обновить онбординг' }).locator('.due')).toHaveText('просрочено 31 дн.');
  // the bar of the approximate dates goes for good
  await expect(page.getByRole('note')).toContainText('Даты восстановлены');
  await page.getByRole('button', { name: 'Понятно' }).click();
  await expect(page.getByRole('note')).toBeHidden();
  // the filter
  await page.getByRole('tab', { name: 'Без статуса · 2' }).click();
  await expect(tab(page).locator('.row .nm')).toHaveText(['Обновить онбординг', 'Регламент дежурств']);
  await page.getByRole('tab', { name: 'Все · 4' }).click();
  // keys: ↑ from «Миграция» is «Квартальный план», ↩ opens it
  await tab(page).focus();
  await page.keyboard.press('ArrowUp');
  await expect(tab(page).locator('.row.on')).toContainText('Квартальный план команды');
  await page.keyboard.press('Enter');
  await expect(page.locator('.cm-activeLine')).toContainText('Квартальный план команды');
  // shown again: the filter of the tab is kept
  await page.locator('.tab', { hasText: 'Долгие дела' }).click();
  await page.getByRole('tab', { name: 'Пора · 2' }).click();
  await page.locator('.tab', { hasText: 'Midterm' }).click();
  await page.locator('.tab', { hasText: 'Долгие дела' }).click();
  await expect(page.getByRole('tab', { name: 'Пора · 2' })).toHaveAttribute('aria-selected', 'true');
});

test('an edit of a matter (its subtask) touches it: out of «Пора проверить» at once, «0 дн.»', async ({ page }) => {
  await open(page);
  await page.locator('.cm-content').waitFor();
  await nav(page).locator('.row', { hasText: 'Обновить онбординг' }).click();
  await page.locator('.cm-line', { hasText: 'Анкета' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' для новичков');
  await expect(nav(page).locator('.grp')).toHaveText([/Пора проверить\s*1/, /Ждём\s*1/, /В норме\s*2/]);
  await nav(page).getByRole('button', { name: /В норме/ }).click();
  await expect(nav(page).locator('.row', { hasText: 'Обновить онбординг' }).locator('.age')).toHaveText('0 дн.');
});

test('none: the words and «Источники…»', async ({ page }) => {
  await openApp(page, { files: { '/mock/notes.org': '* TODO Просто задача\n' }, now: NOW });
  await page.getByRole('tablist', { name: 'Режимы навигатора' }).getByRole('tab', { name: 'Долгие дела' }).click();
  await expect(nav(page)).toContainText('Долгих дел пока нет. Добавьте тег :long: к заголовку или укажите файл в источниках.');
  await nav(page).getByRole('button', { name: 'Открыть список ›' }).click();
  await expect(page.locator('.lmv .empty')).toContainText('Долгих дел пока нет');
  await expect(page.locator('.lmv').getByRole('button', { name: 'Источники…' }).first()).toBeVisible();
});
