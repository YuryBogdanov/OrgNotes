<script lang="ts">
  import { store } from './store.svelte';
  import { dayDiff, fmtDay, fmtLong, occurrences, repeaterLabel, toJs, toneFor, weekdayName } from './org';
  import { toneStyle } from './colors';

  type Item = {
    day: number; // days from today
    time: string; kw: string | null; tone: string; ev: boolean; pr: boolean;
    title: string; src: string; tags: string; mark: string; file: number; line: number; order: number;
  };

  const items = $derived.by(() => {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const horizon = new Date(from); horizon.setDate(horizon.getDate() + 30);
    const out: Item[] = [];
    store.files.forEach((f, fi) => {
      for (const h of f.headings) {
        const isOpen = !!h.keyword && f.wf.open.includes(h.keyword);
        const isEvent = !h.keyword && !!h.event;
        if (!isOpen && !isEvent) continue;
        const base = {
          kw: h.keyword, tone: h.keyword ? toneStyle(toneFor(h.keyword, f.wf)) : '', ev: isEvent, pr: h.priority === 'A',
          title: h.title, src: [f.name.replace(/\.org$/, ''), ...h.path].join(' › '), tags: h.tags.join(' '),
          file: fi, line: h.line,
        };
        const push = (d: Date, time: string, mark: string, order: number) =>
          out.push({ ...base, day: dayDiff(d, from), time, mark, order });
        if (h.event) {
          const rep = repeaterLabel(h.event.repeater);
          for (const d of occurrences(h.event, from, horizon)) push(d, h.event.time ?? '', rep || 'Событие', 1);
        }
        if (h.scheduled) {
          const base0 = toJs(h.scheduled);
          const overdue = dayDiff(base0, from);
          if (overdue < 0) push(base0, h.scheduled.time ?? '', `Запланировано ${fmtDay(base0)}`, 0);
          else if (base0 <= horizon) push(base0, h.scheduled.time ?? '', h.scheduled.repeater ? repeaterLabel(h.scheduled.repeater) : 'Запланировано', 1);
        }
        if (h.deadline) {
          const d = toJs(h.deadline);
          const n = dayDiff(d, from);
          if (n < 0) push(d, '', `Дедлайн ${fmtDay(d)}`, 0);
          else if (d <= horizon) push(d, '', `Дедлайн ${fmtDay(d)} · ${n === 0 ? 'сегодня' : `через ${n} дн.`}`, 2);
        }
      }
    });
    return out.sort((a, b) => a.day - b.day || a.order - b.order || a.time.localeCompare(b.time));
  });

  const groups = $derived.by(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    type G = { key: string; title: string; sub: string; tone: string; items: Item[] };
    const map = new Map<string, G>();
    for (const it of items) {
      const d = new Date(today); d.setDate(d.getDate() + it.day);
      let key: string, title: string, sub: string, tone = '--fg';
      if (it.day < 0) { key = 'over'; title = 'Просрочено'; sub = ''; tone = '--todo'; }
      else if (it.day === 0) { key = 'today'; title = 'Сегодня'; sub = fmtLong(d); }
      else if (it.day === 1) { key = 'd' + it.day; title = 'Завтра'; sub = fmtDay(d); }
      else if (it.day <= 7) { key = 'd' + it.day; title = weekdayName(d); sub = fmtDay(d); }
      else { key = 'later'; title = 'Позже'; sub = 'ближайшие 30 дней'; }
      if (!map.has(key)) map.set(key, { key, title, sub, tone, items: [] });
      map.get(key)!.items.push(it);
    }
    return [...map.values()];
  });

  const count = $derived(items.length);
</script>

<div class="agenda">
  <header>
    <div>
      <div class="h1">Агенда</div>
      <div class="sub">{count} записей · ближайшие 30 дней</div>
    </div>
  </header>
  <div class="scroll">
    {#each groups as g (g.key)}
      <div class="gh">
        <span class="gt" style="color:var({g.tone})">{g.title}</span>
        {#if g.sub}<span class="gs">{g.sub}</span>{/if}
        <span class="rule"></span>
        <span class="gs">{g.items.length}</span>
      </div>
      {#each g.items as it}
        <div class="item" role="button" tabindex="-1" onclick={() => store.open(it.file, it.line)} onkeydown={() => {}}>
          <span class="time">{it.time}</span>
          {#if it.kw}
            <span class="kw tone-chip" style={it.tone}>{it.kw}</span>
          {:else}
            <span class="kw ev">СОБ.</span>
          {/if}
          <div class="main">
            <span class="ttl">{#if it.pr}<b class="pr">[#A] </b>{/if}{it.title}</span>
            <span class="src">{it.src}</span>
          </div>
          {#if it.tags}<span class="tag">{it.tags}</span>{/if}
          <span class="mark" class:late={it.day < 0}>{it.mark}</span>
        </div>
      {/each}
    {/each}
  </div>
</div>

<style>
  .agenda { height: 100%; display: flex; flex-direction: column; min-width: 0; background: var(--bg); }
  header { padding: 18px 24px 14px; border-bottom: 1px solid var(--line); }
  .h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.01em; }
  .sub { color: var(--fg2); margin-top: 2px; }
  .scroll { flex: 1; overflow: auto; padding: 6px 14px 20px; }
  .gh { display: flex; align-items: baseline; gap: 10px; padding: 16px 10px 6px; }
  .gt { font-weight: 700; }
  .gs { font-size: 12px; color: var(--fg2); }
  .rule { flex: 1; height: 1px; background: var(--line); align-self: center; }
  .item { display: flex; align-items: center; gap: 12px; min-height: 46px; padding: 6px 10px; border-radius: 7px; }
  .item:hover { background: var(--sel); }
  .time { flex: 0 0 42px; font-size: 12px; color: var(--fg2); font-family: var(--mono); }
  .kw { flex: 0 0 52px; text-align: center; padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; }
  .kw.ev { color: var(--fg2); background: var(--field); }
  .main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .ttl { font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pr { color: var(--wait); }
  .src { font-size: 11.5px; color: var(--fg2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag { font-size: 11.5px; color: var(--tagfg); background: var(--tagbg); padding: 1px 8px; border-radius: 9px; }
  .mark { flex: 0 0 170px; text-align: right; font-size: 12px; color: var(--fg2); }
  .mark.late { color: var(--todo); }
</style>
