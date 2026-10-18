<script lang="ts">
  import { tick } from 'svelte';
  import { store } from '../store.svelte';
  import { FIXED_KEYS, type KeyCommand } from '../keys';
  import { KeyEditor, keysFocus } from '../keysEditor.svelte';
  import { setLayer } from '../settingsNav.svelte';
  import Group from './SetGroup.svelte';
  import Row from './SetRow.svelte';
  import Segments from './ui/Segments.svelte';
  import Button from './ui/Button.svelte';
  import ConfirmSheet from './ConfirmSheet.svelte';

  // «Настройки → Клавиши» of the new interface (ТЗ 54 §3, ТЗ 22 §2): over the groups the field «Команда или
  // сочетание», «Как в Emacs / Как в macOS», «Сбросить все»; a group says where its commands work; a row — the name,
  // the chord spelt out under it, the chips of its shortcuts on the right (Plex Mono 12, 24 pt on `field`, a changed
  // one's ring `lampline`; none — a dashed «Назначить»; «↺» at a changed one). A click on a chip records (its ring
  // `lamp`, «Нажмите сочетание…»); the hints are in the chips' tips. The logic is the shared KeyEditor.
  const ed = new KeyEditor();
  let confirmReset = $state(false);
  $effect(() => () => ed.dispose());
  $effect(() => setLayer('keys', !!(confirmReset || ed.pend)));
  $effect(() => () => setLayer('keys', false));
  const PRESETS: { value: 'emacs' | 'mac'; label: string }[] = [
    { value: 'emacs', label: 'Как в Emacs' },
    { value: 'mac', label: 'Как в macOS' },
  ];
  // «Клавиши» opened on a command (from «Мини-окно»): that row in sight, its first chip in focus
  $effect(() => {
    const id = keysFocus.id;
    if (!id) return;
    keysFocus.id = null;
    void tick().then(() => {
      const row = document.querySelector<HTMLElement>(`.row[data-id="${id}"]`);
      row?.scrollIntoView({ block: 'center' });
      row?.querySelector<HTMLElement>('.chip')?.focus();
    });
  });
  const chipTip = (c: KeyCommand) => (c.scope === 'global' ? 'Нажмите, чтобы записать новое · ⌫ при записи — убрать' : 'Нажмите, чтобы записать новое; можно аккорд · ⌫ при записи — убрать');
  // a click elsewhere stops the recording
  function down(e: MouseEvent) {
    if (ed.rec && !(e.target as Element).closest('.chip.rec')) ed.stop();
  }
  function searchKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && ed.q) {
      e.preventDefault();
      e.stopPropagation();
      ed.q = '';
    }
  }
</script>

<svelte:window onkeydowncapture={(e) => ed.key(e)} onmousedowncapture={down} />

<div class="tools">
  <label class="search">
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3.5 3.5" /></svg>
    <input bind:value={ed.q} placeholder="Команда или сочетание" aria-label="Команда или сочетание" spellcheck="false" autocomplete="off" onkeydown={searchKey} />
  </label>
  <Segments value={store.keyState.preset} options={PRESETS} label="Набор сочетаний" onchange={(v) => store.setPreset(v)} />
  <Button disabled={!ed.changed} title="Изменено: {ed.changed}" onclick={() => (confirmReset = true)}>Сбросить все</Button>
</div>

