// The view switch of a file (fix-49): which views a file's tab may show besides its text — the plugins' (the board, a
// mindmap…), not a file type's own (a `.canvas` has its view as its only one). None: no switch.
import type { Tab } from '../layout';
import { allFileViews, type FileViewSpec } from '../views';
import { fileTypeOf, fileTypes } from '../fileTypes.svelte';

export function otherViews(tab: Tab | null | undefined): FileViewSpec[] {
  if (!tab || tab.kind !== 'file' || (tab.path && fileTypeOf(tab.path))) return [];
  return allFileViews().filter((v) => !fileTypes().some((t) => t.view === v.id));
}
/** The room the switch takes at the area's top right: what lies under it keeps clear of it. */
export const CORNER = { width: 140, height: 46 };
