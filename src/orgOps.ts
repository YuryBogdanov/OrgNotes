// Org operations of a transaction (ТЗ 26 §5.4) that the core did not have: a property, a new heading with its
// subtree, the body of a heading. Pure, on the text; the moves are refile.ts's.

import { headingLines, type Heading } from './org';
import { place, relevel } from './refile';

const PLANNING = /^\s*(SCHEDULED|DEADLINE|CLOSED):/;
const DRAWER = /^\s*:([A-Za-z_-]+):\s*$/;
const END = /^\s*:END:\s*$/i;

/** The line after the heading's planning and its drawers right under it (PROPERTIES, LOGBOOK, …). */
function afterMeta(lines: string[], h: Heading): number {
  let i = h.line + 1;
  if (PLANNING.test(lines[i] ?? '')) i++;
  while (i < h.end && DRAWER.test(lines[i] ?? '') && !END.test(lines[i])) {
    let j = i + 1;
    while (j < h.end && !END.test(lines[j])) j++;
    if (j >= h.end) break; // an unclosed drawer: text, not a drawer
    i = j + 1;
  }
  return i;
}
/** The first subheading's line (or the subtree's end). */
function firstChild(lines: string[], h: Heading): number {
  const sub = lines.slice(h.line + 1, h.end);
  const heads = headingLines(sub);
  for (let i = 0; i < sub.length; i++) if (heads.has(i)) return h.line + 1 + i;
  return h.end;
}

/** Set a property in the :PROPERTIES: drawer (made when missing); null removes it (and an empty drawer). */
export function setProperty(text: string, h: Heading, key: string, value: string | null): string {
  const lines = text.split('\n');
  let i = h.line + 1;
  if (PLANNING.test(lines[i] ?? '')) i++;
  const re = new RegExp(`^\\s*:${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\s|$)`, 'i');
  if (/^\s*:PROPERTIES:\s*$/i.test(lines[i] ?? '')) {
    let j = i + 1;
    for (; j < lines.length && !END.test(lines[j]); j++)
      if (re.test(lines[j])) {
        if (value === null) {
          lines.splice(j, 1);
          if (END.test(lines[i + 1] ?? '')) lines.splice(i, 2); // nothing left in it
        } else lines[j] = lines[j].replace(/^(\s*:[^:\s]+:).*$/, `$1 ${value}`); // its own spelling of the key stays
        return lines.join('\n');
      }
    if (value !== null) lines.splice(j, 0, `:${key}: ${value}`);
  } else if (value !== null) lines.splice(i, 0, ':PROPERTIES:', `:${key}: ${value}`, ':END:');
  return lines.join('\n');
}

/** The org text of one heading (with its subtree): its lines, the root's level and the rest checked. */
export function treeOf(org: string): { lines: string[]; level: number } | null {
  const lines = org.replace(/\n+$/, '').split('\n');
  const m = /^(\*+)\s/.exec(lines[0] ?? '');
  if (!m) return null;
  const level = m[1].length;
  const heads = headingLines(lines);
  for (const i of heads) if (i > 0 && (/^(\*+)/.exec(lines[i])?.[1].length ?? 0) <= level) return null; // a second root
  return { lines, level };
}

/** Where a new heading goes: under another one (its first or last child, or right before one of its children), or
 *  at the top or the end of a file. */
export type InsertAt = { under: Heading; position: 'first' | 'last' } | { under: Heading; before: Heading } | { position: 'top' | 'end' };

/** A new heading (with its subtree) and the line it is on now; null — not one heading. The last child goes before the
 *  blank lines that end its parent's subtree, right after the text above it. */
export function insertHeadingAt(text: string, at: InsertAt, org: string): { text: string; line: number } | null {
  const t = treeOf(org);
  if (!t) return null;
  if ('under' in at) {
    const tree = relevel(t.lines, t.level, at.under.level + 1);
    if ('before' in at) {
      const lines = text.split('\n');
      lines.splice(at.before.line, 0, ...tree);
      return { text: lines.join('\n'), line: at.before.line };
    }
    if (at.position === 'last') return place(text, tree, at.under);
    const lines = text.split('\n');
    const i = firstChild(lines, at.under);
    lines.splice(i, 0, ...tree);
    return { text: lines.join('\n'), line: i };
  }
  const tree = relevel(t.lines, t.level, 1);
  if (at.position === 'end') return place(text, tree, null);
  // the top: after the file's header (#+ lines and the text before the first heading)
  const lines = text.split('\n');
  const heads = headingLines(lines);
  const first = [...heads].sort((a, b) => a - b)[0] ?? lines.length;
  let i = first;
  if (first === lines.length) while (i > 0 && lines[i - 1].trim() === '') i--;
  lines.splice(i, 0, ...tree);
  return { text: lines.join('\n'), line: i };
}
/** The text with a new heading; null — not one heading. */
export function insertHeading(text: string, at: InsertAt, org: string): string | null {
  return insertHeadingAt(text, at, org)?.text ?? null;
}

/** The heading's body as `replaceBody` changes it: after its planning and drawers, up to its first subheading, the
 *  blank lines at its end left out. */
export function bodyOf(text: string, h: Heading): string {
  const lines = text.split('\n');
  const from = afterMeta(lines, h);
  let to = firstChild(lines, h);
  while (to > from && lines[to - 1].trim() === '') to--;
  return lines.slice(from, to).join('\n');
}

/** Replace the heading's body: the text after its planning and drawers, up to its first subheading. */
export function replaceBody(text: string, h: Heading, org: string): string {
  const lines = text.split('\n');
  const from = afterMeta(lines, h);
  let to = firstChild(lines, h);
  // the blank lines that end the body stay where they are (before a subheading or the next heading)
  while (to > from && lines[to - 1].trim() === '') to--;
  const body = org.replace(/\n+$/, '');
  if (body.split('\n').some((l) => /^\*+\s/.test(l))) throw new Error('a body has no headings');
  lines.splice(from, to - from, ...(body ? body.split('\n') : []));
  return lines.join('\n');
}
