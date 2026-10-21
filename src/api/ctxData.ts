// The parts of a plugin's ctx that are the core's data and do not hang on the host (tech sprint 3.3): `index`
// (the notes read), `files`, `edit` (transactions over the journal), `net`, `clipboard`. The host gives each to a
// plugin that has the right.

import { store } from '../store.svelte';
import { DEFAULT_WORKFLOW, namedFor } from '../org';
import { displayName, isArchive } from '../names';
import { bodyOf } from '../orgOps';
import type { Tx as CoreTx } from '../journal';
import { invoke } from '../tauri';
import { hostAllowed, hostOf, type Manifest } from './manifest';
import type { Ctx, HeadingRef, Named } from './index';
import { apiTx, fileOf, findHeading, infoOf, touchedOf, type Changed } from './refs';
import { lastNote } from '../logbook';
import { touches } from '../touchIndex.svelte';
import { query } from './query';
import { headingChanged } from './events.svelte';

/** The agents' briefs, `.orgnotes/agents/<name>.md` (fix-59-1 §5): built-in plugins only. */
export function agentsApi(): NonNullable<Ctx['agents']> {
  const name = (n: string) => {
    if (!/^[a-z0-9-]{1,64}$/.test(String(n))) throw new Error(`плохое имя «${n}»`);
    return String(n);
  };
  return {
    read: async (n) => (await invoke<string | null>('read_agent_file', { name: name(n) })) ?? null,
    write: async (n, text) => void (await invoke<string>('write_agent_file', { name: name(n), text: String(text) })),
    reveal: async (n) => {
      const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
      await revealItemInDir(store.abs(`.orgnotes/agents/${name(n)}.md`));
    },
  };
}
export function clipboardApi(): NonNullable<Ctx['clipboard']> {
  return { write: (text) => navigator.clipboard.writeText(String(text)) };
}
export function netApi(m: Manifest): NonNullable<Ctx['net']> {
  const id = m.id;
  return {
    fetch: async (url, init = {}) => {
      const host = hostOf(url);
      if (!host) throw new Error('адрес — http или https');
      if (!hostAllowed(m.net, host)) throw new Error(`хоста ${host} нет в манифесте`);
      const r = await invoke<{ status: number; headers: [string, string][]; text: string }>('net_fetch', {
        plugin: id, url, method: init.method ?? 'GET', headers: Object.entries(init.headers ?? {}), body: init.body ?? null,
      });
      return { status: r.status, ok: r.status >= 200 && r.status < 300, headers: Object.fromEntries(r.headers), text: r.text };
    },
  };
}
/** `canTouch`: the plugin has `index.touch` («Осмотрено»). */
export function indexApi(canTouch: boolean): NonNullable<Ctx['index']> {
  const find = (ref: HeadingRef) => {
    const f = fileOf(ref.path);
    const h = f && findHeading(f.headings, ref);
    return f && h ? { f, h } : null;
  };
  return {
    query: async (q) => query(q),
    heading: async (ref) => {
      const x = find(ref);
      return x ? infoOf(x.f, x.h) : null;
    },
    body: async (ref) => {
      const x = find(ref);
      return x ? bodyOf(x.f.text, x.h) : null;
    },
    byId: async (id) => {
      const want = String(id).trim();
      for (const f of store.files)
        for (const h of f.headings) if (h.id === want) return { path: f.name, line: h.line, title: h.title };
      return null;
    },
    outline: async (path) => {
      const f = fileOf(path);
      return f ? f.headings.map((h) => infoOf(f, h)) : [];
    },
    files: async () => store.files.filter((f) => !isArchive(f.name)).map((f) => ({ path: f.name, title: displayName(f.name) })), // not the archives: as the agenda
    statusTone: async (kw, path) => {
      const f = fileOf(path);
      return f && kw ? (namedFor(kw, f.wf) as Named) : null;
    },
    inbox: async () => ({ path: store.inboxFile?.name ?? null, chosen: store.inboxCfg.file, add: store.inboxCfg.add }),
    folder: async () => store.dir ?? null,
    touched: async (ref) => {
      const x = find(ref);
      return (x && touchedOf(x.f.name, x.h.line).touched) ?? null;
    },
    lastNote: async (ref) => {
      const x = find(ref);
      return x ? lastNote(x.f.text.split('\n'), x.h) : null;
    },
    markReviewed: async (ref) => {
      if (!canTouch) throw new Error('нужно право index.touch');
      const x = find(ref);
      if (!x) throw new Error('заголовок не найден');
      touches.review(x.f.name, x.h.line);
    },
    workflow: async (path) => {
      const f = fileOf(path);
      const seqs = f?.wf.sequences ?? store.config.workflows;
      return {
        open: [...(f?.wf.open ?? DEFAULT_WORKFLOW.open)], done: [...(f?.wf.done ?? DEFAULT_WORKFLOW.done)],
        sets: seqs.map((q) => ({ name: q.name, states: q.states.map((x) => ({ name: x.name, done: !!x.done, ...(x.color ? { color: x.color as Named } : {}) })) })),
        logbook: !!(f?.wf.behavior ?? store.config.behavior).logbook,
      };
    },
  };
}
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
/** A path in the notes folder as a plugin gives it: relative, no `..`, no hidden part. */
export function folderPath(path: string): string {
  const p = String(path).replace(/^\.\//, '');
  if (!p || p.startsWith('/') || p.split('/').some((x) => !x || x === '.' || x === '..' || x.startsWith('.'))) throw new Error(`плохой путь «${path}»`);
  return p;
}
/** `keep`: what the plugin made goes when it is turned off (its images' URLs). */
export function filesApi(keep: (d: () => void) => void = () => {}): NonNullable<Ctx['files']> {
  const urls = new Set<string>();
  keep(() => {
    for (const u of urls) URL.revokeObjectURL(u);
    urls.clear();
  });
  return {
    read: async (path) => {
      const f = fileOf(path);
      if (!f) throw new Error(`нет файла «${path}» в рабочей папке`);
      return f.text;
    },
    imageUrl: async (path) => {
      const p = folderPath(path);
      const bytes = await invoke<ArrayBuffer | number[]>('read_bytes', { path: store.abs(p) });
      const ext = p.split('.').pop()!.toLowerCase();
      const url = URL.createObjectURL(new Blob([bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes)], { type: MIME[ext] ?? 'application/octet-stream' }));
      urls.add(url);
      return url;
    },
    revoke: (url) => {
      if (!urls.delete(String(url))) return;
      URL.revokeObjectURL(String(url));
    },
  };
}
/** `guard`: the plugin's code run in the host's guard (an error turns the plugin off). */
export function editApi(guard: (fn: () => void) => void): NonNullable<Ctx['edit']> {
  return {
    transaction: async (label, build, o = {}) => {
      let t: CoreTx | null = null;
      const ev: Changed[] = [];
      const onUndo = o.onUndo ? () => guard(() => o.onUndo!()) : undefined;
      const step = await store.transaction(label, (tx) => {
        t = tx;
        build(apiTx(tx, ev));
      }, onUndo, { touch: o.touch !== false });
      const tx = t as CoreTx | null;
      if (step) {
        for (const [r, w] of ev) headingChanged(r, w);
        return 'ok';
      }
      return tx?.conflict ? 'conflict' : tx && !tx.error && !tx.result().length ? 'ok' : 'error';
    },
    undo: () => store.undoLast(),
    ensureFile: async (path: string) => !!(await store.ensureFile(String(path))),
    writeBytes: async (path, base64) => {
      const p = folderPath(path);
      const abs = await invoke<string>('write_bytes', { path: store.abs(p), data: String(base64) });
      return abs.startsWith((store.dir ?? '') + '/') ? abs.slice((store.dir ?? '').length + 1) : p;
    },
  };
}
