<script lang="ts">
  import Editor from './Editor.svelte';
  import { store, type NoteFile } from './store.svelte';
  import type { Tab } from './layout';
  import type { OrgLink } from './links';

  // A heading with its subtree, alone in an editor (roadmap 0.4), as org-narrow-to-subtree: what a review's card
  // shows. The rest of the file is there but out of reach; edits go to the file as any edit of it.
  let { file, line, end, tab, fileKey, reveal = null, drawers = true, folded = [], lineNote = null, gutter = true, onnarrow }: {
    file: NoteFile;
    line: number; // the heading's line
    end: number; // the line after its subtree
    tab: Tab; // where the caret is kept (the palette's commands work on the heading under it)
    fileKey: string; // another key: another editor (a new card)
    reveal?: { line: number; n: number; focus?: boolean; col?: number } | null;
    drawers?: boolean;
    folded?: number[];
    lineNote?: { line: number; text: string } | null;
    gutter?: boolean; // the line numbers (none at the board's side, ТЗ 33)
    onnarrow?: (line: number, last: number, typed: boolean) => void; // the shown lines moved with an edit (typed here or not)
  } = $props();
</script>

<Editor text={file.text} {fileKey} path={file.name} wf={file.wf} {reveal} narrow={{ line, end }} {drawers} {folded} {lineNote} {gutter} levels={store.levels}
  onchange={(t) => store.setText(t, file.path)} oncursor={(l, c) => store.setTabCursor(tab, l, c)} {onnarrow} onfollow={(l: OrgLink) => store.follow(l)} />
