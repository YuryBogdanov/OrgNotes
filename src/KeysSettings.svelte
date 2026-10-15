<script lang="ts">
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { store, DEFAULT_CAPTURE_KEY } from './store.svelte';
  import {
    FIXED_KEYS, GROUPS, KEY_COMMANDS, chordNote, commandById, conflictsOf, defaultsOf, isChord, isModified, matchesQuery, modifiedCount,
    outerNote, parsePress, pressOf, refusal, type Conflict, type KeyCommand,
  } from './keys';

  // «Клавиши»: every command with its shortcuts, by groups. A click on a chip records a new one (⌃ waits a second
  // for the second press of a chord), «+» adds another, ↺ gives the default back. A shortcut another command has
  // where both work asks before it is moved.

  let q = $state('');
  let sel = $state<string | null>(null); // the row in focus: its «+» shows
  // recording: which command, which of its shortcuts (null: a new one), the first press of a chord
  let rec = $state<{ id: string; index: number | null; first?: string } | null>(null);
  let chordTimer: ReturnType<typeof setTimeout> | undefined;
  let pend = $state<{ id: string; index: number | null; key: string; conflicts: Conflict[] } | null>(null);
  let errors = $state<Record<string, string>>({});
  let confirmReset = $state(false);

  const keysOf = (id: string) => store.bindings.get(id) ?? [];
  const captureModified = $derived(store.captureKey !== DEFAULT_CAPTURE_KEY);
  const modified = (id: string) => (id === 'capture' ? captureModified : isModified(store.keyState, id));
  const changed = $derived(modifiedCount(store.keyState) + (captureModified ? 1 : 0));
  const defaults = (c: KeyCommand) => (c.id === 'capture' ? ['⇧⌘I'] : defaultsOf(c, store.keyState.preset));
  const presetName = $derived(store.keyState.preset === 'emacs' ? 'Как в Emacs' : 'Как в macOS');

  const groups = $derived(
    GROUPS.map((g) => ({ ...g, rows: KEY_COMMANDS.filter((c) => c.group === g.id && matchesQuery(c, keysOf(c.id), q)) })).filter((g) => g.rows.length),
  );
  function sub(c: KeyCommand): string {
    const ks = keysOf(c.id);
    const chord = ks.find(isChord);
    const parts = [chord ? chordNote(chord) : '', outerNote(store.bindings, c.id), c.note ?? ''];
    if (c.id === 'capture' && !store.captureGlobal) parts.push('Только в окне: «Работает из любой программы» выключено в разделе Inbox');
    return parts.filter(Boolean).join(' · ');
  }

  // ---- recording -----------------------------------------------------------------------------------------------
  function start(id: string, index: number | null) {
    pend = null;
    delete errors[id];
    rec = { id, index };
    store.keyRecording = true;
  }
  function stop() {
    clearTimeout(chordTimer);
    rec = null;
    store.keyRecording = false;
  }
  $effect(() => () => {
    clearTimeout(chordTimer);
    store.keyRecording = false;
  });
  async function put(id: string, index: number | null, key: string) {
    const list = [...keysOf(id)];
    if (index === null) list.push(key);
    else list[index] = key;
    const err = await store.setKeys(id, list.filter(Boolean));
    if (err) errors[id] = /registered|taken|exist|занят/i.test(err) ? 'Занято другой программой' : err;
    else delete errors[id];
  }
  function finish(key: string) {
    const r = rec;
    stop();
    if (!r) return;
    const own = keysOf(r.id);
    if (own.includes(key) && own.indexOf(key) !== r.index) return; // it has it already
    const conflicts = conflictsOf(store.bindings, r.id, key);
    if (conflicts.length) pend = { id: r.id, index: r.index, key, conflicts };
    else void put(r.id, r.index, key);
  }
  function recKey(e: KeyboardEvent) {
    if (!rec) return;
    e.preventDefault();
    e.stopPropagation();
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return; // a modifier alone: wait for the key
    const bare = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
    const r = rec;
    if (bare && e.key === 'Escape') return stop();
    if (bare && e.key === 'Backspace' && !r.first) {
      stop();
      if (r.index !== null) void store.setKeys(r.id, keysOf(r.id).filter((_, i) => i !== r.index)).then((err) => err && (errors[r.id] = err));
      return;
    }
    const press = pressOf(e);
    if (!press) return;
    if (r.first) return finish(r.first + ' ' + press);
    const c = commandById.get(r.id)!;
    const why = refusal(press, c.scope);
    if (why) {
      errors[r.id] = why;
      return;
    }
    delete errors[r.id];
    // a press with ⌃ may begin a chord: a second press within a second makes one (not for the system's shortcut)
    if (parsePress(press)!.ctrl && c.scope !== 'global') {
      rec = { ...r, first: press };
      clearTimeout(chordTimer);
      chordTimer = setTimeout(() => finish(press), 1000);
      return;
    }
    finish(press);
  }
  async function replace() {
    const p = pend;
    pend = null;
    if (!p) return;
    for (const c of p.conflicts) await store.setKeys(c.id, keysOf(c.id).filter((k) => k !== c.key));
    await put(p.id, p.index, p.key);
  }
  async function reset(c: KeyCommand) {
    pend = null;
    const err = await store.setKeys(c.id, defaults(c));
    if (err) errors[c.id] = 'Занято другой программой';
    else delete errors[c.id];
  }
  /** «⌘E уже назначено команде „Искать выделенное“ (Поиск). Назначить здесь и снять там?» */
  function warnText(p: { key: string; conflicts: Conflict[] }) {
    const names = p.conflicts.map((x) => {
      const c = commandById.get(x.id)!;
      const g = GROUPS.find((gr) => gr.id === c.group)!.title;
      const where = g.charAt(0) + g.slice(1).toLowerCase();
      return `«${c.title}» (${where}${x.key !== p.key ? `, ${x.key}` : ''})`;
    });
    const who = names.length > 1 ? `командам ${names.join(', ')}` : `команде ${names[0]}`;
    const same = p.conflicts.every((x) => x.key === p.key);
    return `${p.key} ${same ? 'уже назначено' : 'пересекается с аккордом, назначенным'} ${who}. Назначить здесь и снять там?`;
  }
  function rowKey(e: KeyboardEvent, c: KeyCommand) {
    if (e.key === 'Enter' && e.target === e.currentTarget) {
      e.preventDefault();
      start(c.id, keysOf(c.id).length ? 0 : null);
    }
  }
  // a click elsewhere stops the recording
  function down(e: MouseEvent) {
    if (rec && !(e.target as Element).closest('.chip.rec')) stop();
  }

  function searchKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && q) {
      e.preventDefault();
      e.stopPropagation();
      q = '';
    }
  }
