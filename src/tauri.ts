// The app's shell: in Tauri, or a browser (the dev fallback; e2e mocks Tauri's internals before the page loads).

export const isTauri = '__TAURI_INTERNALS__' in window;

/** A Rust command (`@tauri-apps/api` loaded on first use). */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

type Filter = { name: string; extensions: string[] };
/** The system save panel, shown by Rust: only a path chosen there may be written (`export_text`, `export_bytes`). */
export const pickSave = (title: string, defaultName: string, filter?: Filter) =>
  invoke<string | null>('pick_save', { title, defaultName, filter: filter ?? null });
/** The system open panel for a file, shown by Rust: only a path chosen there may be read (`import_text`). */
export const pickOpen = (title: string, filter?: Filter) => invoke<string | null>('pick_open', { title, filter: filter ?? null });
