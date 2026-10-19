// `ctx.process` (ТЗ 55 §1, API 1.16): a process in a pseudo-terminal for a plugin with the right «process» — the
// user's shell as a login shell (alone or running a command), in the notes folder unless told; its output and its end
// come as Tauri events (`pty-data`, `pty-exit`) and go to the handle of their process. A plugin's processes end when
// it is turned off or fails (the host keeps `pty_kill_plugin` among its disposers) and when the app quits.

import { invoke } from '../tauri';
import type { Ctx, Dispose, PtyHandle } from './index';

type Listeners = { data: Set<(d: string) => void>; exit: Set<(c: number | null) => void>; early: string[]; ended?: { code: number | null } };
const handles = new Map<string, Listeners>();
let listening: Promise<void> | null = null;

/** The events of every process, listened to once. */
function listen(): Promise<void> {
  listening ??= (async () => {
    const { listen } = await import('@tauri-apps/api/event');
    await listen<{ id: string; data: string }>('pty-data', (e) => {
      const h = handles.get(e.payload.id);
      if (!h) return;
      if (!h.data.size) h.early.push(e.payload.data); // before onData: kept for it
      else for (const f of h.data) f(e.payload.data);
    });
    await listen<{ id: string; code: number | null }>('pty-exit', (e) => {
      const h = handles.get(e.payload.id);
      if (!h) return;
      h.ended = { code: e.payload.code };
      for (const f of h.exit) f(e.payload.code);
      if (h.exit.size) handles.delete(e.payload.id);
    });
  })();
  return listening;
}

/** How many processes of the terminal are alive (asked before quitting). */
export const livePtys = () => invoke<number>('pty_count').catch(() => 0);

export function processApi(plugin: string): NonNullable<Ctx['process']> {
  return {
    pty: async (o) => {
      await listen();
      const id = await invoke<string>('pty_spawn', {
        plugin, command: o.command ?? null, args: o.args ?? null, cwd: o.cwd ?? null, env: o.env ?? null, shell: o.shell ?? null, cols: o.cols, rows: o.rows,
      });
      const h: Listeners = { data: new Set(), exit: new Set(), early: [] };
      handles.set(id, h);
      const on = <T>(set: Set<T>, fn: T): Dispose => (set.add(fn), () => void set.delete(fn));
      const handle: PtyHandle = {
        id,
        write: (data) => void invoke('pty_write', { id, data: String(data) }).catch(() => {}),
        resize: (cols, rows) => void invoke('pty_resize', { id, cols, rows }).catch(() => {}),
        kill: (signal) => void invoke('pty_kill', { id, signal: signal ?? null }).catch(() => {}),
        onData: (fn) => {
          const off = on(h.data, fn);
          for (const d of h.early.splice(0)) fn(d);
          return off;
        },
        onExit: (fn) => {
          if (h.ended) {
            fn(h.ended.code);
            handles.delete(id);
            return () => {};
          }
          return on(h.exit, fn);
        },
      };
      return handle;
    },
  };
}