{#each ed.groups as g (g.id)}
  <Group caption={g.title} note={g.note}>
    {#each g.rows as c (c.id)}
      {@const ks = ed.keysOf(c.id)}
      {@const rec = ed.rec?.id === c.id ? ed.rec : null}
      {@const pend = ed.pend?.id === c.id ? ed.pend : null}
      {@const mod = ed.modified(c.id)}
      <Row label={c.title} hint={ed.sub(c) || undefined} changed={mod} dataId={c.id}>
        <span class="chips" role="group" aria-label="Сочетания: {c.title}">
          {#each ks as k, i (k)}
            {#if rec && rec.index === i}
              <button class="chip rec" aria-label="Запись сочетания" title={ed.recHint(c)}>{rec.first ? rec.first + ' …' : 'Нажмите сочетание…'}</button>
            {:else if pend && pend.index === i}
              <span class="chip bad">{pend.key}</span>
            {:else}
              <button class="chip" class:mod aria-label="Изменить сочетание {k}" title={chipTip(c)} onclick={() => ed.start(c.id, i)}>{k}</button>
            {/if}
          {/each}
          {#if rec && rec.index === null}
            <button class="chip rec" aria-label="Запись сочетания" title={ed.recHint(c)}>{rec.first ? rec.first + ' …' : 'Нажмите сочетание…'}</button>
          {:else if pend && pend.index === null}
            <span class="chip bad">{pend.key}</span>
          {:else if !ks.length}
            <button class="chip none" title={chipTip(c)} onclick={() => ed.start(c.id, null)}>Назначить</button>
          {/if}
          <!-- «+» has its place in every row, so the chips line up -->
          {#if ks.length && !rec && !pend && c.scope !== 'global'}
            <button class="add" aria-label="Добавить сочетание: {c.title}" title="Добавить сочетание" onclick={() => ed.start(c.id, null)}>+</button>
          {:else}<span class="slot"></span>{/if}
          {#if mod}
            <button class="undo" aria-label="Вернуть по умолчанию: {c.title}" title="Вернуть по умолчанию: {ed.defaults(c).join(', ') || 'без сочетания'}" onclick={() => ed.reset(c)}>↺</button>
          {/if}
        </span>
        {#snippet sub()}
          {#if pend}
            <div class="warn" role="alert">
              <span>{ed.warnText(pend)}</span>
              <Button small kind="main" onclick={() => ed.replace()}>Заменить</Button>
              <Button small onclick={() => (ed.pend = null)}>Отмена</Button>
            </div>
          {:else if rec}
            <div class="rhint">{ed.recHint(c)}</div>
          {/if}
          {#if ed.errors[c.id]}<div class="err" role="alert">{ed.errors[c.id]}</div>{/if}
        {/snippet}
      </Row>
    {/each}
  </Group>
{:else}
  <p class="empty">Ничего не найдено</p>
{/each}
{#if !ed.q.trim()}
  <Group caption="Не настраиваются">
    {#each FIXED_KEYS as f (f.title)}
      <Row label={f.title}><span class="fk">{f.keys}</span></Row>
    {/each}
  </Group>
{/if}

{#if confirmReset}
  <ConfirmSheet label="Сбросить сочетания" title="Вернуть все сочетания по умолчанию для набора «{ed.presetName}»?" onclose={() => (confirmReset = false)}
    actions={[{ label: 'Сбросить', kind: 'primary', run: () => void store.resetKeys() }]}>
    Изменено: {ed.changed}.
  </ConfirmSheet>
{/if}

<style>
  .tools { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
  .search { flex: 1 1 240px; height: 32px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 0 10px; border-radius: 8px; background: var(--field); box-shadow: inset 0 0 0 1px var(--rule); color: var(--ink3); }
  .search:focus-within { box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .search input { flex: 1; min-width: 0; padding: 0; border: 0; outline: none; background: none; color: var(--ink); font: 13px var(--ui); caret-color: var(--lamp); -webkit-user-select: text; user-select: text; }
  .chips { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 6px; }
  .chip { height: 24px; box-sizing: border-box; display: inline-flex; align-items: center; padding: 0 8px; border: 0; border-radius: 6px; background: var(--field); box-shadow: inset 0 0 0 1px var(--rule); color: var(--ink); font: 12px var(--mono); white-space: nowrap; }
  .chip.mod { box-shadow: inset 0 0 0 1px var(--lampline); }
  .chip.none { background: transparent; box-shadow: none; outline: 1px dashed var(--rule); outline-offset: -1px; color: var(--ink3); font-family: var(--ui); }
  .chip.rec { box-shadow: inset 0 0 0 1.5px var(--lamp), 0 0 0 3px var(--lampsoft); color: var(--lampink); font-family: var(--ui); }
  .chip.bad { box-shadow: inset 0 0 0 1px var(--wait); background: color-mix(in srgb, var(--wait) 14%, transparent); }
  .chip:focus-visible { outline: 2px solid var(--lampline); outline-offset: 1px; }
  .add { width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--ink3); font-size: 15px; opacity: 0; }
  :global(.row:hover) .add, .add:focus-visible { opacity: 1; }
  .add:hover { background: var(--chip); }
  .slot { flex: 0 0 24px; }
  .undo { width: 22px; height: 24px; padding: 0; border: 0; background: transparent; color: var(--ink3); font-size: 13px; }
  .undo:hover { color: var(--ink); }
  .warn { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--wait) 13%, transparent); font-size: 12px; }
  .warn span { flex: 1 1 260px; }
  .rhint { margin-top: 4px; font-size: 11.5px; color: var(--lampink); }
  .err { margin-top: 4px; font-size: 11.5px; color: var(--todo); }
  .fk { font: 12px var(--mono); color: var(--ink2); white-space: nowrap; }
  .empty { padding: 24px 0; text-align: center; color: var(--ink2); }
</style>
