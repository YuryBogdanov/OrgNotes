// The goals' edits as Org-level operations of a transaction (ТЗ 30): the core applies them in order, each sees what the
// ones before it did — a quarter made, a goal moved, «Отметки» found or made. No text of a whole file is rewritten by
// the plugin.

import type { HeadingInfo, HeadingRef, Tx } from '@panopticon/api';
import { FIELDS, goalLines, markLines, parseQuarter, qEnd, quarterLabel, quarterOf, quarterTitle, cmpQuarter, type NewGoal, type Quarter } from './goals';

const same = (a: string, b: string) => a.trim().toLowerCase().replace(/ё/g, 'е') === b.trim().toLowerCase().replace(/ё/g, 'е');

/** The quarter of a source, made when there is none — in its place: quarters go newest first. */
export function ensureQuarter(tx: Tx, src: HeadingRef, q: Quarter): HeadingRef | null {
  const kids = tx.children(src).flatMap((h) => {
    const x = parseQuarter(h.title);
    return x ? [{ h, q: x }] : [];
  });
  const have = kids.find((k) => cmpQuarter(k.q, q) === 0);
  if (have) return have.h.ref;
  const older = kids.find((k) => cmpQuarter(k.q, q) < 0);
  return tx.insertHeading(older ? { under: src, before: older.h.ref } : { under: src, position: 'last' }, `* ${quarterTitle(q)}`);
}

/** A goal of a quarter by its title, as the transaction has it. */
export function goalIn(tx: Tx, quarter: HeadingRef, title: string): HeadingInfo | null {
  return tx.children(quarter).find((h) => h.title === title) ?? null;
}

/** «Новая цель»: at the end of its quarter (made if needed). Its reference. */
export function addGoal(tx: Tx, src: HeadingRef, q: Quarter, g: NewGoal, names: string[], now = new Date()): HeadingRef | null {
  const quarter = ensureQuarter(tx, src, q);
  return quarter && tx.insertHeading({ under: quarter, position: 'last' }, goalLines(g, names, now).join('\n'));
}

const MARK = /^(\s*)- \[(\d{4})-(\d{2})-(\d{2})[^\]]*\]/;
/**
 * The body of «Отметки» with a mark in the order of dates: before the first later one (with its indent), else at
 * the end (with the indent of the marks there).
 */
export function withMark(body: string, date: Date, lines: string[]): string {
  const all = body ? body.split('\n') : [];
  let base = -1;
  let later = -1;
  let indent = '';
  for (let i = 0; i < all.length; i++) {
    const m = MARK.exec(all[i]);
    if (!m || (base >= 0 && m[1].length > base)) continue;
    if (base < 0) indent = m[1];
    base = m[1].length;
    if (later < 0 && +new Date(+m[2], +m[3] - 1, +m[4]) > +date) {
      later = i;
      indent = m[1];
    }
  }
  const add = lines.map((l) => (l ? indent + l : l));
  if (later >= 0) all.splice(later, 0, ...add);
  else all.push(...add);
  return all.join('\n');
}

/** A mark in «Отметки» of the goal (made at its end if there is none), in date order. */
export function addMark(tx: Tx, goal: HeadingRef, date: Date, text: string, names: string[]): boolean {
  if (!text.trim()) return false;
  const marks = tx.children(goal).find((h) => same(h.title, FIELDS.marks))?.ref ?? tx.ensureChild(goal, FIELDS.marks);
  const body = marks && tx.body(marks);
  if (!marks || body === null) return false;
  tx.replaceBody(marks, withMark(body, date, markLines(date, text, names)));
  return true;
}

/** «Квартал»: the goal under another quarter of its source (made in its place if needed), at its end. */
export function moveGoal(tx: Tx, src: HeadingRef, goal: HeadingRef, to: Quarter): boolean {
  const quarter = ensureQuarter(tx, src, to);
  if (!quarter) return false;
  tx.move(goal, { under: quarter });
  return true;
}

/**
 * «Перенести незакрытые»: each goal (by title) under the next quarter; a deadline inside the old quarter becomes the
 * last day of the new one; a mark «Перенесена из Q4 2026». The titles moved.
 */
export function carryOver(tx: Tx, src: HeadingRef, from: Quarter, to: Quarter, titles: string[], names: string[], now = new Date()): string[] {
  const moved: string[] = [];
  const old = tx.children(src).find((h) => cmpQuarter(parseQuarter(h.title) ?? { y: 0, q: 0 }, from) === 0);
  if (!old) return moved;
  for (const title of titles) {
    const g = goalIn(tx, old.ref, title);
    if (!g || !moveGoal(tx, src, g.ref, to)) continue;
    const quarter = ensureQuarter(tx, src, to);
    const now_ = quarter && goalIn(tx, quarter, title);
    if (!now_) continue;
    const dl = now_.deadline;
    if (dl && cmpQuarter(quarterOf(new Date(dl.y, dl.m - 1, dl.d)), from) === 0) tx.setPlanning(now_.ref, 'DEADLINE', qEnd(to));
    addMark(tx, now_.ref, now, `Перенесена из ${quarterLabel(from)}`, names);
    moved.push(title);
  }
  return moved;
}
