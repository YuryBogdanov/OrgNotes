// The actions on a long matter (ТЗ 40 §4.2–4.4, §6.3): «Статус…» (the core's popover), «Проверить через…»
// (`:NEXT_REVIEW:`), «Ждём…» / «Больше не ждём» (`:WAITING_ON:`, the day, the status of waiting — one transaction),
// «Осмотрено» (a touch without a change of the file), «Убрать из долгих дел», and the menu of a row.

import type { HeadingRef, MenuItem, Tx } from '@panopticon/api';
import { weekdayNames } from '@panopticon/api/org';
import { long } from './state.svelte';
import { REVIEW_IN, addDays, mattersWord, stampOf, statusBefore, type Matter } from './long';

type At = { x: number; y: number };
const today = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const ref = (m: Matter): HeadingRef => long.refOf(m);
const namesOf = (m: Matter) => weekdayNames(long.files.get(m.path)?.text ?? '');
const headingOf = (m: Matter) => long.files.get(m.path)?.headings.find((h) => h.line === m.line);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (s: string) => {
  const [y, mo, d] = s.split('-').map(Number);
  return new Date(y, mo - 1, d);
};

async function write(label: string, build: (tx: Tx) => void) {
  const r = await long.ctx.edit!.transaction(label, build);
  long.soon(0);
  return r === 'ok';
}

// ---- «Статус…» ---------------------------------------------------------------------------------------------------
/** The core's «Добавить заметку…» under the row (`at`), else at the top of the window. */
export function status(m: Matter, at?: At) {
  void long.ctx.commands.run('heading.note', { ref: ref(m), ...(at ? { x: at.x, y: at.y } : {}) });
}

// ---- «Проверить через…» ------------------------------------------------------------------------------------------
export function setReview(m: Matter, d: Date | null) {
  return write(d ? 'Проверить через…' : 'Убрать срок проверки', (tx) => tx.setProperty(ref(m), 'NEXT_REVIEW', d ? stampOf(d, namesOf(m)) : null));
}
async function pickReview(m: Matter) {
  const d = await long.ctx.ui.pickDate({ title: 'Проверить', initial: m.nextReview ?? addDays(today(), 14), names: namesOf(m), current: m.nextReview });
  if (d) await setReview(m, d);
}
/** The choices of «Проверить через…»: a week, two, a month, a date; «Убрать срок» while it has one. */
function reviewItems(m: Matter): MenuItem[] {
  return [
    ...REVIEW_IN.map((r) => ({ label: r.label, run: () => void setReview(m, addDays(today(), r.days)) })),
    { label: 'Дату…', run: () => void pickReview(m) },
    ...(m.nextReview ? [{ label: 'Убрать срок', run: () => void setReview(m, null) }] : []),
  ];
}
/** At a row: the menu; without a place (the palette, the editor's menu): a choice in the palette. */
export async function review(m: Matter, at?: At) {
  const items = reviewItems(m);
  if (at) return long.ctx.ui.menu(items, at);
  const id = await long.ctx.ui.choose({ title: `Проверить «${m.title}»`, placeholder: 'Когда проверить', items: items.map((it, i) => ({ id: String(i), label: it.label })) });
  if (id !== null) items[Number(id)]?.run();
}

// ---- «Ждём…» / «Больше не ждём» ----------------------------------------------------------------------------------
/** The file's statuses know the status of waiting. */
const knowsWait = (m: Matter) => !!long.files.get(m.path)?.info.open.includes(long.settings.wait);

/** The sheet «Ждём…» and its write; `o.days` — the days to look again when no date is given (the walk's choice),
 *  `o.also` — what goes in the same step (the walk's status). Whom it waits for, null: cancelled. */
