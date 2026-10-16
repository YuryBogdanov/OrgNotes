// The headings and files as the plugins see them (tech sprint 3.1, from the host): a path in the notes folder (the
// core's are absolute), a heading found by its title near its line, its info with its own parts (event, properties,
// reschedules); the plugin's Tx over the core's, with what changed for the events.

import { touches } from '../touchIndex.svelte';
import { store } from '../store.svelte';
import { newId } from '../endDay';
import type { Heading, OrgDate } from '../org';
import type { Tx as CoreTx } from '../journal';
import { propertiesOf, reschedulesOf } from '../orgOps';
import type { HeadingInfo, HeadingRef } from './index';

export const fileOf = (path: string) => store.files.find((f) => f.name === path);
export function findHeading(hs: Heading[], ref: HeadingRef) {
  return hs.find((h) => h.line === ref.line && h.title === ref.title) ?? hs.filter((h) => h.title === ref.title).sort((a, b) => Math.abs(a.line - ref.line) - Math.abs(b.line - ref.line))[0];
}
/** A heading's own parts the plugins read since 1.7: its event, its properties. */
// an event: the stamp under the heading (the core's), else one in its title (the calendar writes them there)
const STAMP = /<(\d{4})-(\d{2})-(\d{2})(?:\s+[^\s\d>]+)?(?:\s+(\d{2}:\d{2}))?[^>]*>/;
export function eventOf(h: Heading): OrgDate | undefined {
  if (h.event) return { ...h.event };
  const m = STAMP.exec(h.title);
  return m ? { y: +m[1], m: +m[2], d: +m[3], ...(m[4] ? { time: m[4] } : {}) } : undefined;
}
// the lines of the text read last: a file's headings ask for them one after another
let seen: { text: string; lines: string[] } = { text: '', lines: [''] };
const linesOf = (text: string) => (seen.text === text ? seen.lines : (seen = { text, lines: text.split('\n') }).lines);
const extraOf = (text: string, h: Heading) => {
  const event = eventOf(h);
  const lines = linesOf(text);
  const moved = reschedulesOf(lines, h);
  return { ...(event ? { event } : {}), properties: propertiesOf(lines, h), ...(moved.length ? { reschedules: moved } : {}) };
};
export function infoOf(f: (typeof store.files)[number], h: Heading): HeadingInfo {
  const inherited = new Set<string>(f.filetags);
  for (let p = h.parent; p >= 0; p = f.headings[p].parent) for (const t of f.headings[p].tags) inherited.add(t);
  return {
    ref: { path: f.name, line: h.line, title: h.title }, level: h.level, keyword: h.keyword, done: !!h.keyword && f.wf.done.includes(h.keyword),
    priority: h.priority, title: h.title, tags: [...new Set([...h.tags, ...inherited])],
    ...(h.scheduled ? { scheduled: { ...h.scheduled } } : {}), ...(h.deadline ? { deadline: { ...h.deadline } } : {}), ...(h.closed ? { closed: { ...h.closed } } : {}),
    ...extraOf(f.text, h),
    ...touchedOf(f.name, h.line),
  } as HeadingInfo;
}
/** The touch of a heading as the plugins see it (ТЗ 40); nothing while the index is being built. */
export function touchedOf(file: string, line: number): { touched?: { at: Date; approx: boolean } } {
  const r = touches.at(file, line);
  return r ? { touched: { at: new Date(r.at), approx: r.approx } } : {};
}
/** What changed in a heading, for the plugins' events. */
export type Change = 'status' | 'planning' | 'tags' | 'title' | 'property' | 'body' | 'moved' | 'removed';
export type Changed = [HeadingRef, Change];
/** A reference of the API (a path in the notes folder) as the core's (the file's full path). */
export const coreRef = (h: HeadingRef): HeadingRef => ({ ...h, path: fileOf(h.path)?.path ?? h.path });
export const corePath = (rel: string) => fileOf(rel)?.path ?? rel;
/** A reference of the core's (an absolute path) as the plugins have it (the path in the notes folder). */
export const apiRef = (h: HeadingRef | null): HeadingRef | null => (h ? { ...h, path: store.files.find((f) => f.path === h.path)?.name ?? h.path } : null);
/** A heading of a transaction (its text now) as the plugins see it. */
function txInfo(tx: CoreTx, ref: HeadingRef, h: Heading): HeadingInfo {
  const f = store.files.find((x) => x.path === ref.path);
  const hs = tx.headings(ref.path) ?? [];
  const inherited = new Set<string>(f?.filetags ?? []);
  for (let p = h.parent; p >= 0; p = hs[p].parent) for (const t of hs[p].tags) inherited.add(t);
  const done = !!h.keyword && !!f?.wf.done.includes(h.keyword);
  return {
    ref: { path: f?.name ?? ref.path, line: h.line, title: h.title }, level: h.level, keyword: h.keyword, done, priority: h.priority, title: h.title,
    tags: [...new Set([...h.tags, ...inherited])],
    ...(h.scheduled ? { scheduled: { ...h.scheduled } } : {}), ...(h.deadline ? { deadline: { ...h.deadline } } : {}), ...(h.closed ? { closed: { ...h.closed } } : {}),
    ...extraOf(tx.text(ref.path) ?? '', h),
  } as HeadingInfo;
}
/** The plugin's Tx over the core's (§5.4): the same operations; what changed in which heading, for the events. */
export function apiTx(tx: CoreTx, ev: Changed[]) {
  return {
    setStatus: (h: HeadingRef, kw: string | null) => (tx.setStatus(coreRef(h), kw), ev.push([h, 'status'])),
    setPlanning: (h: HeadingRef, k: 'SCHEDULED' | 'DEADLINE', d: Date | null) => (tx.setPlanning(coreRef(h), k, d), ev.push([h, 'planning'])),
    setTags: (h: HeadingRef, tags: string[]) => (tx.setTags(coreRef(h), tags), ev.push([h, 'tags'])),
    setTitle: (h: HeadingRef, title: string) => (tx.setTitle(coreRef(h), String(title)), ev.push([h, 'title'])),
    setProperty: (h: HeadingRef, k: string, v: string | null) => (tx.setProperty(coreRef(h), k, v), ev.push([h, 'property'])),
    addNote: (h: HeadingRef, text: string) => (tx.addNote(coreRef(h), String(text)), ev.push([h, 'body'])),
    insertHeading: (at: { under: HeadingRef; position: 'first' | 'last' } | { under: HeadingRef; before: HeadingRef } | { file: string; position: 'top' | 'end' } | { after: HeadingRef }, org: string) =>
      apiRef(
        tx.insertHeading(
          'after' in at
            ? { after: coreRef(at.after) }
            : 'under' in at ? ('before' in at ? { under: coreRef(at.under), before: coreRef(at.before) } : { under: coreRef(at.under), position: at.position }) : { file: corePath(at.file), position: at.position },
          org,
        ),
      ),
    ensureChild: (under: HeadingRef, title: string, at: { before?: HeadingRef } = {}) =>
      apiRef(tx.ensureChild(coreRef(under), String(title), at.before ? { before: coreRef(at.before) } : {})),
    heading: (h: HeadingRef) => {
      const r = coreRef(h);
      const x = tx.heading(r);
      return x ? txInfo(tx, r, x) : null;
    },
    children: (h: HeadingRef) => {
      const r = coreRef(h);
      return tx.children(r).map((x) => txInfo(tx, r, x));
    },
    body: (h: HeadingRef) => tx.body(coreRef(h)),
    replaceBody: (h: HeadingRef, org: string) => (tx.replaceBody(coreRef(h), org), ev.push([h, 'body'])),
    move: (h: HeadingRef, to: { under: HeadingRef } | { file: string } | { before: HeadingRef } | { after: HeadingRef }) => (
      tx.move(coreRef(h), 'under' in to ? { under: coreRef(to.under) } : 'before' in to ? { before: coreRef(to.before) } : 'after' in to ? { after: coreRef(to.after) } : { file: corePath(to.file) }),
      ev.push([h, 'moved'])
    ),
    remove: (h: HeadingRef) => (tx.remove(coreRef(h)), ev.push([h, 'removed'])),
    ensureId: (h: HeadingRef) => {
      const r = coreRef(h);
      const x = tx.heading(r);
      if (!x) return null;
      const have = txInfo(tx, r, x).properties.ID;
      if (have) return have;
      const id = newId();
      tx.setProperty(r, 'ID', id);
      ev.push([h, 'property']);
      return id;
    },
    update: (path: string, fn: (text: string) => string | null) =>
      tx.update(corePath(path), (t) => {
        try {
          const r = fn(t);
          return typeof r === 'string' ? r : null;
        } catch (err) {
          tx.error = err instanceof Error ? err.message : String(err);
          return null;
        }
      }),
  };
}
