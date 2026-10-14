// Making links (ТЗ 35): ⌘V on a selection with a link in the clipboard makes the selection its label; a link to a
// heading as it is copied (⌃C L). Pure: the text in, the change out; the editor and the store apply it.

import { dirname, extractLinks, normalize, type OrgLink } from './links';
import type { Heading } from './org';

const SCHEMES = /^(https?:\/\/|mailto:|file:|id:)\S/i;
const ORG_LINK = /^\[\[([^\]]+)\](?:\[([^\]]*)\])?\]$/;

/** The target of a link in the clipboard: an address (https://, mailto:, file:, id:) or a whole Org link
 *  `[[target]]` / `[[target][label]]` on one line. Null: not a link. */
export function clipTarget(clip: string): string | null {
  const s = clip.trim();
  if (!s || s.includes('\n')) return null;
  const m = ORG_LINK.exec(s);
  if (m) return m[1];
  return SCHEMES.test(s) && !/\s/.test(s) ? s : null;
}

/**
 * A `file:` target relative to the notes root (as a heading's link is copied) made relative to the file it goes into
 * (`here`, relative to the root too). Absolute, `~` and other targets stay.
 */
export function relTarget(target: string, here: string): string {
  const m = /^file:([^:]+)(::.*)?$/.exec(target);
  if (!m || m[1].startsWith('/') || m[1].startsWith('~')) return target;
  const to = normalize(m[1]).split('/');
  const from = here.includes('/') ? normalize(dirname(here)).split('/') : [];
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  const rel = [...from.slice(i).map(() => '..'), ...to.slice(i)].join('/');
  return `file:${rel}${m[2] ?? ''}`;
}

/**
 * ⌘V on the selection `from`–`to` of `text` with `clip` in the clipboard: the change that makes the selection the
 * label of a link (`[[target][label]]`), or only the target of the link whose label it is. Null: an ordinary paste —
 * nothing selected, more than one line, `[[`/`]]` in it, across the edge of a link, or no link in the clipboard.
 */
export function linkPaste(text: string, from: number, to: number, clip: string, here = ''): { from: number; to: number; insert: string; caret: number } | null {
  if (to <= from) return null;
  const t0 = clipTarget(clip);
  if (!t0) return null;
  const target = relTarget(t0, here);
  const sel = text.slice(from, to);
  if (sel.includes('\n') || sel.includes('[[') || sel.includes(']]')) return null;
  const ls = text.lastIndexOf('\n', from - 1) + 1;
  const le = text.indexOf('\n', to);
  const line = text.slice(ls, le < 0 ? text.length : le);
  for (const l of extractLinks(line)) {
    const a = ls + l.from;
    const b = ls + l.to;
    if (to <= a || from >= b) continue; // not this one
    // exactly the label of a link: its target changes
    if (l.descFrom != null && ls + l.descFrom === from && ls + l.descTo! === to) {
      const insert = `[[${target}][${sel}]]`;
      return { from: a, to: b, insert, caret: a + insert.length };
    }
    return null; // inside a link or across its edge
  }
  const insert = `[[${target}][${sel}]]`;
  return { from, to, insert, caret: from + insert.length };
}

/** A heading's title as a link's label: no status, priority, tags or [2/5] cookie (the parser has taken the rest). */
export const labelOf = (h: Pick<Heading, 'title'>) => h.title.replace(/\s*\[\d*(?:\/\d*|%)\]/g, '').replace(/\s+/g, ' ').trim();

/** The link to a heading: by its :ID: (`id`), or by its title in its file (relative to the notes root). */
export function headingLink(h: Pick<Heading, 'title'>, o: { id: string } | { file: string }): string {
  const label = labelOf(h);
  // by title: without the cookie, whose brackets would end the link (the search finds the heading without it)
  return 'id' in o ? `[[id:${o.id}][${label}]]` : `[[file:${o.file}::*${label}][${label}]]`;
}
/** The link to a file (the caret above its first heading). */
export const fileLink = (file: string, name: string) => `[[file:${file}][${name}]]`;

/** What the editor asks of the app about links (the store sets it: the editor does not import the store). */
export const linkHooks = {
  /** The name of the editor's file in the folder (a `file:` link goes in relative to it). */
  rel: (_path: string) => '',
  /** A link was made of the selection by ⌘V. */
  pasted: () => {},
  /** The text in the clipboard («Вставить как текст», the editor's menu). */
  readClip: async (): Promise<string> => '',
  /** «Копировать ссылку на заголовок» at a line of the editor's file. False: not a file of the folder. */
  copyHeading: (_path: string, _line: number): boolean => false,
  /** The palette «Ссылка на» (linkPicker.ts): `apply` puts the link in place of the selection or of the link edited. */
  pick: (_o: { path: string; sel: string; edit: { label: string | null } | null; apply: (insert: string) => void }) => {},
  /** The title of the heading a line of the editor's file is in (the menu's «Копировать ссылку…»), null — none. */
  headingAt: (_path: string, _line: number): string | null => null,
  /** A shortcut as set now («⌃C ⌃L»), '' none: the editor's menu and tooltip show them. */
  key: (_id: string) => '',
  /** Where a link goes, in words: «billing.org › Ревью», an address; `missing` — not found. */
  describe: (_link: OrgLink, _path: string): { text: string; missing: boolean } => ({ text: _link.raw, missing: false }),
};
