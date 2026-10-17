// Bridges (ТЗ 42 §2): the old interface's components the new shell still draws, until their own come. The only file
// of `src/next/` allowed to import them (eslint.config.js); one line each, with what takes its place.

export { default as Settings } from '../Settings.svelte'; // the settings stay old (ТЗ 42 §1, §11)
export { default as Palette } from '../Palette.svelte'; // → the new palette (a later ТЗ)
export { default as CloseSheet } from '../CloseSheet.svelte'; // the confirmation sheets → the new ones in the new tokens
export { default as DiskSheet } from '../DiskSheet.svelte'; // a file changed on the disk → the same
export { default as PluginSheets } from '../PluginSheets.svelte'; // the plugins' forms and sheets → the same
export { default as ContextMenu } from '../ContextMenu.svelte'; // the context menus → the new menu in the new tokens
export { default as Dialogs } from '../Dialogs.svelte'; // rename, move, the Trash of the files' tree → the new sheets
export { default as TagPop } from '../TagPop.svelte'; // the heading's tags (⌃C Q) → the new popover
export { default as RichMenu } from '../RichMenu.svelte'; // a drawn status or priority clicked → the new menu
export { default as PluginFileView } from '../PluginFileView.svelte'; // a plugin's view of a file (the board, the canvas) → the new host
export { default as Refile } from '../Refile.svelte'; // the choice of a place (refile)
export type { MenuItem } from '../ContextMenu.svelte'; // the menus' items, the type of the bridge above
export { default as AgendaList } from '../AgendaList.svelte'; // the sidebar's «Агенда» → its own panel (ТЗ 43 §2.2)
export { default as TagsPanel } from '../TagsPanel.svelte'; // the sidebar's «Теги» → its own panel (ТЗ 43 §2.3)
export { default as SearchPanel } from '../SearchPanel.svelte'; // the sidebar's «Поиск» → its own panel (ТЗ 43 §2.4)
