import { store } from './store.svelte';
import { newMeeting, type OneOnOne } from './oneOnOne';
import { plugins } from './api/host.svelte';

// The workings of «1-1 сегодня» (ТЗ 32 §2), out of TodayMeetings.svelte so the old card and the new one (ТЗ 45 §2.3)
// are one: what the plugins add to a meeting (a line, an action like «Разбор целей»), and today's meeting — opened,
// or made under the 1-1 heading.

export type Extra = { line: string | null; action: { label: string; run: () => void } | null };

export class MeetingsCtl {
  readonly extras = $state<Record<string, Extra[]>>({});
  constructor(private p: () => { meetings: OneOnOne[]; day: Date; onopen: (path: string, line: number) => void }) {}

  effects() {
    $effect(() => {
      const specs = [...plugins.oneOnOnes.entries()];
      for (const m of this.p().meetings) {
        const file = m.file;
        void Promise.all(
          specs.map(async ([pid, s]) => ({
            line: s.line ? await Promise.resolve(plugins.guard(pid, () => s.line!(file), null)).catch(() => null) : null,
            action: s.action && (await Promise.resolve(plugins.guard(pid, () => s.action!.available?.(file) ?? true, false)).catch(() => false))
              ? { label: s.action.label, run: () => plugins.guard(pid, () => s.action!.run(file), undefined) } : null,
          })),
        ).then((r) => (this.extras[m.key] = r));
      }
    });
  }
  /** «Новая встреча»: today's opened, else made under the 1-1 heading and opened. */
  async meeting(m: OneOnOne) {
    const { day, onopen } = this.p();
    if (m.today !== null) return onopen(m.path, m.today + 1);
    let at = -1;
    const step = await store.transaction('Новая встреча', (tx) =>
      tx.update(m.path, (text) => {
        const f = store.agendaFiles.find((x) => x.path === m.path);
        const r = f ? newMeeting(text, f.headings, m.line, day) : null;
        if (r) at = r.line;
        return r?.text ?? null;
      }),
    );
    if (step && at >= 0) onopen(m.path, at);
  }
}
