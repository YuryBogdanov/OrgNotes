import type { Page } from '@playwright/test';

/**
 * Fake Tauri backend: an in-memory "disk" plus the same save/conflict rules and the same
 * debounced `notes-changed` event the Rust side produces, so the real save → watch → reload
 * cycle of the front end runs in a plain browser.
 */
export async function installTauriMock(page: Page, files: Record<string, string>, opts: { eventDelayMs?: number } = {}) {
  await page.addInitScript(
    ({ files, eventDelay }) => {
      const w = window as any;
      const disk: Record<string, string> = { ...files };
      const cbs: Record<number, (e: unknown) => void> = {};
      const listeners: Record<string, number> = {};
      let nid = 1;
      w.__disk = disk;
      w.__log = [] as unknown[];
      const emit = () =>
        setTimeout(() => {
          const id = listeners['notes-changed'];
          if (id) cbs[id]({ event: 'notes-changed', id: 1, payload: null });
        }, eventDelay);
      w.__setDisk = (path: string, text: string) => {
        disk[path] = text;
        emit();
      };
      w.__TAURI_INTERNALS__ = {
        transformCallback(cb: (e: unknown) => void) {
          cbs[nid] = cb;
          return nid++;
        },
        unregisterCallback(id: number) {
          delete cbs[id];
        },
        async invoke(cmd: string, args: any) {
          if (cmd === 'plugin:event|listen') {
            listeners[args.event] = args.handler;
            return 1;
          }
          if (cmd === 'plugin:event|unlisten') return;
          if (cmd === 'get_notes_dir') return '/mock';
          if (cmd === 'sample_notes_dir') return null;
          if (cmd === 'list_org_files') {
            return Object.entries(disk).map(([path, text]) => ({ name: path.replace('/mock/', ''), path, text }));
          }
          if (cmd === 'save_org_file') {
            if (disk[args.path] !== args.base) {
              w.__log.push(['conflict', args.path]);
              throw 'conflict';
            }
            await new Promise((r) => setTimeout(r, 5));
            disk[args.path] = args.text;
            w.__log.push(['save', args.path]);
            emit();
            return;
          }
          if (cmd === 'plugin:opener|open_url') {
            w.__log.push(['open_url', args.url]);
            return;
          }
          throw new Error('unmocked invoke: ' + cmd);
        },
      };
    },
    { files, eventDelay: opts.eventDelayMs ?? 300 },
  );
}