export async function wait(m: Matter, o: { days?: number; also?: (tx: Tx) => void } = {}): Promise<string | null> {
  const W = long.settings.wait;
  const offerStatus = knowsWait(m);
  const v = await long.ctx.ui.form({
    title: `Ждём: ${m.title}`,
    submit: 'Ждём',
    initial: { who: m.waiting ?? '', until: m.nextReview && m.waiting ? iso(m.nextReview) : null, setWait: offerStatus && m.keyword !== W },
    validate: (x) => (String(x.who ?? '').trim() ? null : 'Кого или что ждём?'),
    groups: [
      {
        fields: [
          { type: 'text', key: 'who', label: 'Кого или что ждём', placeholder: 'бизнес, Ирина, финансы', suggest: whoFits },
          { type: 'date', key: 'until', label: 'До какой даты', look: 'chip', clear: 'Без даты', hint: `Не указана — проверить через ${o.days ?? long.settings.norm} дн.` },
          ...(offerStatus ? [{ type: 'switch' as const, key: 'setWait', label: `Поставить статус ${W}` }] : []),
        ],
      },
    ],
  });
  if (!v) return null;
  const who = String(v.who).trim();
  const until = typeof v.until === 'string' && v.until ? fromIso(v.until) : o.days ? addDays(today(), o.days) : null;
  const ok = await write('Ждём', (tx) => {
    o.also?.(tx);
    tx.setProperty(ref(m), 'WAITING_ON', who);
    tx.setProperty(ref(m), 'NEXT_REVIEW', until ? stampOf(until, namesOf(m)) : null);
    if (v.setWait && m.keyword !== W) tx.setStatus(ref(m), W);
  });
  return ok ? who : null;
}
/** «Кого или что ждём»: the earlier ones that fit what is typed, the most waited for first, with how many wait. */
function whoFits(q: string) {
  const t = q.trim().toLowerCase();
  return long.waitedFor
    .filter(([w]) => !t || w.toLowerCase().includes(t))
    .slice(0, 6)
    .map(([w, n]) => ({ value: w, hint: mattersWord(n) }));
}
/** The status to go back to: the one before waiting by the :LOGBOOK:, else the first open one of its set. */
export function statusAfterWaiting(m: Matter): string | null {
  const f = long.files.get(m.path);
  const h = headingOf(m);
  const W = long.settings.wait;
  if (!f || !h) return null;
  const before = statusBefore(f.text.split('\n'), h, W);
  if (before) return before;
  const set = f.info.sets.find((s) => s.states.some((x) => x.name === W));
  return set?.states.find((x) => !x.done && x.name !== W)?.name ?? f.info.open.find((x) => x !== W) ?? null;
}
export function stopWaiting(m: Matter) {
  const W = long.settings.wait;
  const back = m.keyword === W ? statusAfterWaiting(m) : undefined;
  return write('Больше не ждём', (tx) => {
    tx.setProperty(ref(m), 'WAITING_ON', null);
    if (back !== undefined) tx.setStatus(ref(m), back);
  });
}
// ---- «В бэклог» / «Из бэклога» (fix #315) -----------------------------------------------------------------------------
export const inBacklog = (m: Matter) => !!m.keyword && long.settings.backlog.includes(m.keyword);
/** «В бэклог»: the first status of the backlog. */
export function toBacklog(m: Matter) {
  const to = long.settings.backlog[0];
  if (to) return write('В бэклог', (tx) => tx.setStatus(ref(m), to));
}
/** «Из бэклога»: the status before it by the :LOGBOOK:, else the first open one of its set out of the backlog. */
export function fromBacklog(m: Matter) {
  const f = long.files.get(m.path);
  const h = headingOf(m);
  if (!f || !h || !m.keyword) return;
  const B = long.settings.backlog;
  const before = statusBefore(f.text.split('\n'), h, m.keyword);
  const set = f.info.sets.find((s) => s.states.some((x) => x.name === m.keyword));
  const back = (before && !B.includes(before) ? before : null) ?? set?.states.find((x) => !x.done && !B.includes(x.name))?.name ?? f.info.open.find((x) => !B.includes(x)) ?? null;
  return write('Из бэклога', (tx) => tx.setStatus(ref(m), back));
}

/** W: «Ждём…», or «Больше не ждём» while it waits. */
export const toggleWait = (m: Matter) => (m.waiting ? void stopWaiting(m) : void wait(m));
export { write, namesOf };

// ---- «Осмотрено», «Убрать из долгих дел» -----------------------------------------------------------------------------
export async function reviewed(m: Matter) {
  await long.ctx.index!.markReviewed(ref(m));
  long.soon(0);
}
export function removeLong(m: Matter) {
  const h = headingOf(m);
  if (!m.byTag || !h) return;
  const tag = m.byTag;
  void write('Убрать из долгих дел', (tx) => tx.setTags(ref(m), h.tags.filter((t) => t !== tag)));
}

// ---- the menu of a row ---------------------------------------------------------------------------------------------
export function rowMenu(m: Matter, at: At, under?: At) {
  long.ctx.ui.menu(
    [
      { label: 'Открыть', run: () => long.reveal(m) },
      { label: 'Открыть рядом', run: () => long.beside(m) },
      { label: 'Открыть в новой вкладке', run: () => long.newTab(m) },
      'sep',
      { label: 'Статус…', run: () => status(m, under) },
      { label: 'Проверить через…', run: () => void review(m, under ?? at) },
      m.waiting ? { label: 'Больше не ждём', run: () => void stopWaiting(m) } : { label: 'Ждём…', run: () => void wait(m) },
      { label: 'Осмотрено', run: () => void reviewed(m) },
      ...(inBacklog(m)
        ? [{ label: 'Из бэклога', run: () => void fromBacklog(m) }]
        : long.settings.backlog.length
          ? [{ label: 'В бэклог', hint: `статус ${long.settings.backlog[0]}`, run: () => void toBacklog(m) }]
          : []),
      'sep',
      m.byTag
        ? { label: 'Убрать из долгих дел', hint: `снимет тег :${m.byTag}:`, run: () => removeLong(m) }
        : { label: 'Убрать из долгих дел', disabled: true, hint: `Закройте дело или перенесите его из ${m.path}`, run: () => {} },
    ],
    at,
  );
}
