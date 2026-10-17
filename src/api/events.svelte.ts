// `events.on` (tech sprint 3.2, from the host): what a plugin hears — the files changed (by an edit or from disk),
// the headings its transactions changed, the tab shown, the Inbox, the folder, the theme, the day.

import { store } from '../store.svelte';
import type { Dispose, EventName, HeadingRef } from './index';
import type { Change } from './refs';
import { clone, watch } from './watch.svelte';
import { touches } from '../touchIndex.svelte';
import { headingAt } from '../org';

const headingListeners = new Set<(p: unknown) => void>();
/** After a plugin's transaction: what it changed in which heading. */
export function headingChanged(ref: HeadingRef, what: Change) {
  for (const l of headingListeners) l({ ref, what });
}

/** A plugin hears `e` (`send` is guarded by the host); `ownsView`: a kind of tab is the plugin's (its state goes along). */
export function listen(e: EventName, send: (p: unknown) => void, ownsView: (kind: string) => boolean): Dispose {
  switch (e) {
    case 'file.changed': {
      let last = new Map(store.files.map((f) => [f.name, f.text]));
      return watch(() => store.files, (files) => {
        const next = new Map(files.map((f) => [f.name, f.text]));
        for (const [name, text] of next)
          if (last.get(name) !== text) {
            const by = store.diskTaken.has(name) ? 'disk' : 'edit';
            store.diskTaken.delete(name);
            send({ path: name, by });
          }
        last = next;
      });
    }
    case 'heading.touched':
      // a batch at most once a second: each heading with its place now and when
      return touches.onTouched((list) => {
        for (const t of list) {
          const f = store.files.find((x) => x.name === t.file);
          const h = f?.headings.find((x) => x.line === t.line);
          if (h) send({ ref: { path: t.file, line: t.line, title: h.title }, at: new Date(t.at) });
        }
      });
    case 'heading.changed':
      headingListeners.add(send);
      return () => void headingListeners.delete(send);
    case 'tab.active': {
      const now = () => {
        const t = store.tab;
        const own = !!t && ownsView(t.kind);
        send({ kind: t?.kind ?? null, path: t?.kind === 'file' ? (store.file?.name ?? null) : null, state: own ? clone(t!.data) : undefined, view: t?.kind === 'file' ? store.viewOf(t) || null : null });
      };
      queueMicrotask(now); // the tab shown now, then each change
      return watch(() => [store.tab?.id, store.tab?.data, store.viewOf(store.tab)], now);
    }
    case 'editor.heading': {
      // the deepest heading under the caret of the file shown; a change sent at most once in 100 ms
      let last = '';
      let timer: ReturnType<typeof setTimeout> | undefined;
      const now = () => {
        timer = undefined;
        const f = store.tab?.kind === 'file' ? store.file : undefined;
        const k = f ? headingAt(f.headings, store.tab!.cursor.line) : -1;
        const h = f && k >= 0 ? f.headings[k] : null;
        const key = `${f?.name ?? ''}|${h ? h.line + ':' + h.title : ''}`;
        if (key === last) return;
        last = key;
        send({ path: f?.name ?? null, heading: f && h ? { path: f.name, line: h.line, title: h.title } : null });
      };
      const stop = watch(() => [store.tab?.id, store.file?.name, store.tab?.cursor.line, store.file?.headings], () => {
        timer ??= setTimeout(now, 100);
      });
      return () => {
        stop();
        clearTimeout(timer);
      };
    }
    case 'inbox.changed':
      return watch(() => store.inboxFile?.name ?? null, (p) => send({ path: p }));
    case 'folder.changed':
      return watch(() => store.dir, (d) => send({ folder: d }));
    case 'theme.changed': {
      const o = new MutationObserver(() => send({ appearance: document.documentElement.dataset.appearance ?? null }));
      o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-appearance', 'style'] });
      return () => o.disconnect();
    }
    case 'day.changed': {
      let day = new Date().toDateString();
      const tick = () => {
        const d = new Date().toDateString();
        if (d !== day) {
          day = d;
          send({ date: new Date() });
        }
      };
      const t = setInterval(tick, 60_000);
      document.addEventListener('visibilitychange', tick); // the Mac woke up
      return () => {
        clearInterval(t);
        document.removeEventListener('visibilitychange', tick);
      };
    }
  }
  throw new Error(`нет события «${e}»`);
}
