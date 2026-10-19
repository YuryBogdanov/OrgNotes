import { expect, test, type Page } from '@playwright/test';
import { openApp, palette, settingsSheet } from './helpers';

// ТЗ 42.11 (§8, §10), ТЗ 54.3: «Основные → Экспериментальное» (the old interface; the new one's in «Оформление → Текст») — «Шрифт текста», «Ширина текста», «Структура справа»: shown
// always, active with the new interface only, kept on this Mac; ⌃⌘E — «Оформление / Исходник»; ⌘K — «Искать везде»,
// a command of «Клавиши».

const DOC = ['#+TITLE: Платформа', '* Роадмап', 'текст', '* Переезд', ''].join('\n');
const content = (page: Page) => page.locator('[data-ui="next"] .cm-content');
const general = async (page: Page) => {
  await page.keyboard.press('Meta+,');
  const sheet = settingsSheet(page);
  await sheet.getByRole('tab', { name: 'Основные', exact: true }).click();
  return sheet;
};
// the new interface: in «Оформление → Текст» (ТЗ 54.3)
const look = async (page: Page) => {
  await page.keyboard.press('Meta+,');
  const sheet = settingsSheet(page);
  await sheet.getByRole('tab', { name: 'Оформление', exact: true }).click();
  return sheet;
};
/** «Шрифт текста» is the theme's (ТЗ 57.5): an own theme first, its text font from the font's menu. */
async function chooseFont(page: Page, sheet: ReturnType<typeof settingsSheet>, item: string) {
  await page.evaluate(async () => {
    const { store } = await import('/src/store.svelte.ts' as string);
    if (store.theme.builtin) await store.copyTheme(store.theme, 'Моя', store.appearance);
  });
  await sheet.getByRole('button', { name: /^Шрифт текста:/ }).click();
  await page.getByRole('listbox', { name: 'Шрифт текста' }).getByRole('option', { name: item }).click();
}

test('the old interface: the three settings shown, off', async ({ page }) => {
  await openApp(page, { files: { '/mock/a.org': DOC } });
  const sheet = await general(page);
  await expect(sheet.getByLabel('Шрифт текста')).toBeDisabled();
  await expect(sheet.getByLabel('Ширина текста')).toBeDisabled();
  await expect(sheet.getByRole('switch', { name: 'Структура справа' })).toBeDisabled();
});

test('the new interface: the font, the width and the column change at once and stay after a reload', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('set')) return;
    sessionStorage.setItem('set', '1');
    localStorage.setItem('ui:next', '1');
    localStorage.setItem('editor:rich', '1');
  });
  await openApp(page, { files: { '/mock/a.org': DOC }, ready: false, viewport: { width: 1440, height: 820 } });
  await expect(content(page)).toBeVisible();
  await expect.poll(() => content(page).evaluate((e) => getComputedStyle(e).fontFamily)).toContain('Cormorant');
  await expect.poll(() => content(page).evaluate((e) => getComputedStyle(e).maxWidth)).toBe('700px');
  const sheet = await look(page);
  await chooseFont(page, sheet, 'IBM Plex Mono');
  await sheet.getByRole('radiogroup', { name: 'Ширина текста' }).getByRole('radio', { name: 'Широкая' }).click();
  await sheet.getByRole('switch', { name: '«Структура» справа' }).click();
  await page.keyboard.press('Escape');
  await expect.poll(() => content(page).evaluate((e) => getComputedStyle(e).fontFamily)).toContain('IBM Plex Mono');
  await expect.poll(() => content(page).evaluate((e) => getComputedStyle(e).fontSize)).toBe('14px');
  await expect.poll(() => content(page).evaluate((e) => getComputedStyle(e).maxWidth)).toBe('860px');
  await expect(page.getByRole('complementary', { name: 'Структура' })).toHaveCount(0);
  // after a reload (the font is the theme's file's: the mock's disk is not kept, themesOwn checks the files)
  await page.reload();
  await expect(content(page)).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Структура' })).toHaveCount(0);
  // «Во всю ширину»: the whole area
  const s2 = await look(page);
  await s2.getByRole('radiogroup', { name: 'Ширина текста' }).getByRole('radio', { name: 'Во всю ширину' }).click();
  await chooseFont(page, s2, 'Системный');
  await page.keyboard.press('Escape');
  await expect.poll(() => content(page).evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThan(1000);
  await expect.poll(() => content(page).evaluate((e) => getComputedStyle(e).fontFamily)).toContain('apple-system');
  // «Экспериментального» is gone from «Основные»; the old interface's own are not shown
  const g = await general(page);
  await expect(g.getByText('Экспериментальное')).toHaveCount(0);
  await expect(g.getByText('Показывать заголовки в навигаторе')).toHaveCount(0);
  await expect(g.getByText('Номера строк в оформленном виде')).toHaveCount(0);
  await expect(g.getByRole('switch', { name: 'Новый интерфейс' })).toHaveAttribute('aria-checked', 'true');
});

test('the new interface: ⌃⌘E switches «Оформление» and «Исходник»; ⌘K opens the palette', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ui:next', '1'));
  await openApp(page, { files: { '/mock/a.org': DOC }, ready: false });
  await expect(content(page)).toBeVisible();
  const editor = page.locator('[data-ui="next"] .cm-editor');
  const rich = await editor.evaluate((e) => e.classList.contains('cm-rich'));
  await page.locator('.cm-line', { hasText: 'текст' }).click();
  await page.keyboard.press('Control+Meta+e');
  await expect.poll(() => editor.evaluate((e) => e.classList.contains('cm-rich'))).toBe(!rich);
  await page.keyboard.press('Control+Meta+e');
  await expect.poll(() => editor.evaluate((e) => e.classList.contains('cm-rich'))).toBe(rich);
  await page.keyboard.press('Meta+k');
  await expect(palette(page)).toBeVisible();
  await expect(page.locator('[data-ui="next"] header')).toContainText('⌘K');
});
