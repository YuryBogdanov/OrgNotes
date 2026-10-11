// Inbox: one chosen .org file where tasks are put quickly, to be sorted out later. Pure functions on its text, so the
// panel, the quick entry and the tests share them.

import { headingLines, inactiveStamp, type Heading, type Workflow } from './org';

/** The project's Inbox settings (`inbox` in .orgnotes/config.json): they belong to the notes folder. */
export interface InboxConfig {
  file: string | null; // relative path of the Inbox file; null = not set up yet
  status: string | null; // status of a new task; null = the first open status of the file
  created: boolean; // write :CREATED:
  order: 'new' | 'file'; // newest on top, or as in the file
  counter: boolean; // the badge on the Inbox button
  details: boolean; // the first line of details under the title
  confirm: boolean; // «Добавлено в Inbox» after a quick entry
}
export const DEFAULT_INBOX: InboxConfig = { file: null, status: null, created: true, order: 'new', counter: true, details: true, confirm: true };

export function readInbox(raw: unknown): InboxConfig {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bool = (k: keyof InboxConfig) => (typeof v[k] === 'boolean' ? (v[k] as boolean) : (DEFAULT_INBOX[k] as boolean));
  return {
    file: typeof v.file === 'string' && v.file.trim() ? v.file.trim() : null,
    status: typeof v.status === 'string' && v.status.trim() ? v.status.trim() : null,
    created: bool('created'),
    order: v.order === 'file' ? 'file' : 'new',
    counter: bool('counter'),
    details: bool('details'),
    confirm: bool('confirm'),
  };
}
/** config.json with the Inbox settings replaced; every other key stays. */
export function withInbox(raw: string | null, c: InboxConfig): string {
  let base: Record<string, unknown> = {};
  try {
    const p = raw ? JSON.parse(raw) : null;
    if (p && typeof p === 'object' && !Array.isArray(p)) base = p;
  } catch {
    /* an unreadable file is replaced */
  }
  const out: Record<string, unknown> = { version: base.version ?? 1, ...base };
  const keep: Record<string, unknown> = {};
  for (const [k, d] of Object.entries(DEFAULT_INBOX)) if (c[k as keyof InboxConfig] !== d) keep[k] = c[k as keyof InboxConfig];
  if (Object.keys(keep).length) out.inbox = keep;
  else delete out.inbox;
  return JSON.stringify(out, null, 2) + '\n';
}

// ---- the list ------------------------------------------------------------------------------------------------

export interface InboxItem {
  index: number; // into the file's headings
  line: number;
  title: string;
  keyword: string;
  details: string; // the first line of text under the heading, if any
  hasDetails: boolean;
  created: Date | null;
  order: number; // position in the file
}

const CREATED = /^\s*:CREATED:\s*\[(\d{4})-(\d{2})-(\d{2})(?:\s+[^\s\d\]]+)?(?:\s+(\d{1,2}):(\d{2}))?[^\]]*\]/i;
const DRAWER = /^\s*:[A-Za-z_-]+:/;
const PLAN = /^\s*(SCHEDULED|DEADLINE|CLOSED):/;

/** The text lines of a heading's own body (planning, drawers and sub-headings left out). */
function bodyOf(lines: string[], h: Heading, next: number): { created: Date | null; text: string[] } {
  let created: Date | null = null;
  const text: string[] = [];
  let inDrawer = false;
  for (let i = h.line + 1; i < next; i++) {
    const l = lines[i];
    if (/^\s*:END:\s*$/i.test(l)) {
      inDrawer = false;
      continue;
    }
    if (inDrawer) {
      const m = CREATED.exec(l);
      if (m) created = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
      continue;
    }
    if (/^\s*:[A-Za-z_]+:\s*$/.test(l)) {
      inDrawer = true;
      continue;
    }
    if (PLAN.test(l) || (DRAWER.test(l) && /:\s*$/.test(l))) continue;
    text.push(l);
  }
  return { created, text };
}

/** Unsorted tasks: top-level headings of the Inbox file with an open status, newest first (by :CREATED:), those
 *  without :CREATED: after them in the file's order — or all in the file's order. */
