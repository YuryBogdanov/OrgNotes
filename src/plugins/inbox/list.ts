// The Inbox's list (ТЗ 01): the unsorted tasks of the Inbox file — its open top-level headings — and their age. Pure
// functions on the file's text, shared by the section, the review and the tests.

import type { Heading, Workflow } from '@panopticon/api/org';

/** The plugin's settings (in «Настройки → Inbox», its block «Список и разбор»). */
export interface ListSettings {
  order: 'new' | 'file'; // newest on top, or as in the file
  counter: boolean; // the badge on the Inbox button
  details: boolean; // the first line of details under the title
  reviewDone: string; // «Разбор»: what «Выполнено» writes (a done status)
  reviewCancel: string; // what «Отменить» writes
  reviewOrder: 'old' | 'new'; // the cards: oldest first or newest first
  stale: number; // days after which a task counts as lying too long (3, 7, 14, 30)
  alertAfter: number; // fix-50: the badge red when the oldest entry is older (3, 7, 14 days; 0 — never)
}
export const DEFAULT_SETTINGS: ListSettings = { order: 'new', counter: true, details: true, reviewDone: 'DONE', reviewCancel: 'CANCELLED', reviewOrder: 'old', stale: 7, alertAfter: 7 };
/** The settings as stored (checked; a default when wrong). */
export function readSettings(v: Record<string, unknown>): ListSettings {
  const str = (k: 'reviewDone' | 'reviewCancel') => (typeof v[k] === 'string' && (v[k] as string).trim() ? (v[k] as string).trim() : DEFAULT_SETTINGS[k]);
  const bool = (k: 'counter' | 'details') => (typeof v[k] === 'boolean' ? (v[k] as boolean) : DEFAULT_SETTINGS[k]);
  return {
    order: v.order === 'file' ? 'file' : 'new',
    counter: bool('counter'),
    details: bool('details'),
    reviewDone: str('reviewDone'),
    reviewCancel: str('reviewCancel'),
    reviewOrder: v.reviewOrder === 'new' ? 'new' : 'old',
    stale: [3, 7, 14, 30].includes(Number(v.stale)) ? Number(v.stale) : DEFAULT_SETTINGS.stale,
    alertAfter: [0, 3, 7, 14].includes(Number(v.alertAfter)) && v.alertAfter !== null && v.alertAfter !== '' ? Number(v.alertAfter) : DEFAULT_SETTINGS.alertAfter,
  };
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
export function inboxItems(text: string, headings: Heading[], wf: Workflow, order: ListSettings['order'] = 'new'): InboxItem[] {
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


/** The badge of «Входящие» (fix-50): how many wait to be sorted; red when the oldest of them is older than
 *  `alertAfter` days (0: never). */
export function inboxBadge(items: { created: Date | null }[], s: Pick<ListSettings, 'counter' | 'alertAfter'>, now = new Date()): { n: number; alert: boolean } {
  if (!s.counter || !items.length) return { n: 0, alert: false };
  const oldest = Math.min(...items.map((x) => (x.created ? +x.created : Infinity)));
  const days = Number.isFinite(oldest) ? (+now - oldest) / 86_400_000 : 0;
  return { n: items.length, alert: s.alertAfter > 0 && days > s.alertAfter };
}
