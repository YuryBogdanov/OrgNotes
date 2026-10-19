<script lang="ts">
  import { PALETTE, colorName, toneOf, toneStyle } from '../colors';
  import { MAX_KEYWORD, displayName, orgLine, type DraftState } from '../workflowEditor';
  import { StatusEditor } from '../statusesEditor.svelte';
  import { setLayer } from '../settingsNav.svelte';
  import type { MenuItem } from '../menuItems';
  import Group from './SetGroup.svelte';
  import Row from './SetRow.svelte';
  import Toggle from './ui/Toggle.svelte';
  import Button from './ui/Button.svelte';
  import Menu from './ui/Menu.svelte';
  import ConfirmSheet from './ConfirmSheet.svelte';

  // «Настройки → Статусы» of the new interface (ТЗ 54 §3, ТЗ 22 §3): two columns. On the left «Наборы» — rows of 44
  // (the name, the keywords under it), dragged to reorder, «+ Набор». On the right the set's name and «Удалить набор»;
  // «В работе» and «Завершённые» — rows of 40: the grip, the colour (a menu of the named ones), the capsule, the
  // keyword in the file, its key, «новая задача» (a click by another makes it the new one), ×; «+ Состояние»; then
  // «В файле» — the line `#+TODO:`, and the behaviour. The logic is the shared StatusEditor.
  const ed = new StatusEditor();
  ed.effects();
  const wf = $derived(ed.wf);

  // the colour: a menu of the named ones, «Авто» first
  let colors = $state<{ s: DraftState; x: number; y: number } | null>(null);
  $effect(() => setLayer('statusColor', !!colors));
  $effect(() => () => setLayer('statusColor', false));
  const colorItems = (s: DraftState): MenuItem[] => [
    { label: 'Авто', checked: !s.color, action: () => (s.color = '') },
    'sep',
    ...PALETTE.map((p): MenuItem => ({ label: p.name, checked: s.color === p.id, capsule: toneStyle(toneOf(p.id)!), action: () => (s.color = p.id) })),
  ];
  function openColors(e: MouseEvent, s: DraftState) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    colors = { s, x: r.left, y: r.bottom + 4 };
  }
  const keywordsOf = (w: (typeof ed.draft.workflows)[number]) => w.states.filter((s) => !s.pending && s.keyword).map((s) => displayName(s.keyword)).join(' · ');
</script>

