// Notes of a heading in its :LOGBOOK: (ТЗ 40 §3): the status of a long matter is written as Org writes a note on
// `C-c C-z` with `org-log-into-drawer`, and the last one is read back. Pure.

import { logNote, type Heading } from './org';
import { weekdayNames } from './edits';

const pad = (n: number) => String(n).padStart(2, '0');
/** An inactive stamp with the file's weekday names (Пт or Fri, as its other dates). */
const stamp = (d: Date, names: string[]) =>
  `[${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${names[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}]`;

/** The heading with a note on top of its :LOGBOOK: (the drawer made after its planning and properties). */
export function addNote(text: string, h: Heading, note: string, now = new Date()): string {
  const body = note
    .trim()
    .split('\n')
    .map((l) => '  ' + l.trimEnd())
    .join('\n');
  const lines = text.split('\n');
  logNote(lines, h, `- Note taken on ${stamp(now, weekdayNames(text))} \\\\\n${body}`);
  return lines.join('\n');
}

const STAMP = /\[(\d{4})-(\d{2})-(\d{2})(?:\s+[^\s\]\d]+)?(?:\s+(\d{1,2}):(\d{2}))?[^\]]*\]/;
const ENTRY = /^\s*-\s+(Note taken on|State\s+"[^"]*"\s+from(?:\s+"[^"]*")?)\s*(\[[^\]]+\])\s*(\\\\)?\s*$/;

/**
 * The last note of the heading itself (its own :LOGBOOK:, not its children's): a note taken, or the words after a
 * change of status (`- State "WAIT" from "NEXT" […] \\` and a line under it). Null when it has none.
 */
export function lastNote(lines: readonly string[], h: Heading): { at: Date; text: string } | null {
  let best: { at: Date; text: string } | null = null;
  let inLog = false;
  for (let i = h.line + 1; i < lines.length && i < h.end; i++) {
    const l = lines[i];
    if (/^\*+\s/.test(l)) break; // a child: its notes are its own
    const t = l.trim();
    if (/^:LOGBOOK:$/i.test(t)) {
      inLog = true;
      continue;
    }
    if (!inLog) continue;
    if (/^:END:$/i.test(t)) break;
    const m = ENTRY.exec(l);
    if (!m) continue;
    const isNote = m[1] === 'Note taken on';
    if (!isNote && !m[3]) continue; // a change of status without words
    const s = STAMP.exec(m[2]);
    if (!s) continue;
    const at = new Date(+s[1], +s[2] - 1, +s[3], s[4] ? +s[4] : 0, s[5] ? +s[5] : 0);
    const words: string[] = [];
    const indent = /^\s*/.exec(l)![0].length;
    for (let j = i + 1; j < lines.length && j < h.end; j++) {
      const n = lines[j];
      if (!n.trim() || /^\s*:END:\s*$/i.test(n) || ENTRY.test(n) || /^\s*CLOCK:/.test(n)) break;
      if (/^\s*/.exec(n)![0].length <= indent) break;
      words.push(n.trim());
    }
    if (!best || at > best.at) best = { at, text: words.join(' ') };
  }
  return best;
}
