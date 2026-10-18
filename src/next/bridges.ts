// Bridges (ТЗ 42 §2): the old interface's components the new shell still draws, until their own come. The only file
// of `src/next/` allowed to import them (eslint.config.js); one line each, with what takes its place.

// the settings' sections (ТЗ 54): the sheet is new (next/Settings.svelte), the sections come one by one (54.2–54.7)
export { default as ThemeEditor } from '../ThemeEditor.svelte'; // 54.8
export { default as StatusesSettings } from '../StatusesSettings.svelte'; // 54.6
export { default as TagsSettings } from '../TagsSettings.svelte'; // 54.7
export { default as SettingsAgendas } from '../SettingsAgendas.svelte'; // 54.7
export { default as SettingsInbox } from '../SettingsInbox.svelte'; // 54.7
export { default as Picker } from '../Picker.svelte'; // 54.7, Inbox's «Выбрать…»
export { default as RemovePlugin } from '../RemovePlugin.svelte'; // 54.5