{#snippet stateRow(s: DraftState)}
  {@const kw = ed.valueOf(s)}
  {@const isNew = !s.done && ed.initial?.id === s.id}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="srow" class:over={ed.rowDrag.overId === s.id} class:bad={!!ed.errors[s.id]} role="group" tabindex="-1" data-row={s.id}
    aria-label="{displayName(s.keyword) || 'Новое состояние'}. Option со стрелками вверх и вниз меняет порядок" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
    onkeydown={(e) => ed.rowKey(e, s)} use:ed.rowDrag.zone={s.id}>
    <span class="grip" role="img" aria-label="Перетащить строку" use:ed.rowDrag.handle={{ id: s.id, image: '.srow' }}>⋮⋮</span>
    <button class="sw" aria-label="Цвет: {s.color ? colorName(s.color) : 'авто'}. Изменить" aria-haspopup="menu" onclick={(e) => openColors(e, s)}><span class="dot tone-bg" style={ed.chipStyle(s)}></span></button>
    <span class="cell">{#if kw}<span class="cap tone-chip" style={ed.chipStyle(s)}>{displayName(kw)}</span>{:else}<span class="none">—</span>{/if}</span>
    <input class="kw" class:red={!!ed.errors[s.id]} aria-label="Ключевое слово в файле" aria-invalid={!!ed.errors[s.id]} placeholder="например, REVIEW" maxlength={MAX_KEYWORD + 8}
      spellcheck="false" autocomplete="off" use:ed.track={s.id} value={kw}
      oninput={(e) => ed.typing(s, e.currentTarget.value)} onkeydown={(e) => ed.keydown(e, s)} onblur={() => ed.blur(s)} onfocus={() => ed.focused(s)} />
    <input class="qk" class:auto={!s.key && ed.keyEdits[s.id] === undefined} class:red={!!ed.errors['k' + s.id]} aria-label="Клавиша" aria-invalid={!!ed.errors['k' + s.id]}
      spellcheck="false" autocomplete="off" disabled={s.pending} value={ed.keyShown(s)} onfocus={(e) => e.currentTarget.select()} onmouseup={(e) => { e.preventDefault(); e.currentTarget.select(); }}
      oninput={(e) => { ed.typingKey(s, (e instanceof InputEvent ? e.data : null) || e.currentTarget.value); e.currentTarget.value = ed.keyEdits[s.id] ?? ''; }} onkeydown={(e) => ed.keyKeydown(e, s)} onblur={() => ed.keyBlur(s)} />
    {#if s.done}<span class="newc"></span>
    {:else if isNew}<span class="newc on">новая задача</span>
    {:else}<button class="newc mk" disabled={s.pending} title="Сделать состоянием новой задачи" onclick={() => wf && (wf.initialId = s.id)}>сделать новой</button>{/if}
    <button class="x" aria-label="Удалить состояние {displayName(s.keyword)}" disabled={!ed.canRemove(s)} title={ed.canRemove(s) ? '' : 'Последнее открытое состояние удалить нельзя'} onclick={() => ed.askDelete(s)}>×</button>
  </div>
  {#if ed.errors['k' + s.id]}<div class="hint err">{ed.errors['k' + s.id]}</div>
  {:else if ed.errors[s.id]}<div class="hint err">{ed.errors[s.id]}</div>
  {:else if s.pending}<div class="hint">Введите ключевое слово и нажмите ↩ · ⎋ — отмена</div>{/if}
  {#each ed.problems.filter((p) => p.state === s.id) as p (p.message)}<div class="hint err">{p.message}</div>{/each}
{/snippet}

<div class="cols">
  <div class="sets">
    <div class="lab">Наборы</div>
    <div class="scard" role="listbox" aria-label="Наборы статусов">
      {#each ed.draft.workflows as w (w.id)}
        <div class="wfrow" class:over={ed.wfDrag.overId === w.id} use:ed.wfDrag.zone={w.id}>
          <button class="set" class:on={w.id === wf?.id} role="option" aria-selected={w.id === wf?.id} onclick={() => (ed.selectedId = w.id)} use:ed.wfDrag.handle={{ id: w.id }}>
            <span class="sn">{w.name || '—'}</span><span class="sk">{keywordsOf(w)}</span>
          </button>
        </div>
      {/each}
      <div class="wfend" class:over={ed.wfDrag.overId === 'end'} use:ed.wfDrag.zone={'end'}></div>
      <button class="addset" onclick={ed.addSet}>+ Набор</button>
    </div>
    <div class="fine">Первый набор — по умолчанию; порядок — перетаскиванием. На заголовке наборы переключают ⌃⇧← и ⌃⇧→.</div>
  </div>

  {#if wf}
    <div class="main">
      <div class="head">
        <input class="wname" aria-label="Название набора" value={wf.name} oninput={(e) => (wf.name = e.currentTarget.value)} spellcheck="false" />
        <Button kind="danger" disabled={!ed.canRemoveSet} title={ed.canRemoveSet ? '' : 'Единственный набор удалить нельзя'} onclick={ed.deleteWorkflow}>
          {ed.confirmWf ? `Удалить (в заметках: ${ed.wfUsed})?` : 'Удалить набор'}
        </Button>
      </div>
      {#each ed.problems.filter((p) => p.workflow === wf.id && !p.state) as p (p.message)}<div class="err">{p.message}</div>{/each}

      <Group caption="В работе" note="цвет · ключевое слово в файле · клавиша · ⌥↑↓ — порядок" label="Состояния в работе">
        {#each ed.openStates as s (s.id)}{@render stateRow(s)}{/each}
        <div class="addrow" class:over={ed.rowDrag.overId === 'separator'} use:ed.rowDrag.zone={'separator'}><button onclick={() => ed.plus(false)}>+ Состояние</button></div>
      </Group>
      <Group caption="Завершённые" note="после «|» в строке Org" label="Завершённые состояния">
        {#each ed.doneStates as s (s.id)}{@render stateRow(s)}{/each}
        <div class="addrow" class:over={ed.rowDrag.overId === 'end'} use:ed.rowDrag.zone={'end'}><button onclick={() => ed.plus(true)}>+ Состояние</button></div>
      </Group>
      <div class="infile" aria-label="Строка #+TODO"><span class="lbl">В файле</span><span class="org">{orgLine(wf)}</span></div>

      <Group caption="Поведение" note="для всех наборов">
        <Row label="Записывать время закрытия" hint="CLOSED: при завершении задачи" id="st-closed">
          <Toggle checked={ed.draft.behavior.closed} labelledby="st-closed" onchange={() => (ed.draft.behavior.closed = !ed.draft.behavior.closed)} />
        </Row>
        <Row label="Вести историю смены состояний" hint="В ящике :LOGBOOK:" id="st-log">
          <Toggle checked={ed.draft.behavior.logbook} labelledby="st-log" onchange={() => (ed.draft.behavior.logbook = !ed.draft.behavior.logbook)} />
        </Row>
      </Group>
      {#if ed.bannerCount}<div class="err banner" role="alert">Изменения не сохраняются, пока есть ошибки ({ed.bannerCount}).</div>{/if}
    </div>
  {/if}
</div>

{#if colors}<Menu x={colors.x} y={colors.y} width={200} items={colorItems(colors.s)} label="Цвет статуса" onclose={() => (colors = null)} />{/if}
{#if ed.rename}
  {@const r = ed.rename}
  <ConfirmSheet label="Переименование статуса" title="Заменить {r.from} на {r.to} в {r.count} заголовках?" onclose={() => ed.rename && ed.chooseRename('cancel')}
    actions={[{ label: 'Только в настройках', run: () => ed.chooseRename('settings') }, { label: 'Заменить в файлах', kind: 'primary', run: () => ed.chooseRename('files') }]}>
    Если оставить слово в заметках как есть, эти заголовки перестанут считаться задачами со статусом.
  </ConfirmSheet>
{/if}
{#if ed.confirmDelete}
  {@const c = ed.confirmDelete}
  <ConfirmSheet label="Удаление статуса" title="{c.s.keyword} используется в {c.count} заголовках" onclose={() => (ed.confirmDelete = null)} actions={[{ label: 'Удалить', kind: 'danger', run: ed.doDelete }]}>
    Файлы не изменятся: слово останется в тексте, но перестанет считаться статусом.
  </ConfirmSheet>
{/if}

<style>
  .cols { display: flex; gap: 20px; align-items: flex-start; }
  .sets { flex: 0 0 220px; width: 220px; }
  .lab, .lbl { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink3); }
  .lab { margin: 0 4px 6px; }
  .scard { display: flex; flex-direction: column; gap: 1px; padding: 6px; border: 1px solid var(--rule); border-radius: 12px; background: var(--card); }
  .wfrow.over, .wfend.over { box-shadow: inset 0 2px 0 var(--lamp); }
  .wfend { height: 4px; }
  .set { width: 100%; height: 44px; box-sizing: border-box; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 1px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--ink); text-align: left; cursor: grab; }
  .set:hover:not(.on) { background: var(--chip); }
  .set.on { background: var(--lampsoft); }
  .set.on .sn { font-weight: 600; }
  .set:focus-visible { outline: 2px solid var(--lampline); outline-offset: -2px; }
  .sn { font-size: 13px; }
  .sk { max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--ink3); }
  .addset { margin-top: 4px; height: 30px; border: 0; border-radius: 7px; outline: 1.5px dashed var(--rule); outline-offset: -1.5px; background: transparent; color: var(--lampink); font: 12.5px var(--ui); }
  .fine { margin: 8px 4px; font-size: 11.5px; color: var(--ink3); }
  .main { flex: 1; min-width: 0; }
  .head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .wname { flex: 1; min-width: 0; height: 32px; box-sizing: border-box; padding: 0 10px; border: 0; border-radius: 8px; background: var(--field); box-shadow: inset 0 0 0 1px var(--rule); color: var(--ink); caret-color: var(--lamp); font: 600 13.5px var(--ui); outline: none; -webkit-user-select: text; user-select: text; }
  .wname:focus { box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .srow { display: flex; align-items: center; gap: 10px; height: 40px; box-sizing: border-box; padding: 0 12px; outline: none; }
  .srow + .srow, .hint + .srow, .srow + .addrow, .hint + .addrow { border-top: 1px solid var(--rule); }
  .srow.over, .addrow.over { box-shadow: inset 0 2px 0 var(--lamp); }
  .srow:focus-visible { box-shadow: inset 0 0 0 2px var(--lampline); }
  .grip { color: var(--ink3); font-size: 12px; letter-spacing: -2px; cursor: grab; -webkit-user-select: none; user-select: none; }
  .sw { flex: 0 0 22px; width: 22px; height: 22px; padding: 0; display: grid; place-items: center; border: 0; border-radius: 6px; background: transparent; }
  .sw:hover { background: var(--chip); }
  .sw:focus-visible { outline: 2px solid var(--lampline); outline-offset: 1px; }
  .dot { width: 16px; height: 16px; border-radius: 8px; box-shadow: 0 0 0 1px var(--rule); }
  .cell { flex: 0 0 96px; min-width: 0; overflow: hidden; }
  .cap { display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 5px; font: 700 11px var(--ui); letter-spacing: 0.02em; white-space: nowrap; }
  .none { color: var(--ink3); }
  .kw, .qk { height: 28px; box-sizing: border-box; padding: 0 8px; border: 0; border-radius: 6px; background: var(--field); box-shadow: inset 0 0 0 1px var(--rule); color: var(--ink); caret-color: var(--lamp); font: 12.5px var(--mono); outline: none; -webkit-user-select: text; user-select: text; }
  .kw { flex: 1; min-width: 0; }
  .qk { flex: 0 0 44px; width: 44px; padding: 0; text-align: center; }
  .qk.auto { color: var(--ink3); }
  .qk:disabled { background: transparent; box-shadow: none; }
  .kw:focus, .qk:focus { box-shadow: inset 0 0 0 1.5px var(--lampline); }
  .kw.red, .qk.red { box-shadow: inset 0 0 0 1.5px var(--todo); }
  .newc { flex: 0 0 84px; width: 84px; font-size: 11.5px; white-space: nowrap; color: var(--lampink); }
  .newc.mk { height: 24px; padding: 0; border: 0; background: none; color: var(--ink3); font: 11.5px var(--ui); text-align: left; opacity: 0; }
  .srow:hover .newc.mk, .newc.mk:focus-visible { opacity: 1; }
  .x { flex: 0 0 22px; width: 22px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--ink3); font-size: 15px; }
  .x:hover:not(:disabled) { color: var(--todo); background: var(--chip); }
  .x:disabled { opacity: 0.3; }
  .hint { padding: 0 12px 8px 154px; font-size: 11.5px; color: var(--ink3); }
  .hint.err, .err { color: var(--todo); font-size: 12px; }
  .err { margin: 0 4px 10px; }
  .addrow { height: 36px; display: flex; align-items: center; padding: 0 12px; }
  .addrow button { padding: 0; border: 0; background: none; color: var(--lampink); font: 12.5px var(--ui); }
  .addrow button:hover { text-decoration: underline; }
  .infile { display: flex; align-items: center; gap: 10px; margin: -2px 0 18px; padding: 10px 14px; border-radius: 10px; background: var(--chip); }
  .org { min-width: 0; overflow-wrap: anywhere; font: 12.5px var(--mono); color: var(--ink); -webkit-user-select: text; user-select: text; }
  .banner { padding: 8px 12px; border-radius: 8px; background: color-mix(in srgb, var(--todo) 12%, transparent); }
</style>
