import { expect, test, type Page } from '@playwright/test';
import { installTauriMock } from './tauriMock';

// ТЗ «Первый запуск и рабочая папка».
const FILES = () => ({
  '/mock/work.org': '* Q4 2026\n',
  '/mock/Команда/Рост/Сергей Белов.org': '* 1:1\n',
  '/mock/Команда/readme.md': 'x',
  '/mock/.git/HEAD': 'ref',
  '/other/Личное/список.org': '* Список\n',
});
type Setup = { noDir?: boolean; missing?: string; dir?: string; scanDelay?: number; big?: boolean };
const open = async (page: Page, s: Setup = {}, files: Record<string, string> = FILES()) => {
  await page.addInitScript((s) => {
    const w = window as any;
    if (s.noDir) w.__noDir = true;
    if (s.missing) w.__missing = s.missing;
    if (s.dir) w.__dir = s.dir;
    if (s.scanDelay) w.__scanDelay = s.scanDelay;
    if (s.big) w.__big = true;
  }, s);
  await installTauriMock(page, files);
  await page.goto('/');
};
const picks = (page: Page, ...p: (string | null)[]) => page.evaluate((p) => ((window as any).__picks = p), p);
const log = (page: Page) => page.evaluate(() => (window as any).__log as unknown[][]);
const start = (page: Page) => page.locator('.start');
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test.describe('first launch', () => {
  test('without a folder: the welcome, no main window; Return is «Выбрать папку…»', async ({ page }) => {
    await open(page, { noDir: true });
    await expect(start(page).locator('h1')).toHaveText('Добро пожаловать в Panopticon');
    await expect(start(page).locator('.bar')).toHaveText('Panopticon');
    await expect(start(page).locator('img.appicon')).toHaveCSS('border-radius', '26px');
    expect(Math.round((await start(page).locator('img.appicon').boundingBox())!.width)).toBe(112);
    await expect(start(page)).toContainText('Файлы остаются в обычных папках и открываются в любом редакторе, в том числе в Emacs.');
    await expect(btn(page, 'Выбрать папку…')).toBeFocused();
    await expect(btn(page, 'Создать новую папку…')).toBeVisible();
    await expect(page.locator('.nav')).toHaveCount(0); // instead of the main window
    await expect(page.locator('.toolbar')).toHaveCount(0);
    expect(await page.title()).toBe('Panopticon');
  });

  test('a cancelled panel remembers nothing', async ({ page }) => {
    await open(page, { noDir: true });
    await picks(page, null);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await log(page)).filter((e) => e[0] === 'pick').length).toBe(1);
    await expect(start(page).locator('h1')).toHaveText('Добро пожаловать в Panopticon');
    expect((await log(page)).some((e) => e[0] === 'set_dir')).toBe(false);
  });

  test('«Папка найдена» counts org files, folders and other files (not hidden ones); «Открыть» opens it', async ({ page }) => {
    await open(page, { noDir: true });
    await picks(page, '/mock');
    await btn(page, 'Выбрать папку…').click();
    const card = start(page).locator('.sum');
    await expect(start(page).locator('h1')).toHaveText('Папка найдена');
    await expect(card.locator('.nm')).toHaveText('mock');
    await expect(card.locator('.row').nth(0)).toHaveText(/Org-файлов\s*2/);
    await expect(card.locator('.row').nth(1)).toHaveText(/Папок\s*2/);
    await expect(card.locator('.row').nth(2)).toHaveText(/Других файлов, они не показываются\s*1/);
    await expect(btn(page, 'Открыть')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(start(page)).toHaveCount(0);
    await expect(page.locator('.nav .row[data-key="/mock/work.org"]')).toBeVisible();
    expect((await log(page)).find((e) => e[0] === 'set_dir')).toEqual(['set_dir', '/mock']);
    const opts = (await log(page)).find((e) => e[0] === 'pick')![1] as any;
    expect(opts.directory).toBe(true);
    expect(opts.multiple).toBe(false);
  });

  test('a slow count shows «Считаем файлы…»; a big folder gets a soft warning', async ({ page }) => {
    await open(page, { noDir: true, scanDelay: 1600, big: true });
    await picks(page, '/mock');
    await btn(page, 'Выбрать папку…').click();
    await expect(start(page)).toContainText('Считаем файлы…');
    await expect(btn(page, 'Открыть')).toBeDisabled();
    await expect(start(page).locator('.row.warn')).toContainText('Папка большая');
    await expect(btn(page, 'Открыть')).toBeEnabled();
  });

  test('«Создать новую папку…» uses the same panel (with «Новая папка») and opens the folder at once', async ({ page }) => {
    await open(page, { noDir: true });
    await picks(page, '/mock/Новые заметки');
    await btn(page, 'Создать новую папку…').click();
    await expect(start(page)).toHaveCount(0);
    expect((await log(page)).find((e) => e[0] === 'set_dir')).toEqual(['set_dir', '/mock/Новые заметки']);
    expect(((await log(page)).find((e) => e[0] === 'pick')![1] as any).canCreateDirectories).toBe(true);
  });
});

