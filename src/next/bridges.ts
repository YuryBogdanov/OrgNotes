// Bridges (ТЗ 42 §2): the old interface's components the new shell still draws, until their own come. The only file
// of `src/next/` allowed to import them (eslint.config.js); one line each, with what takes its place.

export { default as Settings } from '../Settings.svelte'; // the settings stay old (ТЗ 42 §1, §11)
export { default as PluginSheets } from '../PluginSheets.svelte'; // the plugins' forms and sheets → the same
export { default as PluginFileView } from '../PluginFileView.svelte'; // a plugin's view of a file (the board, the canvas) → the new host
export { default as Agenda } from '../Agenda.svelte'; // the agenda's tab → the screen in the new style, a ТЗ of its own
export { default as AgendaBuilder } from '../AgendaBuilder.svelte'; // the agenda builder's sheet → the same
// «Сегодня», the tab «Тег», the Inbox review, the plugins' views and reviews come through the views' registry
// (views.ts) and are drawn in the compatibility layer (EditorArea) → each a screen in the new style, its own ТЗ.
// what the old window has over it and the new one had not yet (found in ТЗ 44.4) → each its own new look
export { default as Capture } from '../Capture.svelte'; // the quick entry into the Inbox, ⇧⌘I
export { default as InboxPicker } from '../Picker.svelte'; // the Inbox's file chosen
export { default as NotePop } from '../NotePop.svelte'; // «Добавить заметку…», ⌃C ⌃Z
export { default as TaskListHost } from '../TaskListHost.svelte'; // the sheets of a task in the lists (ТЗ 34)
export { default as StartScreen } from '../StartScreen.svelte'; // no notes folder yet
