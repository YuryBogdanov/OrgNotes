// The items of a menu (the editor's, a tab's, the files' tree, a plugin's `ui.menu`): one type for the old menu
// (ContextMenu.svelte) and the new one (next/ui/Menu.svelte, ТЗ 44 §3), so a menu's items are built once.

export type MenuItem =
  | {
      label: string; action: () => void; danger?: boolean; disabled?: boolean; shortcut?: string;
      // the tab list of a pane: a check at the active one, the tab's icon, a dot at an unsaved one
      checked?: boolean; icon?: string; dot?: boolean; italic?: boolean; // icon: 'file' | 'agenda' | 'untitled', or an SVG path (a feature's tab)
      sub?: MenuItem[]; // a submenu, opened by hovering or a click («Показать как ›»)
      subWidth?: number; // its least width
      detail?: string; // a grey second line: what exactly it does («https://wiki…», «Ревью архитектуры»), ТЗ 35
      capsule?: string; // the label as a status capsule: the tone's style (`--tl:…`), as the agenda draws it (ТЗ 34)
    }
  | { note: string } // a grey line, not a command («Виды добавляют плагины»)
  | 'sep';

/** An item that runs something (not a line, not a note). */
export type MenuCommand = Exclude<MenuItem, 'sep' | { note: string }>;
export const isCommand = (it: MenuItem | undefined): it is MenuCommand => typeof it === 'object' && !('note' in it);
