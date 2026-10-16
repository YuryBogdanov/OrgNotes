// The touches of headings (ТЗ 40 §2): when each heading was last changed, its subtree included. Pure: what a heading's
// key and fingerprint are, the date a heading gets when there is no history, and how a file's headings are matched
// against the records kept. The index that keeps them is touchIndex.svelte.ts.

import type { Heading } from './org';

/** What the index keeps of a heading. */
export interface TouchRecord {
  /** The last touch, ms. */
  at: number;
  /** A date taken from the file (no history yet): shown with «≈». */
  approx: boolean;
  /** Where an approximate date comes from: a :LOGBOOK: entry, CLOSED, or the file's modification time. */
  src?: 'logbook' | 'closed' | 'file';
  /** The fingerprint of the subtree, and of the subtree without its heading line (a rename keeps it). */
  hash: string;
  body: string;
  /** Where it was last seen: the file (its name in the folder) and the line. */
  file: string;
  line: number;
}
export type TouchRecords = Record<string, TouchRecord>;

/** A short fingerprint of a text (cyrb53). */
export function fingerprint(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const STARS = /^(\*+)(\s)/;
const EMPTY = fingerprint('');
/**
 * The subtree of `h` as compared (§2.1): spaces at the ends of lines and blank lines do not count; the stars count
 * from the heading's own level, so moving it under another level is not a change.
 */
export function subtreeText(lines: readonly string[], h: Heading, withHead = true): string {
  const out: string[] = [];
  for (let i = withHead ? h.line : h.line + 1; i < h.end && i < lines.length; i++) {
    const l = lines[i].trimEnd();
    if (!l) continue;
    const m = STARS.exec(l);
    out.push(m ? '*'.repeat(m[1].length - h.level + 1) + l.slice(m[1].length) : l);
  }
  return out.join('\n');
}

/** A heading's key (§2.3): its :ID:, else the file and the chain of titles; a second heading of the same chain gets
 *  «#2». */
export function headingKeys(file: string, hs: readonly Heading[]): string[] {
  const seen = new Map<string, number>();
  return hs.map((h) => {
    if (h.id) return 'id:' + h.id;
    const base = file + ' › ' + [...h.path, h.title].join(' › ');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base} #${n}` : base;
  });
}

const STAMP = /\[(\d{4})-(\d{2})-(\d{2})(?:\s+[^\s\]\d]+)?(?:\s+(\d{1,2}):(\d{2}))?[^\]]*\]/g;
const stampAt = (m: RegExpMatchArray) => new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0).getTime();

/**
 * The date of a heading without history (§2.4): the latest entry of a :LOGBOOK: in its subtree (notes, state changes,
 * reschedules, CLOCK), or CLOSED; else the file's modification time.
 */
export function initialTouch(lines: readonly string[], h: Heading, fileTime: number): { at: number; src: TouchRecord['src'] } {
  let best = -Infinity;
  let src: TouchRecord['src'] = 'file';
  let inLog = false;
  for (let i = h.line + 1; i < h.end && i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^:LOGBOOK:$/i.test(t)) {
      inLog = true;
      continue;
    }
    if (inLog && /^:END:$/i.test(t)) {
      inLog = false;
      continue;
    }
    const closed = /^(?:.*\s)?CLOSED:\s*\[/.test(t);
    if (!inLog && !closed) continue;
    for (const m of t.matchAll(STAMP)) {
      const at = stampAt(m);
      if (at > best) {
        best = at;
        src = inLog ? 'logbook' : 'closed';
      }
    }
  }
  return best > -Infinity ? { at: best, src } : { at: fileTime, src: 'file' };
}

/** How a file's headings were read: a change seen now (an edit written, a file changed on disk), or the folder opened
 *  (what changed while the app was closed, or no history yet); `quiet`: a mass edit (a tag renamed in every file),
 *  the records follow the text and keep their dates. */
export type TouchMode = 'change' | 'open' | 'quiet';

/**
 * A file's headings matched against the records (§2.2–2.3). `at`: the time of this version (the write, or the file's
 * modification time). A heading whose fingerprint did not change keeps its touch; a changed one is touched at `at`.
 * A new key inherits the record of a heading moved here unchanged (`moved`: records gone from where they were; or a
 * record of another file, or of this file under another parent), or of the heading at the same line with the same
 * body (renamed). Else: created now (`change`), or a date from the file
 * (`open`). Returns the file's records and the keys of its records that no heading took (deleted, or moved away).
 */
export function reconcileFile(
  file: string,
  lines: readonly string[],
  hs: readonly Heading[],
  prev: TouchRecords,
  moved: TouchRecords,
  at: number,
  mode: TouchMode,
): { records: TouchRecords; gone: string[] } {
  const keys = headingKeys(file, hs);
  const here = new Set(keys);
  const records: TouchRecords = {};
  // the records of this file that no heading has now: a rename may take one
  const orphans = Object.entries(prev).filter(([k, r]) => r.file === file && !here.has(k));
  const taken = new Set<string>();
  hs.forEach((h, i) => {
    const key = keys[i];
    const hash = fingerprint(subtreeText(lines, h));
    const body = fingerprint(subtreeText(lines, h, false));
    const base = { hash, body, file, line: h.line };
    const old = prev[key];
    if (old) {
      records[key] = old.hash === hash || mode === 'quiet' ? { ...old, ...base } : { at, approx: false, ...base };
      return;
    }
    // moved here unchanged: from where it went (a file written before this one), from another file still holding it
    // (this one written first: a refile writes the target first), or from elsewhere in this file (another parent).
    // A heading still in its place is taken only with a body: a bare new «* TODO Позвонить» is not that one
    const mv =
      Object.entries(moved).find(([k, r]) => r.hash === hash && !taken.has(k)) ??
      (body === EMPTY ? undefined : Object.entries(prev).find(([k, r]) => r.hash === hash && !taken.has(k) && !here.has(k) && (r.file !== file || orphans.some(([o]) => o === k))));
    if (mv) {
      taken.add(mv[0]);
      records[key] = { ...mv[1], ...base };
      return;
    }
    const rn = orphans.find(([k, r]) => !taken.has(k) && r.line === h.line && r.body === body);
    if (rn) {
      taken.add(rn[0]);
      records[key] = { at, approx: false, ...base };
      return;
    }
    if (mode === 'change') records[key] = { at, approx: false, ...base };
    else {
      const first = initialTouch(lines, h, at);
      records[key] = { at: first.at, approx: true, src: first.src, ...base };
    }
  });
  return { records, gone: orphans.filter(([k]) => !taken.has(k)).map(([k]) => k) };
}
