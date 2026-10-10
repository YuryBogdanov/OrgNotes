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
          text: 'Org',
          items: [{ item: { About: null } }, sep, it('settings', 'Настройки…', 'CmdOrCtrl+Comma'), sep, { item: 'Services' }, sep, { item: 'Hide' }, { item: 'HideOthers' }, { item: 'ShowAll' }, sep, { item: 'Quit' }],
        },
        {
          text: 'Файл',
          items: [it('newFile', 'Новый файл', 'CmdOrCtrl+N'), it('openFolder', 'Открыть папку…', 'CmdOrCtrl+O'), sep, it('closeTab', 'Закрыть вкладку', 'CmdOrCtrl+W')],
        },
        { text: 'Правка', items: [{ item: 'Undo' }, { item: 'Redo' }, sep, { item: 'Cut' }, { item: 'Copy' }, { item: 'Paste' }, { item: 'SelectAll' }] },
        {
          text: 'Вид',
          items: [
            it('splitRight', 'Разделить вправо', 'CmdOrCtrl+Backslash'),
            it('splitDown', 'Разделить вниз', 'Alt+CmdOrCtrl+Backslash', false),
            sep,
            it('swap', 'Поменять панели местами', 'Shift+Control+CmdOrCtrl+ArrowRight', false),
            it('keepOne', 'Оставить одну панель', 'Shift+CmdOrCtrl+Backslash', false),
            sep,
            it('paneLeft', 'Перейти в левую панель', 'Control+CmdOrCtrl+ArrowLeft', false),
            it('paneRight', 'Перейти в правую панель', 'Control+CmdOrCtrl+ArrowRight', false),
            sep,
            it('notes', 'Заметки', 'CmdOrCtrl+1'),
            it('agenda', 'Агенда', 'CmdOrCtrl+2'),
            it('back', 'Назад', 'CmdOrCtrl+BracketLeft'),
            sep,
            it('nav', 'Навигатор', 'CmdOrCtrl+Digit0'),
            it('insp', 'Инспектор', 'Alt+CmdOrCtrl+Digit0'),
            sep,
            { item: 'Fullscreen' },
          ],
        },
        { text: 'Окно', items: [{ item: 'Minimize' }, { item: 'Maximize' }, sep, { item: 'BringAllToFront' }] },
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
