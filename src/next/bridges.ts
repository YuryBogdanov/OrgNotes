// Bridges (ТЗ 42 §2): the old interface's components the new shell still draws, until their own come. The only file
// of `src/next/` allowed to import them (eslint.config.js); one line each, with what takes its place.

export { default as Settings } from '../Settings.svelte'; // the settings stay old (ТЗ 42 §1, §11)
export { default as CloseSheet } from '../CloseSheet.svelte'; // the confirmation sheets → the new ones in the new tokens
export { default as DiskSheet } from '../DiskSheet.svelte'; // a file changed on the disk → the same
export { default as PluginSheets } from '../PluginSheets.svelte'; // the plugins' forms and sheets → the same
export { default as ContextMenu } from '../ContextMenu.svelte'; // the context menus → the new menu in the new tokens
export { default as Dialogs } from '../Dialogs.svelte'; // rename, move, the Trash of the files' tree → the new sheets
export { default as TagPop } from '../TagPop.svelte'; // the heading's tags (⌃C Q) → the new popover
export { default as RichMenu } from '../RichMenu.svelte'; // a drawn status or priority clicked → the new menu
export { default as PluginFileView } from '../PluginFileView.svelte'; // a plugin's view of a file (the board, the canvas) → the new host
export { default as Agenda } from '../Agenda.svelte'; // the agenda's tab → the screen in the new style, a ТЗ of its own
export { default as AgendaBuilder } from '../AgendaBuilder.svelte'; // the agenda builder's sheet → the same
// «Сегодня», the tab «Тег», the Inbox review, the plugins' views and reviews come through the views' registry
// (views.ts) and are drawn in the compatibility layer (EditorArea) → each a screen in the new style, its own ТЗ.
export { default as ConfirmDialog } from '../ConfirmDialog.svelte'; // «Удалить агенду?», «Убрать тег?» → the new sheets
export { default as TagRename } from '../TagRename.svelte'; // a tag renamed or merged in every file → the same