</script>

<svelte:window onkeydowncapture={recKey} onmousedowncapture={down} />

<section class="keys" aria-label="Клавиши">
  <div class="tools">
    <label class="search">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></svg>
      <input bind:value={q} placeholder="Команда или сочетание" aria-label="Команда или сочетание" spellcheck="false" autocomplete="off" onkeydown={searchKey} />
    </label>
    <div class="preset" role="radiogroup" aria-label="Набор сочетаний">
      <span>Набор</span>
      <div class="segs">
        <button role="radio" aria-checked={store.keyState.preset === 'emacs'} class:on={store.keyState.preset === 'emacs'} onclick={() => store.setPreset('emacs')}>Как в Emacs</button>
        <button role="radio" aria-checked={store.keyState.preset === 'mac'} class:on={store.keyState.preset === 'mac'} onclick={() => store.setPreset('mac')}>Как в macOS</button>
      </div>
    </div>
    <button class="plain" disabled={!changed} onclick={() => (confirmReset = true)}>Сбросить все</button>
  </div>
  <div class="info">
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M10 9v5M10 6.5v.01" /></svg>
    <span>Нажмите на сочетание, чтобы записать новое. У команды может быть несколько сочетаний. Изменённые отмечены точкой; ↺ возвращает сочетание по умолчанию. Изменено: {changed}.</span>
  </div>

  {#each groups as g (g.id)}
    <div class="group">
      <div class="gh"><span class="gt">{g.title}</span>{#if g.note}<span class="gn">{g.note}</span>{/if}</div>
      <div class="card" role="list" aria-label={g.title}>
        {#each g.rows as c (c.id)}
          {@const ks = keysOf(c.id)}
          {@const recHere = rec?.id === c.id}
          {@const pendHere = pend?.id === c.id}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
          <div class="row" class:sel={sel === c.id} class:open={recHere || pendHere} role="listitem" tabindex="0" data-cmd={c.id}
            aria-label="{c.title}: {ks.join(', ') || 'без сочетания'}{modified(c.id) ? ', изменено' : ''}"
            onfocusin={() => (sel = c.id)} onmouseenter={() => (sel = c.id)} onkeydown={(e) => rowKey(e, c)}>
            <div class="line">
              <span class="dot" class:on={modified(c.id)} aria-hidden="true"></span>
              <div class="name">
                <span>{c.title}</span>
                {#if sub(c)}<span class="sub">{sub(c)}</span>{/if}
              </div>
              <span class="chips">
                {#each ks as k, i (k)}
                  {#if recHere && rec?.index === i}
                    <button class="chip rec" aria-label="Запись сочетания">{rec?.first ? rec.first + ' …' : 'Нажмите сочетание…'}</button>
                  {:else if pendHere && pend?.index === i}
                    <span class="chip bad">{pend?.key}</span>
                  {:else}
                    <button class="chip" aria-label="Изменить сочетание {k}" onclick={() => start(c.id, i)}>{k}</button>
                  {/if}
                {/each}
                {#if recHere && rec?.index === null}
                  <button class="chip rec" aria-label="Запись сочетания">{rec?.first ? rec.first + ' …' : 'Нажмите сочетание…'}</button>
                {:else if pendHere && pend?.index === null}
                  <span class="chip bad">{pend?.key}</span>
                {:else if !ks.length}
                  <button class="chip none" onclick={() => start(c.id, null)}>Назначить</button>
                {/if}
                <!-- the «+» and ↺ have their places in every row, so the chips line up -->
                {#if ks.length && c.scope !== 'global'}
                  <button class="add" aria-label="Добавить сочетание: {c.title}" title="Добавить сочетание" onclick={() => start(c.id, null)}>+</button>
                {:else}<span class="slot"></span>{/if}
                {#if modified(c.id)}
                  <button class="undo" aria-label="Вернуть по умолчанию: {c.title}" title="Вернуть по умолчанию: {defaults(c).join(', ') || 'без сочетания'}" onclick={() => reset(c)}>
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9a6 6 0 1 1 1.8 4.3M4 4v5h5" /></svg>
                  </button>
                {:else}<span class="slot"></span>{/if}
              </span>
            </div>
            {#if pendHere && pend}
              <div class="warn" role="alert">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--wait)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3l8 14H2zM10 8v4M10 14.5v.01" /></svg>
                <span>{warnText(pend)}</span>
                <button class="pri" onclick={replace}>Заменить</button>
                <button class="plain" onclick={() => (pend = null)}>Отмена</button>
              </div>
            {:else if recHere}
              <div class="hint">{rec?.first ? `${rec.first}, затем… — нажмите вторую клавишу аккорда` : c.scope === 'global' ? 'Нажмите сочетание · ⎋ отмена · ⌫ убрать сочетание' : 'Нажмите сочетание · можно аккорд, например ⌃C, затем S · ⎋ отмена · ⌫ убрать сочетание'}</div>
            {/if}
            {#if errors[c.id]}<div class="hint err" role="alert">{errors[c.id]}</div>{/if}
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <p class="empty">Ничего не найдено</p>
  {/each}

  {#if !q.trim()}
    <details class="fixed">
      <summary>НЕ НАСТРАИВАЮТСЯ</summary>
      <div class="card">
        {#each FIXED_KEYS as f (f.title)}
          <div class="frow"><span>{f.title}</span><span class="fk">{f.keys}</span></div>
        {/each}
      </div>
    </details>
  {/if}
</section>

{#if confirmReset}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <ConfirmDialog label="Сбросить сочетания" title="Вернуть все сочетания по умолчанию для набора «{presetName}»?" onclose={() => (confirmReset = false)} actions={[{ label: 'Сбросить', kind: 'primary', run: () => void store.resetKeys() }]}>
    Изменено: {changed}.
  </ConfirmDialog>
{/if}

<style>
  .keys { display: flex; flex-direction: column; gap: 20px; }
  .tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .search { flex: 1 1 260px; display: flex; align-items: center; gap: 7px; height: 30px; box-sizing: border-box; padding: 0 9px; background: var(--side); border: 1px solid var(--line); border-radius: 7px; color: var(--fg3); }
  .search:focus-within { border-color: var(--acc); }
  .search input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: var(--fg); font-size: 13px; padding: 0; -webkit-user-select: text; user-select: text; }
  .preset { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--fg2); }
  .segs { display: flex; padding: 2px; background: var(--field); border-radius: 8px; gap: 2px; }
  .segs button { height: 24px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--fg2); font-size: 12.5px; }
  .segs button.on { background: var(--segon); color: var(--fg); box-shadow: var(--shadow); font-weight: 600; }
  .plain { height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font-size: 12.5px; }
  .plain:disabled { opacity: 0.45; }
  .info { display: flex; align-items: center; gap: 8px; margin-top: -8px; padding: 8px 12px; border-radius: 8px; background: var(--side); font-size: 12px; color: var(--fg2); line-height: 1.45; }
  .info svg { flex: 0 0 14px; }
  .group { display: flex; flex-direction: column; gap: 8px; }
  .gh { display: flex; align-items: baseline; gap: 8px; padding: 0 4px; }
  .gt { font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; }
  .gn { font-size: 11px; color: var(--fg3); }
  .card { background: var(--side); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .row { outline: none; }
  .row + .row { border-top: 1px solid var(--line); }
  .row.open { background: var(--bg); }
  .row:focus-visible { box-shadow: inset 0 0 0 2px var(--acc); }
  .line { display: flex; align-items: center; gap: 12px; min-height: 42px; box-sizing: border-box; padding: 6px 12px 6px 14px; }
  .dot { flex: 0 0 6px; width: 6px; height: 6px; border-radius: 3px; }
  .dot.on { background: var(--acc); }
  .name { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; font-size: 13px; }
  .sub { font-size: 11.5px; color: var(--fg2); }
  .chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .chip { height: 24px; box-sizing: border-box; display: inline-flex; align-items: center; padding: 0 9px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font-family: var(--mono); font-size: 12px; white-space: nowrap; }
  .chip:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
  .chip.none { color: var(--fg3); font-family: inherit; }
  .chip.rec { border-color: var(--acc); color: var(--acc); font-family: inherit; box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 25%, transparent); }
  .chip.bad { border-color: var(--wait); background: color-mix(in srgb, var(--wait) 14%, transparent); }
  .slot { flex: 0 0 24px; }
  .add, .undo { width: 24px; height: 24px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; color: var(--fg2); }
  .add { border: 1px dashed var(--line); background: transparent; visibility: hidden; }
  .row.sel .add, .add:focus-visible { visibility: visible; }
  .row.open .add { visibility: hidden; }
  .undo { border: 0; background: transparent; }
  .undo:hover, .add:hover { background: var(--field); }
  .warn { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0 12px 10px 32px; padding: 8px 10px; border-radius: 7px; background: color-mix(in srgb, var(--wait) 13%, transparent); font-size: 12px; }
  .warn span { flex: 1 1 260px; }
  .warn button { height: 24px; padding: 0 10px; font-size: 12px; }
  .pri { border: 0; border-radius: 6px; background: var(--acc); color: var(--onacc); font-weight: 600; }
  .hint { margin: 0 12px 10px 32px; font-size: 11.5px; color: var(--fg2); }
  .hint.err { color: var(--todo); }
  .empty { color: var(--fg2); text-align: center; padding: 24px 0; }
  .fixed summary { font-size: 11px; font-weight: 600; color: var(--fg2); letter-spacing: 0.02em; padding: 0 4px 8px; cursor: default; }
  .frow { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 36px; padding: 6px 14px 6px 32px; font-size: 13px; }
  .frow + .frow { border-top: 1px solid var(--line); }
  .fk { font-family: var(--mono); font-size: 12px; color: var(--fg2); white-space: nowrap; }
</style>
