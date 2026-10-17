// «Архивировать поддерево» (ТЗ 41 §7) as `org-archive-subtree` of Emacs, pure: where a heading goes — the `:ARCHIVE:`
// property of it or of its nearest ancestor, else «#+ARCHIVE:» of the file, else «%s_archive::» («<file>.org_archive»
// next to it, at its top level); what goes — the subtree whole, with ARCHIVE_TIME, ARCHIVE_FILE, ARCHIVE_OLPATH,
// ARCHIVE_CATEGORY, ARCHIVE_TODO in its properties. The core's command and the board's «В архив» (ТЗ 33) are one.

import { parseHeadings, type Heading, type Workflow } from './org';
import { setProperty } from './orgOps';

const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const p2 = (n: number) => String(n).padStart(2, '0');
export const DEFAULT_ARCHIVE = '%s_archive::';

/** A location «file::heading» read: the file (a path in the notes folder; the same file when its part is empty) and
 *  the heading to go under (null: the top level). */
export function readLocation(spec: string, path: string): { file: string; heading: string | null } {
  const at = spec.indexOf('::');
  const filePart = (at < 0 ? spec : spec.slice(0, at)).trim();
  const headPart = at < 0 ? '' : spec.slice(at + 2).trim();
  const i = path.lastIndexOf('/');
  const dir = i < 0 ? '' : path.slice(0, i + 1);
  const name = path.slice(i + 1);
  let file = path;
  if (filePart) {
    const loc = filePart.replace(/%s/g, name).replace(/^\.\//, '');
    // relative to the file's folder; «../» goes up within the notes folder
    const out: string[] = [];
    for (const s of (dir + loc).split('/')) {
      if (s === '..') out.pop();
      else if (s && s !== '.') out.push(s);
    }
    file = out.join('/');
  }
  const heading = headPart.replace(/^\*+\s*/, '').trim() || null;
  return { file, heading };
}

/** The location of the file's «#+ARCHIVE:» in its header (before the first heading); null: none. */
export function fileLocation(text: string): string | null {
  let spec: string | null = null;
  for (const l of text.split('\n')) {
    if (/^\*+\s/.test(l)) break;
    const m = /^#\+ARCHIVE:[ \t]*(.*?)[ \t]*$/i.exec(l);
    if (m) spec = m[1];
  }
  return spec;
}

/** A heading's own `:ARCHIVE:` property, from its drawer right under it; null: none. */
function ownLocation(lines: string[], h: Heading): string | null {
  let i = h.line + 1;
  if (/^\s*(SCHEDULED|DEADLINE|CLOSED):/.test(lines[i] ?? '')) i++;
  if (!/^\s*:PROPERTIES:\s*$/.test(lines[i] ?? '')) return null;
  for (i++; i < h.end && !/^\s*:END:\s*$/.test(lines[i]); i++) {
    const m = /^\s*:ARCHIVE:[ \t]*(.*?)[ \t]*$/i.exec(lines[i]);
    if (m) return m[1];
  }
  return null;
}

/** Where a heading goes: its `:ARCHIVE:`, an ancestor's, the file's «#+ARCHIVE:», else «%s_archive::». */
export function archiveTarget(text: string, headings: Heading[], h: Heading, path: string): { file: string; heading: string | null } {
  const lines = text.split('\n');
  for (let k = headings.indexOf(h); k >= 0; k = headings[k].parent) {
    const own = ownLocation(lines, headings[k]);
    if (own !== null) return readLocation(own, path);
  }
  return readLocation(fileLocation(text) ?? DEFAULT_ARCHIVE, path);
}

/** The archive of a file as the board names it (the top level of `archiveTarget` for its first heading). */
export function archivePath(text: string, path: string): string {
  return readLocation(fileLocation(text) ?? DEFAULT_ARCHIVE, path).file;
}

/** The category of a file: «#+CATEGORY:», else its name without «.org». */
export function categoryOf(text: string, path: string): string {
  const m = /^#\+CATEGORY:[ \t]*(.+?)[ \t]*$/im.exec(text);
  return m ? m[1] : (path.split('/').pop() ?? path).replace(/\.org$/, '');
}

/** The entry of the archive: the heading with its subtree and the properties of where it came from. */
export function archiveEntry(text: string, h: Heading, wf: Workflow, o: { now: Date; file: string; category: string }): string {
  const lines = text.split('\n').slice(h.line, h.end);
  while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
  let sub = lines.join('\n');
  const olpath = h.path.join('/');
  const props: [string, string | null][] = [
    ['ARCHIVE_TIME', `${o.now.getFullYear()}-${p2(o.now.getMonth() + 1)}-${p2(o.now.getDate())} ${WD[o.now.getDay()]} ${p2(o.now.getHours())}:${p2(o.now.getMinutes())}`],
    ['ARCHIVE_FILE', o.file],
    ['ARCHIVE_OLPATH', olpath || null],
    ['ARCHIVE_CATEGORY', o.category],
    ['ARCHIVE_TODO', h.keyword],
  ];
  for (const [k, v] of props) {
    if (v === null) continue;
    sub = setProperty(sub, parseHeadings(sub, wf)[0], k, v);
  }
  return sub;
}
