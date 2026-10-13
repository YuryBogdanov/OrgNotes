// The macOS menu bar. Layout commands live in "Вид"; the Edit menu uses the predefined items so copy and paste keep
// working in the web view. The shortcuts come from the registry (keys.ts) as the user set them: `accel` gives an
// item's accelerator, none for a chord (macOS menus cannot show one). Built again when a shortcut changes.
// Returns null when there is no native menu (a plain browser, tests): the app handles the same keys anyway.

export type MenuActions = Record<string, () => void>;
export interface AppMenu {
  setEnabled(id: string, on: boolean): void;
  setChecked(id: string, on: boolean): void;
  close(): void;
}

let generation = 0;

export async function installMenu(actions: MenuActions, accel: (id: string) => string | undefined): Promise<AppMenu | null> {
  if (!('__TAURI_INTERNALS__' in window)) return null;
  try {
    const { Menu, CheckMenuItem } = await import('@tauri-apps/api/menu');
    // ids carry the generation: the items of a menu being replaced must not answer for the new one
    const gen = ++generation;
    const mid = (id: string) => `${gen}:${id}`;
    const it = (id: string, text: string, accelerator: string | undefined = accel(id), enabled = true) => ({ id: mid(id), text, accelerator, enabled, action: () => actions[id]?.() });
    const sep = { item: 'Separator' as const };
    // a check item: its tick follows the setting (setChecked)
    const rich = await CheckMenuItem.new({ id: mid('rich'), accelerator: accel('rich'), text: 'Оформленный текст', checked: false, action: () => actions.rich?.() });
    const menu = await Menu.new({
      items: [
        {
          text: 'Panopticon',
          // a custom "Выйти" so unsaved tabs are asked about first
          items: [{ item: { About: null } }, sep, it('settings', 'Настройки…'), sep, { item: 'Services' }, sep, { item: 'Hide' }, { item: 'HideOthers' }, { item: 'ShowAll' }, sep, it('quit', 'Выйти из Panopticon', 'CmdOrCtrl+Q')],
        },
        {
          text: 'Файл',
          items: [
            it('newTab', 'Новая вкладка'),
            it('newFile', 'Новый файл'),
            it('paletteNewFile', 'Создать файл…'),
            it('paletteGoto', 'Перейти к файлу…'),
            it('capture', 'Новая задача в Inbox…'),
            it('openFolder', 'Открыть другую папку…'),
            sep,
            it('save', 'Сохранить…'),
            sep,
            it('closeTab', 'Закрыть вкладку'),
            it('closeOthers', 'Закрыть остальные вкладки'),
            sep,
            it('moveRight', 'Переместить вкладку в правый редактор', undefined, false),
            it('moveLeft', 'Переместить вкладку в левый редактор', undefined, false),
            it('dupRight', 'Продублировать в правом редакторе', undefined, false),
            it('dupLeft', 'Продублировать в левом редакторе', undefined, false),
            sep,
            it('revealInNav', 'Показать в навигаторе', undefined, false),
            it('copyPath', 'Скопировать путь', undefined, false),
          ],
        },
        {
          text: 'Правка',
          items: [
            { item: 'Undo' }, { item: 'Redo' }, sep, { item: 'Cut' }, { item: 'Copy' }, { item: 'Paste' }, { item: 'SelectAll' }, sep,
            {
              text: 'Найти',
              items: [
                it('find', 'Найти…'),
                it('findAll', 'Найти во всех файлах…'),
                sep,
                it('findNext', 'Найти далее'),
                it('findPrev', 'Найти ранее'),
                it('useSelection', 'Искать выделенное'),
                sep,
                it('searchNext', 'Следующий результат во всех файлах'),
                it('searchPrev', 'Предыдущий результат во всех файлах'),
              ],
            },
          ],
        },
        {
          text: 'Вид',
          items: [
            it('palette', 'Командная палитра'),
            it('today', 'Сегодня'),
            it('jumpBar', 'Строка пути'),
            it('structure', 'Структурный вид'),
            rich,
            sep,
            it('splitRight', 'Разделить вправо'),
            it('splitDown', 'Разделить вниз', 'Alt+CmdOrCtrl+Backslash', false),
            sep,
            it('swap', 'Поменять панели местами', undefined, false),
            it('keepOne', 'Оставить одну панель', undefined, false),
            it('closePane', 'Закрыть панель', undefined, false),
            sep,
            it('paneLeft', 'Перейти в левую панель', undefined, false),
            it('paneRight', 'Перейти в правую панель', undefined, false),
            sep,
            it('notes', 'Заметки'),
            it('agenda', 'Агенда'),
            it('back', 'Назад'),
            sep,
            it('nav', 'Навигатор'),
            it('navFiles', 'Навигатор: файлы'),
            it('navAgendas', 'Навигатор: агенды'),
            it('navSearch', 'Навигатор: поиск'),
            it('insp', 'Инспектор'),
            sep,
            { item: 'Fullscreen' },
          ],
        },
        { text: 'Окно', items: [it('closeWindow', 'Закрыть окно'), sep, it('miniOpen', 'Открыть в мини-окне'), it('miniShow', 'Показать мини-окно'), sep, { item: 'Minimize' }, { item: 'Maximize' }, sep, { item: 'BringAllToFront' }] },
      ],
    });
    await menu.setAsAppMenu();
    return {
      setEnabled(id, on) {
        menu
          .get(mid(id))
          .then((m) => (m as { setEnabled?: (v: boolean) => Promise<void> } | null)?.setEnabled?.(on))
          .catch(() => {});
      },
      setChecked(id, on) {
        menu
          .get(mid(id))
          .then((m) => (m as { setChecked?: (v: boolean) => Promise<void> } | null)?.setChecked?.(on))
          .catch(() => {});
      },
      close() {
        void menu.close().catch(() => {});
      },
    };
  } catch (e) {
    console.warn('native menu unavailable', e);
    return null;
  }
}
