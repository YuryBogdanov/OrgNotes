import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp } from './helpers';
import { pluginsReady } from './tauriMock';

// fix-59-1 §5: the brief for the agents — `.orgnotes/agents/presentation.md` made with the standard text in a new
// folder; edited in «Настройки → Презентация» (written 0.5 s after typing, «изменён»), copied, the standard text back;
// a new standard text taken by itself when the user did not change theirs, else only said («есть новая версия»).

const STANDARD = readFileSync(new URL('../src/plugins/present/agent-brief.md', import.meta.url), 'utf8');
const F = '/mock/.orgnotes/agents/presentation.md';
const disk = (page: Page) => page.evaluate((p) => (window as any).__disk[p] as string | undefined, F);

async function open(page: Page, files: Record<string, string> = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('ui:next', '1');
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => ((window as any).__clip = t) }, configurable: true });
  });
  await openApp(page, { files: { '/mock/a.org': '* A\n', ...files }, ready: false });
  await pluginsReady(page);
}
/** «Настройки» (⌘,) of the new interface, the plugin's section. */
async function settings(page: Page) {
  await page.keyboard.press('Meta+Comma');
  const sheet = page.getByRole('dialog', { name: 'Настройки' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('tab', { name: 'Презентация', exact: true }).click();
}
const field = (page: Page) => page.getByRole('textbox', { name: 'Бриф для агентов' });

test('a new folder: the brief made with the standard text; edited in the settings; copied; the standard text back', async ({ page }) => {
  await open(page);
  await expect.poll(() => disk(page)).toBe(STANDARD);
  await settings(page);
  await expect(page.getByText('ИИ-АГЕНТЫ')).toBeVisible();
  await expect(field(page)).toHaveValue(STANDARD);
  await expect(page.getByRole('button', { name: 'Вернуть стандартный…' })).toBeDisabled();
  await field(page).click();
  await page.keyboard.press('Meta+ArrowDown');
  await page.keyboard.type('\n- Мой стиль: коротко.');
  await expect.poll(() => disk(page)).toBe(STANDARD + '\n- Мой стиль: коротко.');
  await expect(page.getByText('изменён', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Скопировать' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__clip)).toBe(STANDARD + '\n- Мой стиль: коротко.');
  await expect(page.getByText('Бриф скопирован')).toBeVisible();
  await page.getByRole('button', { name: 'Вернуть стандартный…' }).click();
  await page.getByRole('dialog', { name: 'Вернуть стандартный бриф?' }).getByRole('button', { name: /^Вернуть/ }).click();
  await expect.poll(() => disk(page)).toBe(STANDARD);
  await expect(field(page)).toHaveValue(STANDARD);
});

test('the palette copies it', async ({ page }) => {
  await open(page);
  await expect.poll(() => disk(page)).toBe(STANDARD);
  await page.keyboard.press('Shift+Meta+p');
  await page.keyboard.type('бриф для агента');
  await page.getByRole('option', { name: /Презентация: скопировать бриф для агента/ }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__clip)).toBe(STANDARD);
});

test('a new standard text: taken when the brief was not changed; kept and said when it was', async ({ page, browser }) => {
  const old = { '/mock/.orgnotes/plugins/present.json': JSON.stringify({ data: { base: 'OLD' } }) };
  await open(page, { ...old, [F]: 'OLD' });
  await expect.poll(() => disk(page)).toBe(STANDARD);
  const other = await browser.newPage();
  await open(other, { ...old, [F]: 'MINE' });
  await other.waitForTimeout(500);
  expect(await disk(other)).toBe('MINE');
  await settings(other);
  await expect(other.getByText('есть новая версия')).toBeVisible();
  await other.close();
});
