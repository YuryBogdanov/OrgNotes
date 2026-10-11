// The macOS menu bar. Layout commands live in "Вид" with the shortcuts from the design; the Edit menu uses the
// predefined items so copy and paste keep working in the web view. Returns null when there is no native menu
// (a plain browser, tests): the app then handles the same shortcuts itself.

export type MenuActions = Record<string, () => void>;
export interface AppMenu {
  setEnabled(id: string, on: boolean): void;
}

export async function installMenu(actions: MenuActions): Promise<AppMenu | null> {
  if (!('__TAURI_INTERNALS__' in window) || (window as any).__ORG_SETTINGS_OVERLAY__) return null;
  try {
    const { Menu } = await import('@tauri-apps/api/menu');
    const it = (id: string, text: string, accelerator?: string, enabled = true) => ({ id, text, accelerator, enabled, action: () => actions[id]?.() });
    const sep = { item: 'Separator' as const };
    const menu = await Menu.new({
      items: [
        {
          text: 'Panopticon',
          // a custom "Выйти" so unsaved tabs are asked about first
          items: [{ item: { About: null } }, sep, it('settings', 'Настройки…', 'CmdOrCtrl+Comma'), sep, { item: 'Services' }, sep, { item: 'Hide' }, { item: 'HideOthers' }, { item: 'ShowAll' }, sep, it('quit', 'Выйти из Panopticon', 'CmdOrCtrl+Q')],
        },
        {
          text: 'Файл',
          items: [
            it('newTab', 'Новая вкладка', 'CmdOrCtrl+KeyT'),
            it('newFile', 'Новый файл', 'CmdOrCtrl+N'),
            it('paletteNewFile', 'Создать файл…', 'Shift+CmdOrCtrl+KeyN'),
            it('paletteGoto', 'Перейти к файлу…', 'Shift+CmdOrCtrl+KeyO'),
            it('capture', 'Новая задача в Inbox…', 'Shift+CmdOrCtrl+KeyI'),
            it('openFolder', 'Открыть другую папку…'), // no shortcut in the first version
            sep,
            it('save', 'Сохранить…', 'CmdOrCtrl+S'),
            sep,
            it('closeTab', 'Закрыть вкладку', 'CmdOrCtrl+W'),
            it('closeOthers', 'Закрыть остальные вкладки', 'Alt+CmdOrCtrl+W'),
            sep,
            it('moveRight', 'Переместить вкладку в правый редактор', 'Control+CmdOrCtrl+ArrowRight', false),
            it('moveLeft', 'Переместить вкладку в левый редактор', 'Control+CmdOrCtrl+ArrowLeft', false),
            it('dupRight', 'Продублировать в правом редакторе', 'Alt+Control+CmdOrCtrl+ArrowRight', false),
            it('dupLeft', 'Продублировать в левом редакторе', 'Alt+Control+CmdOrCtrl+ArrowLeft', false),
            sep,
            it('revealInNav', 'Показать в навигаторе', 'Shift+CmdOrCtrl+KeyJ', false),
            it('copyPath', 'Скопировать путь', 'Alt+CmdOrCtrl+KeyC', false),
          ],
        },
        { text: 'Правка', items: [{ item: 'Undo' }, { item: 'Redo' }, sep, { item: 'Cut' }, { item: 'Copy' }, { item: 'Paste' }, { item: 'SelectAll' }] },
        {
          text: 'Вид',
          items: [
            it('palette', 'Командная палитра', 'Shift+CmdOrCtrl+KeyP'),
            it('jumpBar', 'Строка пути', 'Control+CmdOrCtrl+KeyJ'),
            it('structure', 'Структурный вид'), // a shortcut is decided after a week of use
            sep,
            it('splitRight', 'Разделить вправо', 'CmdOrCtrl+Backslash'),
            it('splitDown', 'Разделить вниз', 'Alt+CmdOrCtrl+Backslash', false),
            sep,
            it('swap', 'Поменять панели местами', 'Shift+Control+CmdOrCtrl+ArrowRight', false),
            it('keepOne', 'Оставить одну панель', 'Shift+CmdOrCtrl+Backslash', false),
            it('closePane', 'Закрыть панель', 'Control+CmdOrCtrl+KeyW', false),
            sep,
            it('paneLeft', 'Перейти в левую панель', 'Alt+CmdOrCtrl+ArrowLeft', false),
            it('paneRight', 'Перейти в правую панель', 'Alt+CmdOrCtrl+ArrowRight', false),
            sep,
            it('notes', 'Заметки', 'CmdOrCtrl+1'),
            it('agenda', 'Агенда', 'CmdOrCtrl+2'),
            it('back', 'Назад', 'CmdOrCtrl+BracketLeft'),
            it('review', 'Разобрать Inbox', 'Shift+CmdOrCtrl+KeyR'),
            sep,
            it('nav', 'Навигатор', 'CmdOrCtrl+Digit0'),
            it('navFiles', 'Навигатор: файлы', 'Control+CmdOrCtrl+Digit1'),
            it('navInbox', 'Навигатор: Inbox', 'Control+CmdOrCtrl+Digit2'),
            it('navAgendas', 'Навигатор: агенды', 'Control+CmdOrCtrl+Digit3'),
            it('insp', 'Инспектор', 'Alt+CmdOrCtrl+Digit0'),
            sep,
            { item: 'Fullscreen' },
          ],
        },
        { text: 'Окно', items: [it('closeWindow', 'Закрыть окно', 'Shift+CmdOrCtrl+KeyW'), sep, { item: 'Minimize' }, { item: 'Maximize' }, sep, { item: 'BringAllToFront' }] },
      ],
    });
    await menu.setAsAppMenu();
    return {
      setEnabled(id, on) {
        menu
          .get(id)
          .then((m) => (m as { setEnabled?: (v: boolean) => Promise<void> } | null)?.setEnabled?.(on))
          .catch(() => {});
      },
    };
  } catch (e) {
    console.warn('native menu unavailable', e);
    return null;
  }
}
