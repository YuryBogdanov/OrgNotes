import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

// ТЗ 42.10 (§5.6): over a link in the new interface, after half a second — the card: a heading's path, its status and
// title, the first lines of its body, the ID; a broken link — «Не найдено» and «Исправить…», which opens «Ссылка на…».

const A = ['* Тексты', 'См. [[id:mig-1][миграцию]] и [[id:nope][пропажу]].', ''].join('\n');
const B = ['#+TITLE: Проекты', '* Работа', '** TODO Миграция', ':PROPERTIES:', ':ID: mig-1', ':END:', 'Перенести базу в новый кластер.', 'Согласовать окно.', ''].join('\n');

test('the new interface: the card of a heading; a broken link offers «Исправить…»', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': A, '/mock/b.org': B }, ready: false });
  await expect(page.locator('[data-ui="next"] .cm-content')).toBeVisible();
  await page.locator('.cm-content').getByText('миграцию').hover();
  const card = page.locator('.cm-lcard');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Миграция');
  await expect(card.locator('.lc-kw')).toHaveText('TODO');
  await expect(card).toContainText('Перенести базу');
  await expect(card).toContainText('Работа');
  await expect(card.locator('.lc-ref')).toHaveText('id:mig-1');
  await page.mouse.move(5, 5);
  await expect(card).toHaveCount(0);
  await page.locator('.cm-content').getByText('пропажу').hover();
  await expect(card).toContainText('Не найдено');
  await card.getByRole('button', { name: 'Исправить…' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('the old interface keeps its plain tooltip', async ({ page }) => {
  await openApp(page, { files: { '/mock/a.org': A, '/mock/b.org': B } });
  await page.locator('.cm-content').getByText('миграцию').hover();
  await page.waitForTimeout(800);
  await expect(page.locator('.cm-lcard')).toHaveCount(0);
});
