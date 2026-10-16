<script lang="ts">
  import { portal } from './portal';
  import { onMount } from 'svelte';
  import type { Workflow } from './org';
  import type { OrgLink } from './links';
  import { DEFAULT_LEVELS, type LevelView } from './orgIndent';
  import type { RichPick } from './orgRich';
  import type { FindQuery } from './findView';
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte';
  import TagPop from './TagPop.svelte';
  import { OrgEditor, type EditorProps } from './cm/orgEditor';

  // The old interface's editor: the Org editor of cm/orgEditor.ts (its state, keys, menu, links, the file followed)
  // with the old menu and the tags' popover.
  let { text, fileKey, path = '', wf, reveal, initial, initialTop, ontop, initialFolds, onfolds, hint = '', resetOn = 0, levels = DEFAULT_LEVELS, drawers = true, narrow = null, folded = [], lineNote = null, rich = false, richNumbers = false, gutter = true, onrich, find = null, onfound, onapi, onnarrow, onchange, oncursor, onfollow }: {
    path?: string; // the file's name in the folder: what a plugin's link at the end of a line is run with (ТЗ 33)
    levels?: LevelView; // «Структурный вид»: one star per level, text moved by level
    drawers?: boolean; // drawers folded when a file opens and when the app adds one (:PROPERTIES:, :LOGBOOK:)
    gutter?: boolean; // the line numbers and the fold markers on the left (none in the mini window, ТЗ 31)
    rich?: boolean; // «Оформленный текст»: drawn like org-modern (implies the structural view)
    richNumbers?: boolean; // line numbers while drawn
    onrich?: (p: RichPick) => void; // a click on a status, a priority or a date that asks for a choice
    find?: (FindQuery & { go: number; dir: 1 | -1 }) | null; // ⌘F: the query; a new `go` steps to the next / previous match
    onfound?: (info: { total: number; cur: number; folded: number; wrapped: boolean } | null) => void;
    onapi?: (api: { selection: () => string }) => void; // what the pane asks of the editor (⌘F, ⌘E take the selection)
    // «Разбор Inbox»: only these lines of the file are shown and edited (as org-narrow-to-subtree); `end` exclusive
    narrow?: { line: number; end: number } | null;
    folded?: number[]; // heading lines folded when the editor opens («Отметки» on a card of goals)
    lineNote?: { line: number; text: string } | null; // a grey note at the end of a line («2 — справа»)
    onnarrow?: (line: number, last: number, typed: boolean) => void; // where the shown lines are now (they move with edits); typed: by the user here
    hint?: string; // grey placeholder in an empty document
    resetOn?: number; // bumped when the text was silently reloaded from disk: the undo history starts over
    text: string; fileKey: string; wf: Workflow;
    reveal: { line: number; n: number; focus?: boolean; col?: number } | null | undefined;
    initial?: { line: number; col: number }; // where the caret of this tab was (restored when the tab is shown)
    initialTop?: number; // the first line that was in view (the scroll comes back with the tab)
    ontop?: (line: number) => void; // the first line in view, after a scroll
    initialFolds?: number[]; // the headings folded when the tab was last shown (their lines)
    onfolds?: (lines: number[]) => void; // the headings folded now, after a fold or an unfold
    onchange: (t: string) => void;
    oncursor: (line: number, col: number) => void;
    onfollow: (link: OrgLink) => void;
  } = $props();

  let host: HTMLDivElement;
  let ed = $state.raw<OrgEditor | undefined>();
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let tagPop = $state<{ tags: string[]; x: number; y: number } | null>(null);
  const snapshot = (): EditorProps => ({
    text, fileKey, path, wf, reveal, initial, initialTop, ontop, initialFolds, onfolds, hint, resetOn, levels, drawers, narrow, folded, lineNote, rich, richNumbers, gutter, onrich, find, onfound, onapi, onnarrow, onchange, oncursor, onfollow,
  });
  onMount(() => {
    ed = new OrgEditor(host, snapshot(), { menu: (x, y, items) => (menu = { x, y, items }), tags: (p) => (tagPop = p) });
    return () => ed?.destroy();
  });
  // every change of the props: the editor brings each part up to date (the file, the look, the find, a reveal)
  $effect(() => {
    const p = snapshot();
    ed?.update(p);
  });
</script>

<div class="host" bind:this={host}></div>
{#if tagPop && ed}<TagPop tags={tagPop.tags} x={tagPop.x} y={tagPop.y} onchange={ed.tagsChanged} onclose={ed.closeTagPop} />{/if}
{#if menu}<div use:portal><ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} width={300} tall /></div>{/if}

<style>
  .host { height: 100%; min-height: 0; overflow: hidden; }
</style>
