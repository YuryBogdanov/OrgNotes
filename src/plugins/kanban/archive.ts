// «В архив» (ТЗ 33 §4) as `org-archive-subtree` of Emacs: where — «#+ARCHIVE:» of the file («%s_archive::» by default:
// «<file>_archive» next to it, at its top level); what — the subtree whole, with ARCHIVE_TIME, ARCHIVE_FILE,
// ARCHIVE_OLPATH, ARCHIVE_CATEGORY, ARCHIVE_TODO in its properties. Pure: the texts in, the archive's entry out.

import { parseHeadings, setProperty, type Heading, type Workflow } from '@panopticon/api/org';

const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const p2 = (n: number) => String(n).padStart(2, '0');

/** The archive of a file (a path in the notes folder): «#+ARCHIVE: loc::…» of its header, else «%s_archive». */
export function archivePath(text: string, path: string): string {
  let spec = '%s_archive';
  for (const l of text.split('\n')) {
    if (/^\*+\s/.test(l)) break;
    const m = /^#\+ARCHIVE:[ \t]*(.*?)[ \t]*$/i.exec(l);
    if (m) spec = m[1].split('::')[0].trim() || '%s_archive';
  }
  const i = path.lastIndexOf('/');
  const dir = i < 0 ? '' : path.slice(0, i + 1);
  const name = path.slice(i + 1);
  const loc = spec.replace(/%s/g, name).replace(/^\.\//, '');
  // relative to the file's folder; «../» goes up within the notes folder
  const parts = (dir + loc).split('/');
  const out: string[] = [];
  for (const s of parts) {
    if (s === '..') out.pop();
    else if (s && s !== '.') out.push(s);
  }
  return out.join('/');
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