export function inboxItems(text: string, headings: Heading[], wf: Workflow, order: InboxConfig['order'] = 'new'): InboxItem[] {
  const lines = text.split('\n');
  const out: InboxItem[] = [];
  headings.forEach((h, i) => {
    if (h.level !== 1 || !h.keyword || !wf.open.includes(h.keyword)) return;
    // its own text runs to the next heading of any level; sub-headings count as details too
    const nx = headings[i + 1];
    const hasSub = !!nx && nx.line < h.end;
    const ownEnd = hasSub ? nx.line : h.end;
    const { created, text: body } = bodyOf(lines, h, ownEnd);
    const shown = body.map((l) => l.trim()).filter(Boolean);
    out.push({
      index: i, line: h.line, title: h.title, keyword: h.keyword, details: shown[0] ?? '', hasDetails: shown.length > 0 || hasSub,
      created, order: i,
    });
  });
  if (order === 'new') {
    out.sort((a, b) => (a.created && b.created ? +b.created - +a.created : a.created ? -1 : b.created ? 1 : a.order - b.order));
  }
  return out;
}

const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const pad = (n: number) => String(n).padStart(2, '0');
/** «только что», «5 мин», «2 ч», «вчера», «8 окт» (another year: «8 окт 2025»). */
export function ago(d: Date | null, now = new Date()): string {
  if (!d) return '';
  const min = Math.floor((+now - +d) / 60000);
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((+day0 - +new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days <= 0) {
    if (min < 1) return 'только что';
    if (min < 60) return `${min} мин`;
    return `сегодня ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (days === 1) return 'вчера';
  return `${d.getDate()} ${MON[d.getMonth()]}` + (d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '');
}

// ---- writing ---------------------------------------------------------------------------------------------------

/** A new task as it goes into the file: `* TODO Title`, :CREATED:, the details (a line that would read as a
 *  heading is escaped with «,», as Org does in blocks). */
export function entry(title: string, details: string, status: string, created: Date | null): string {
  const t = title.replace(/\s+/g, ' ').trim();
  const out = [`* ${status} ${t}`];
  if (created) out.push(':PROPERTIES:', `:CREATED: ${inactiveStamp(created)}`, ':END:');
  const d = details.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  if (d.trim()) for (const l of d.split('\n')) out.push(/^\*+\s/.test(l) ? ',' + l : l);
  return out.join('\n');
}
/** The file with a task added at its end (the file keeps ending with a line break). */
export function append(text: string, task: string): string {
  const body = text.replace(/\n*$/, '');
  return (body ? body + '\n' : '') + task + '\n';
}

/**
 * The file with a task added at its top: after the preamble (#+TITLE and the like, kept as it is), before the first
 * heading, with one blank line between the task and the heading below it, so the newest is seen first on opening.
 */
export function prepend(text: string, task: string): string {
  const lines = text.split('\n');
  const first = Math.min(...headingLines(lines));
  if (!isFinite(first)) {
    const body = text.replace(/\n\s*$/, '');
    return (body.trim() ? body + '\n\n' : '') + task + '\n';
  }
  const rest = lines.slice(first).join('\n');
  return lines.slice(0, first).map((l) => l + '\n').join('') + task + '\n\n' + (rest.endsWith('\n') ? rest : rest + '\n');
}

/** The lines a heading takes with everything under it. */
export const subtree = (text: string, h: Heading) => text.split('\n').slice(h.line, h.end);
/** The file without a heading and everything under it. */
export function remove(text: string, h: Heading): string {
  const lines = text.split('\n');
  lines.splice(h.line, h.end - h.line);
  return lines.join('\n');
}

/**
 * A subtree placed into another file: at its end as a top-level heading, or as the last child of `under` (the
 * levels are recounted; :CREATED: and the details go with it).
 */
export function insert(dst: string, tree: string[], level: number, under: Heading | null): string {
  const shift = (under ? under.level + 1 : 1) - level;
  const moved = tree.map((l) => l.replace(/^(\*+)(\s)/, (_, s: string, sp: string) => '*'.repeat(Math.max(1, s.length + shift)) + sp));
  while (moved.length && moved[moved.length - 1].trim() === '') moved.pop();
  if (!under) return append(dst, moved.join('\n'));
  const lines = dst.split('\n');
  // after the last non-blank line of the heading's subtree
  let at = under.end;
  while (at > under.line + 1 && (lines[at - 1] ?? '').trim() === '') at--;
  lines.splice(at, 0, ...moved);
  const out = lines.join('\n');
  return out.endsWith('\n') ? out : out + '\n';
}
