<script lang="ts">
  import { onMount } from 'svelte';
  import type { Workflow } from '../org';
  import type { OrgLink } from '../links';
  import { DEFAULT_LEVELS, type LevelView } from '../orgIndent';
  import type { RichPick } from '../orgRich';
  import { OrgEditor, type EditorProps } from '../cm/orgEditor';
  import Menu from './ui/Menu.svelte';
  import TagsPop from './TagsPop.svelte';
  import { headingMenu } from './headingMenu';
  import type { MenuItem } from '../menuItems';
  import { editorCompatVars } from './compat';
  import { nextPrefs } from '../nextPrefs.svelte';
  import './editor.css';

  // The new interface's editor (ТЗ 42 §2, 42.5): the same Org editor as the old one (cm/orgEditor.ts — the engine,
  // keys, folding, undo, the file followed), its own component; the menu and the tags' popover are bridges yet.
  let { text, fileKey, path = '', wf, reveal, initial, initialTop, ontop, initialFolds, onfolds, hint = '', resetOn = 0, levels = DEFAULT_LEVELS, drawers = true, rich = false, richNumbers = false, gutter = true, onrich, eyebrow, narrow = null, onnarrow, onnarrowTo, onwiden, find = null, onfound, onapi, onchange, oncursor, onfollow }: {
    text: string; fileKey: string; path?: string; wf: Workflow;
    reveal: { line: number; n: number; focus?: boolean; col?: number } | null | undefined;
    initial?: { line: number; col: number }; initialTop?: number; ontop?: (line: number) => void;
    initialFolds?: number[]; onfolds?: (lines: number[]) => void;
    hint?: string; resetOn?: number; levels?: LevelView; drawers?: boolean; rich?: boolean; richNumbers?: boolean;
    gutter?: boolean; // the line numbers and the fold markers (none in the mini window, ТЗ 52 §2)
    onrich?: (p: RichPick) => void;
    eyebrow?: () => string | null; // above the title in «Оформление»: «Midterm.org · изменён 2 мин назад»
    narrow?: { line: number; end: number } | null; onnarrow?: (line: number, last: number, typed: boolean) => void; // ⌃X N S (§5.8)
    onnarrowTo?: (line: number) => void; onwiden?: () => void;
    find?: EditorProps['find']; onfound?: EditorProps['onfound']; onapi?: EditorProps['onapi']; // ⌘F (§5.7)
    onchange: (t: string) => void; oncursor: (line: number, col: number) => void; onfollow: (link: OrgLink) => void;
  } = $props();

  let host: HTMLDivElement;
  let ed = $state.raw<OrgEditor | undefined>();
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let tagPop = $state<{ tags: string[]; x: number; y: number } | null>(null);
  const snapshot = (): EditorProps => ({ text, fileKey, path, wf, reveal, initial, initialTop, ontop, initialFolds, onfolds, hint, resetOn, levels, drawers, rich, richNumbers, gutter, onrich, onchange, oncursor, onfollow, next: true, headingMenu, look: nextPrefs.font + ' ' + nextPrefs.width, eyebrow, narrow, onnarrow, onnarrowTo, onwiden, find, onfound, onapi });
  onMount(() => {
    ed = new OrgEditor(host, snapshot(), { menu: (x, y, items) => (menu = { x, y, items }), tags: (p) => (tagPop = p) });
    return () => ed?.destroy();
  });
  $effect(() => {
    const p = snapshot();
    ed?.update(p);
  });
</script>

<!-- app.css draws the editor's tooltips with the old names: given by the new tokens here (ТЗ 43 §5) -->
<div class="host" bind:this={host} style={editorCompatVars()}></div>
{#if tagPop && ed}<TagsPop tags={tagPop.tags} x={tagPop.x} y={tagPop.y} onchange={ed.tagsChanged} onclose={ed.closeTagPop} />{/if}
{#if menu}<Menu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} width={300} />{/if}

<style>
  .host { height: 100%; min-height: 0; overflow: hidden; }
</style>
