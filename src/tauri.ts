// The app's shell: in Tauri, or a browser (the dev fallback; e2e mocks Tauri's internals before the page loads).

export const isTauri = '__TAURI_INTERNALS__' in window;

/** A Rust command (`@tauri-apps/api` loaded on first use). */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}
