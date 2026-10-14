// The plugins' own file types (ТЗ 39 §8, API 1.10): «.canvas» of «Холст». Such a file is in the folder's list like a
// note — the navigator shows it with its icon, a tab opens it in the plugin's view (never the Org editor), it is saved,
// re-read from the disk and taken back by ⌘Z as any file — but it has no headings: the agenda, search, tags, refile
// and the mini window leave it out. The Rust side lists and writes only the extensions set here.

import { SvelteMap } from 'svelte/reactivity';

export interface FileType {
  /** Without the dot, lower case: «canvas». */
  ext: string;
  /** «Холст». */
  title: string;
  icon: string;
  /** The plugin's file view that shows it. */
  view: string;
  /** What a new file holds. */
  template: string;
  /** The item of a folder's menu: «Новый холст». */
  newLabel: string;
  plugin: string;
}

const types = new SvelteMap<string, FileType>();
let onChange: (() => void) | null = null;
/** The store hears of each change: it tells the Rust side and reads the folder again. */
export const watchFileTypes = (fn: () => void) => void (onChange = fn);

export function registerFileType(t: FileType) {
  const ext = t.ext.toLowerCase();
  types.set(ext, { ...t, ext });
  onChange?.();
  return () => {
    if (types.get(ext)?.plugin !== t.plugin) return;
    types.delete(ext);
    onChange?.();
  };
}
export const fileTypes = () => [...types.values()];
const extOf = (name: string) => /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase();
/** The plugin's type of a file by its name; undefined — an Org note (or not ours). */
export const fileTypeOf = (name: string | undefined) => {
  const x = name ? extOf(name) : undefined;
  return x && x !== 'org' ? types.get(x) : undefined;
};
/** A note in Org: `.org` or its archive — not a plugin's file. */
export const isOrgName = (name: string) => /\.org(_archive)?$/i.test(name);
/** A name for a new file of a type: its extension added unless it is there. */
export const withExt = (name: string, t: FileType) => (name.toLowerCase().endsWith('.' + t.ext) ? name : `${name}.${t.ext}`);
