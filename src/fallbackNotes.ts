// Demo data for running the UI in a plain browser (no Tauri). Imported lazily and only in dev builds:
// the production bundle must not carry sample notes, and the app (running inside Tauri) never loads this.
export const bundledNotes = import.meta.glob('../sample-notes/**/*.org', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
export const bundledConfig = import.meta.glob('../sample-notes/.orgnotes/config.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
