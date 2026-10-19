<script lang="ts">
  import { tagsState as ts } from '../tagsState.svelte';
  import { PALETTE, toneOf, toneStyle } from '../colors';
  import { bareTag, tagOk } from '../tags';
  import { setLayer } from '../settingsNav.svelte';
  import type { MenuItem } from '../menuItems';
  import Group from './SetGroup.svelte';
  import Row from './SetRow.svelte';
  import Menu from './ui/Menu.svelte';

  // «Настройки → Теги» of the new interface (ТЗ 54 §2, ТЗ 38 §7): the tags not inherited (chips, «+ тег»), each tag's
  // colour (a menu of «Авто» and the named ones). Kept in the notes' folder.
  let menu = $state<{ tag: string; x: number; y: number } | null>(null);
  $effect(() => setLayer('tags', !!menu));
  $effect(() => () => setLayer('tags', false));
  let adding = $state('');
  const bad = $derived(adding.trim() !== '' && !tagOk(bareTag(adding)));
  function add() {
    const t = bareTag(adding);
    if (!t || !tagOk(t)) return;
    if (!ts.noInherit.some((x) => x.toLowerCase() === t.toLowerCase())) void ts.setNoInherit([...ts.noInherit, t]);
    adding = '';
  }
  const items = (tag: string): MenuItem[] => [
    { label: 'Авто', checked: !ts.colorOf(tag), action: () => void ts.setColor(tag, null) },
    'sep',
    ...PALETTE.map((p): MenuItem => ({ label: p.name, checked: ts.colorOf(tag) === p.id, capsule: toneStyle(toneOf(p.id)!), action: () => void ts.setColor(tag, p.id) })),
  ];
</script>

<Group caption="Не наследовать теги" note="тег остаётся только на своём заголовке">
  <Row label="Теги" hint="Например, :1on1: — чтобы встреча не помечала все задачи под ней" wide>
    <span class="chips" aria-label="Не наследовать теги" role="group">
      {#each ts.noInherit as t (t)}
        <span class="chip">:{t}:<button aria-label="Убрать {t}" onclick={() => void ts.setNoInherit(ts.noInherit.filter((x) => x !== t))}>×</button></span>
      {/each}
      <input bind:value={adding} placeholder="+ тег" aria-label="Добавить тег, который не наследуется" spellcheck="false" class:bad
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onblur={add} />
    </span>
  </Row>
</Group>
<Group caption="Цвета тегов" note="в навигаторе «Теги», на вкладке тега и в капсулах">
  {#each ts.list as t (t.tag)}
    {@const c = ts.colorOf(t.tag)}
    <Row label=":{t.tag}:" hint="{t.n} {t.n % 10 === 1 && t.n % 100 !== 11 ? 'заголовок' : t.n % 10 >= 2 && t.n % 10 <= 4 && (t.n % 100 < 12 || t.n % 100 > 14) ? 'заголовка' : 'заголовков'}">
      <button class="sw" aria-label="Цвет тега {t.tag}" aria-haspopup="menu" onclick={(e) => { const r = e.currentTarget.getBoundingClientRect(); menu = { tag: t.tag, x: r.right - 200, y: r.bottom + 4 }; }}>
        <span class="dot" style:background={c ? `var(--p-${c})` : 'var(--ink3)'}></span>{c ? PALETTE.find((p) => p.id === c)?.name : 'Авто'}<span class="ch" aria-hidden="true">▾</span>
      </button>
    </Row>
  {:else}
    <Row label="В заметках пока нет тегов" />
  {/each}
</Group>
{#if menu}{@const m = menu}<Menu x={m.x} y={m.y} width={200} items={items(m.tag)} label="Цвет тега" onclose={() => (menu = null)} />{/if}

<style>
  .chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .chip { display: inline-flex; align-items: center; gap: 2px; height: 24px; padding: 0 4px 0 8px; border-radius: 5px; background: var(--chip); color: var(--ink2); font: 12px var(--mono); }
  .chip button { width: 16px; height: 16px; padding: 0; border: 0; background: none; color: var(--ink3); font-size: 13px; line-height: 1; }
  .chips input { width: 110px; height: 24px; box-sizing: border-box; padding: 0 8px; border: 0; border-radius: 5px; outline: 1px dashed var(--rule); outline-offset: -1px; background: var(--field); color: var(--ink); font: 12px var(--mono); -webkit-user-select: text; user-select: text; }
  .chips input:focus { outline: 1.5px solid var(--lampline); }
  .chips input.bad { outline: 1.5px solid var(--todo); }
  .sw { height: 28px; display: inline-flex; align-items: center; gap: 8px; padding: 0 10px; border: 0; border-radius: 7px; background: var(--chip2); color: var(--ink); font: 12.5px var(--ui); }
  .dot { width: 10px; height: 10px; border-radius: 5px; }
  .ch { font-size: 10px; color: var(--ink3); }
  .sw:focus-visible { outline: 2px solid var(--lampline); outline-offset: 2px; }
</style>