test.describe('an empty folder', () => {
  test('«Создайте первый файл»; a file put in from outside replaces it by itself', async ({ page }) => {
    await open(page, { dir: '/empty' });
    await expect(page.locator('.center h1')).toHaveText('Создайте первый файл');
    await expect(page.locator('.nav')).toContainText('В папке пока нет org-файлов.');
    await expect(btn(page, 'Показать в Finder')).toBeVisible();
    await expect(page.getByRole('button', { name: /Создать файл/ }).last()).toContainText('⇧⌘N');
    await expect(page.getByRole('button', { name: 'Второй редактор' })).toBeDisabled();
    await page.evaluate(() => (window as any).__setDisk('/empty/Идеи.org', '* Идеи\n'));
    await expect(page.locator('.nav .row[data-key="/empty/Идеи.org"]')).toBeVisible();
    await expect(page.locator('.center h1')).toHaveCount(0);
  });

  test('«Создать файл» opens the name step of the palette; «Показать в Finder» reveals the folder', async ({ page }) => {
    await open(page, { dir: '/empty' });
    await btn(page, 'Показать в Finder').click();
    await expect.poll(async () => (await log(page)).some((e) => e[0] === 'reveal')).toBe(true);
    await page.locator('.center').getByRole('button', { name: /Создать файл/ }).click();
    await expect(page.getByRole('dialog', { name: 'Командная палитра' }).getByRole('combobox')).toHaveAttribute('placeholder', 'Имя файла');
  });
});

test.describe('an unavailable folder', () => {
  test('at start: the screen with the path; «Повторить» opens the window once the folder is back', async ({ page }) => {
    await open(page, { missing: '/Users/yury/Documents/МОСК' });
    await expect(start(page).locator('h1')).toHaveText('Папка «МОСК» недоступна');
    await expect(start(page)).toContainText('Не удаётся открыть ~/Documents/МОСК');
    await expect(btn(page, 'Выбрать другую папку…')).toBeFocused();
    await btn(page, 'Повторить').click();
    await expect(start(page).locator('h1')).toHaveText('Папка «МОСК» недоступна'); // still gone: nothing changes
    await page.evaluate(() => ((window as any).__missingBack = true));
    await btn(page, 'Повторить').click();
    await expect(start(page)).toHaveCount(0);
  });

  test('it checks again by itself', async ({ page }) => {
    await open(page, { missing: '/mock' });
    await expect(start(page).locator('h1')).toHaveText('Папка «mock» недоступна');
    await page.evaluate(() => ((window as any).__missingBack = true));
    await expect(start(page)).toHaveCount(0, { timeout: 6000 });
    await expect(page.locator('.nav .row[data-key="/mock/work.org"]')).toBeVisible();
  });

  test('gone while working: the tabs keep their text, the navigator says so; «Повторить» brings it back', async ({ page }) => {
    await open(page);
    await page.locator('.nav .row[data-key="/mock/work.org"]').click();
    await page.evaluate(() => { (window as any).__gone = true; (window as any).__setDisk('/mock/x.org', ''); });
    const banner = page.locator('.nav .gone');
    await expect(banner).toContainText('Папка недоступна');
    await expect(page.locator('section.pane .cm-content')).toContainText('Q4 2026');
    await expect(page.locator('section.pane .tab.on')).toHaveClass(/gone/);
    await expect(start(page)).toHaveCount(0); // the window is not replaced
    await page.evaluate(() => ((window as any).__gone = false));
    await banner.getByRole('button', { name: 'Повторить' }).click();
    await expect(banner).toHaveCount(0);
    await expect(page.locator('section.pane .tab.on')).not.toHaveClass(/gone/);
  });
});

test.describe('changing the folder', () => {
  const fromSettings = async (page: Page) => {
    const settings = await page.context().newPage();
    await installTauriMock(settings, FILES());
    await settings.goto('/#settings');
    await settings.getByRole('tab', { name: 'Основные' }).click();
    await expect(settings.locator('.folder .fname')).toHaveText('mock');
    await settings.getByRole('button', { name: 'Изменить…' }).click();
    await settings.close();
  };

  test('panel → the unsaved question → «Папка найдена» → «Открыть»; a cancel at any step changes nothing', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Meta+t');
    await page.keyboard.type('черновик');
    // a cancelled panel
    await picks(page, null, '/other', '/other');
    await fromSettings(page);
    await expect.poll(async () => (await log(page)).filter((e) => e[0] === 'pick').length).toBe(1);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    // the unsaved question cancelled
    await fromSettings(page);
    await expect(page.getByRole('alertdialog')).toContainText('Сохранить заметку «черновик»?');
    await btn(page, 'Отмена').click();
    await expect(page.locator('section.pane .tab')).toHaveCount(2);
    expect((await log(page)).some((e) => e[0] === 'set_dir')).toBe(false);
    // through: «Не сохранять», then «Папка найдена» for the new folder
    await fromSettings(page);
    await btn(page, 'Не сохранять').click();
    await expect(start(page).locator('h1')).toHaveText('Папка найдена');
    await expect(start(page).locator('.sum .nm')).toHaveText('other');
    await btn(page, 'Открыть').click();
    await expect(page.locator('.nav .row[data-key="/other/Личное/список.org"]')).toBeVisible();
    await expect(page.locator('.nav .row[data-key="/mock/work.org"]')).toHaveCount(0);
  });

  test('Esc on «Папка найдена» while changing keeps the current folder', async ({ page }) => {
    await open(page);
    await picks(page, '/other');
    await fromSettings(page);
    await expect(start(page).locator('h1')).toHaveText('Папка найдена');
    await page.keyboard.press('Escape');
    await expect(start(page)).toHaveCount(0);
    await expect(page.locator('.nav .row[data-key="/mock/work.org"]')).toBeVisible();
  });
});
