<script lang="ts">
  import { plugins } from '../api/host.svelte';
  import { fileOf, findHeading, infoOf } from '../api/refs';
  import { displayName } from '../names';
  import { nextPrefs } from '../nextPrefs.svelte';
  import { fileReview } from './fileReview.svelte';
  import { TONE } from './reviewTones';

  // «Очередь» in place of «Структура» while a review in the file is shown (ТЗ 41 §1.2, ТЗ 46 §4): its head and the
  // number; the cards grouped by their files in the queue's order (a group's label — the file's name, 10.5 pt `ink3`;
  // none when all are in one file); a row — a dot of the outcome's colour, the title, right of it the outcome's words,
  // or what the plugin says of a card not done yet (`header`); the current one — the lamp's dot with a halo, bold; the
  // handled ones (but the skipped) at 55%, the done ones struck. A click goes to that card. It folds as «Структура».
  const r = $derived(fileReview.run);
  const rows = $derived.by(() => {
    if (!r) return [];
    void r.done;
    void plugins.reviewRedraw;
    return r.refs.map((ref, i) => {
      const mark = plugins.reviewMark(i);
      const f = fileOf(ref.path);
      const h = f ? findHeading(f.headings, ref) : undefined;
      // not handled yet: what the plugin says of it (`queueNote`, red when late; else `header`)
      const q = !mark && h && f && r.spec.queueNote ? plugins.guard(r.plugin, () => r.spec.queueNote!(infoOf(f, h)), null) : null;
      const note = mark?.text ?? (q?.text ?? (!mark && h && f && r.spec.header ? plugins.guard(r.plugin, () => r.spec.header!(infoOf(f, h)), '') : ''));
      const handled = !!mark || r.doneAt.has(i);
      return { i, ref, mark, note: String(note ?? ''), late: !!q?.late, handled, file: ref.path };
    });
  });
  const files = $derived(new Set(rows.map((x) => x.file)).size);
  const plain = (t: string) => t.replace(/\[\[(?:[^\]]*\]\[)?([^\]]*)\]\]/g, '$1');
  const dot = (x: (typeof rows)[number]) => (x.mark ? TONE[x.mark.tone] : x.handled ? 'var(--done)' : 'var(--ink3)');
</script>

<button class="lbl head" aria-expanded={!nextPrefs.structFolded} onclick={() => nextPrefs.toggleStructFolded()}>Очередь<span class="n">{rows.length}</span><span class="chev" aria-hidden="true">{nextPrefs.structFolded ? '›' : '⌄'}</span></button>
{#if !nextPrefs.structFolded && r}
  <div class="list" role="group" aria-label="Очередь разбора">
    {#each rows as x (x.i)}
      {#if files > 1 && (x.i === 0 || rows[x.i - 1].file !== x.file)}<div class="grp">{displayName(x.file).split('/').pop()}</div>{/if}
      <button class="row" class:on={x.i === r.cur} class:faded={x.handled && x.mark?.tone !== 'skip' && x.i !== r.cur} class:struck={x.mark?.tone === 'done'}
        aria-current={x.i === r.cur ? 'true' : undefined} title={plain(x.ref.title)} onclick={() => plugins.reviewShow(r, x.i)}>
        <span class="dot" style:background={x.i === r.cur ? undefined : dot(x)}></span>
        <span class="t">{plain(x.ref.title)}</span>
        {#if x.note}<span class="note" class:skip={x.mark?.tone === 'skip' || x.mark?.tone === 'wait'} class:late={x.late}>{x.note}</span>{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  /* over the editor in «Структура»'s column: its own parts take the pointer (the column's rule is scoped to it) */
  .head, .list { pointer-events: auto; }
  .lbl { padding-left: 22px; margin-bottom: 12px; font-size: 11px; font-weight: 600; color: var(--ink3); }
  .head { display: flex; align-items: center; gap: 6px; width: 100%; padding-top: 0; padding-bottom: 0; padding-right: 2px; border: 0; background: none; text-align: left; font-family: var(--ui); cursor: default; }
  .head:focus-visible { outline: 2px solid var(--lamp); outline-offset: 2px; border-radius: 4px; }
  .head .n { font-weight: 400; color: var(--ink3); }
  .head .chev { margin-left: auto; font-size: 10px; }
  .list { position: relative; min-height: 0; overflow: auto; padding-left: 22px; scrollbar-width: none; }
  .list::-webkit-scrollbar { display: none; }
  .list::before { content: ''; position: absolute; left: 5px; top: 6px; bottom: 6px; width: 1px; background: var(--rule); }
  .grp { margin: 8px 0 2px; font-size: 10.5px; color: var(--ink3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .grp:first-child { margin-top: 0; }
  .row { position: relative; width: 100%; height: 26px; display: flex; align-items: center; gap: 8px; padding: 0; border: 0; background: none; color: var(--ink2); font: 12.5px var(--ui); text-align: left; white-space: nowrap; cursor: default; }
  .row:hover .t { color: var(--ink); }
  .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .note { flex: 0 0 auto; max-width: 45%; overflow: hidden; text-overflow: ellipsis; font-size: 11px; font-weight: 400; color: var(--ink3); }
  .note.skip { color: var(--wait); }
  .note.late { color: var(--todo); font-weight: 600; }
  .dot { position: absolute; left: -20px; width: 7px; height: 7px; border-radius: 4px; }
  .row.faded { opacity: 0.55; }
  .row.struck .t { text-decoration: line-through; }
  .row.on { color: var(--ink); font-weight: 600; }
  .row.on .dot { left: -21px; width: 9px; height: 9px; border-radius: 5px; background: var(--lamp); box-shadow: 0 0 0 4px var(--lampsoft); }
  .row:focus-visible { outline: 2px solid var(--lamp); outline-offset: 1px; }
</style>
