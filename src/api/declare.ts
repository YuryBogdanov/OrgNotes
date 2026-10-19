// The plugins as declared (ТЗ 26 §4): the manifests found, checked, on or off; the commands of those that are on go
// to the registry of keys here — before the store reads the saved shortcuts, so their changes are kept (imported by
// main.ts right after the built-in features' keys). Nothing of the store here.

import { C, KEY_COMMANDS, registerGroup, registerKeys, registerScope, unregisterKeys } from '../keys';
import { API_VERSION } from './index';
import { incompatible, parseManifest, type Manifest } from './manifest';
import { parseSource, type Source } from './sources';
import pkg from '../../package.json';

export const APP_VERSION: string = pkg.version;

export interface Entry {
  /** The folder's name (a built-in plugin: under src/plugins). */
  dir: string;
  builtin: boolean;
  manifest: Manifest | null;
  /** Why it cannot be turned on: the manifest's problems, the versions. */
  problems: string[];
  /** On (the user's choice, else the manifest's default) and can run. */
  enabled: boolean;
  /** Where an installed one came from (ТЗ 37): the catalog, a git link; none — put there by hand. */
  source?: Source | null;
}

const BUILTIN = import.meta.glob('../plugins/*/manifest.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const ENABLED_KEY = 'plugins:enabled';
/** The core's features: their storages and keys are taken. */
const CORE_IDS = ['goals', 'review', 'agenda', 'files', 'search'];

/** The user's choices: { id: on }. */
export function readChoices(): Record<string, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(ENABLED_KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
export function saveChoice(id: string, on: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify({ ...readChoices(), [id]: on }));
  } catch {
    /* no storage: until the restart */
  }
}

export function entryOf(dir: string, raw: unknown, builtin: boolean, choices: Record<string, boolean>): Entry {
  const r = parseManifest(raw);
  if (!r.ok) return { dir, builtin, manifest: null, problems: r.problems, enabled: false };
  const m = r.manifest;
  const problems: string[] = [];
  if (CORE_IDS.includes(m.id)) problems.push(`id «${m.id}» занят приложением`);
  if (m.id !== dir) problems.push(`id «${m.id}» не совпадает с папкой «${dir}»`);
  const why = incompatible(m, API_VERSION, APP_VERSION);
  if (why) problems.push(why);
  const on = choices[m.id] ?? (builtin ? m.defaultEnabled !== false : false);
  return { dir, builtin, manifest: m, problems, enabled: on && !problems.length };
}

/** An installed plugin as Rust lists it: its folder and the text of its manifest. */
export interface Listed {
  dir: string;
  manifest: string | null;
  /** `.source.json` (ТЗ 37). */
  source?: string | null;
}
const INSTALLED_KEY = 'plugins:installed';
/** The installed plugins as last listed: their commands' keys are declared at once, before the store reads the
 *  saved shortcuts; the list is read anew when the window is up. */
export function readInstalled(): Listed[] {
  try {
    const v = JSON.parse(localStorage.getItem(INSTALLED_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.dir === 'string') : [];
  } catch {
    return [];
  }
}
export function saveInstalled(list: Listed[]) {
  try {
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(list));
  } catch {
    /* no storage: listed again next time */
  }
}
const byName = (a: Entry, b: Entry) => (a.manifest?.name ?? a.dir).localeCompare(b.manifest?.name ?? b.dir, 'ru');

/** The entries of the installed plugins (a built-in one's id is taken). */
export function installedEntries(list: Listed[], builtin: Entry[], choices = readChoices()): Entry[] {
  const taken = new Set(builtin.map((e) => e.manifest?.id).filter(Boolean));
  return list
    .map((l) => {
      let raw: unknown;
      if (l.manifest === null) return { dir: l.dir, builtin: false, manifest: null, problems: ['в папке нет manifest.json'], enabled: false };
      try {
        raw = JSON.parse(l.manifest);
      } catch {
        return { dir: l.dir, builtin: false, manifest: null, problems: ['manifest.json — не JSON'], enabled: false };
      }
      const e: Entry = { ...entryOf(l.dir, raw, false, choices), source: parseSource(l.source) };
      if (e.manifest && taken.has(e.manifest.id)) return { ...e, problems: [...e.problems, `id «${e.manifest.id}» занят встроенным плагином`], enabled: false };
      return e;
    })
    .sort(byName);
}

const choices = readChoices();
export const builtinEntries: Entry[] = Object.entries(BUILTIN)
  .map(([path, raw]) => entryOf(path.split('/').at(-2)!, raw, true, choices))
  .sort(byName);
export const entries: Entry[] = [...builtinEntries, ...installedEntries(readInstalled(), builtinEntries, choices)];

/** The group of «Клавиши» of a plugin. */
export const groupOf = (id: string) => 'plugin:' + id;

/** The scope of the keys of a plugin's review (its tab): over the window and the editor. Each plugin has its own, so
 *  two plugins' reviews (the goals' and the Inbox's ⌘1) do not clash (ТЗ 28). */
export const reviewScope = (id: string) => 'pluginReview:' + id;
function declareReviewScope(m: Manifest) {
  registerScope({ id: reviewScope(m.id), name: `в разборе «${m.name}»`, over: ['window', 'editor', 'heading'], outside: { scopes: ['window', 'editor'], word: 'Вне разбора' }, rank: 30, alone: true });
}

/** The scope of the keys of a plugin's view of a file (the board, ТЗ 33): over the window and the editor, while a file
 *  tab shows it; its own group of «Клавиши» («ДОСКА», «только на доске»). */
export const viewScope = (id: string) => 'pluginView:' + id;
const viewGroup = (id: string) => groupOf(id) + ':view';
const viewWord = (m: Manifest) => m.contributes.fileViews[0]?.title ?? m.name;
function declareViewScope(m: Manifest) {
  registerScope({ id: viewScope(m.id), name: `в виде «${viewWord(m)}»`, over: ['window', 'editor', 'heading'], outside: { scopes: ['window', 'editor'], word: 'В остальном окне' }, rank: 25, alone: true });
}

/** A plugin's commands in the registry of keys (and its group of «Клавиши»). */
/** A card's action with no keys of its own (ТЗ 44 §9): «⌃C K <letter>», unless a command declared before has that
 *  chord already — then none, and «Клавиши» says whose it is. */
export function cardChord(c: { id: string; cardKey?: string }): { key?: string; taken?: string } | null {
  if (!c.cardKey) return null;
  const key = `⌃C K ${c.cardKey}`;
  const owner = KEY_COMMANDS.find((x) => x.id !== c.id && [...(x.keys ?? []), ...(x.mac ?? []), ...(x.emacs ?? [])].includes(key));
  return owner ? { taken: `${key} уже у «${owner.title}»` } : { key };
}
export function declareKeys(m: Manifest) {
  if (!m.contributes.commands.length) return;
  registerGroup({ id: groupOf(m.id), title: m.name.toUpperCase(), note: 'плагин' });
  if (m.contributes.commands.some((c) => c.scope === 'review')) declareReviewScope(m);
  if (m.contributes.commands.some((c) => c.scope === 'view')) {
    declareViewScope(m);
    const w = viewWord(m);
    registerGroup({ id: viewGroup(m.id), title: w.toUpperCase(), note: `только в виде «${w}»` });
  }
  registerKeys(m.contributes.commands.map((c) => {
    const card = c.keys?.length ? null : cardChord(c);
    const note = [c.note, card?.taken].filter(Boolean).join(' · ');
    // a heading's command (1.16): with the core's in «Заголовок», on a heading in the editor
    const group = c.scope === 'view' ? viewGroup(m.id) : c.scope === 'heading' ? 'heading' : groupOf(m.id);
    const scope = c.scope === 'review' ? reviewScope(m.id) : c.scope === 'view' ? viewScope(m.id) : c.scope === 'heading' ? 'heading' : 'window';
    return C(c.id, c.title, group, scope, card?.key ? [card.key] : (c.keys ?? []), { synonyms: c.synonyms, ...(note ? { note } : {}) });
  }));
}
export function undeclareKeys(m: Manifest) {
  unregisterKeys(m.contributes.commands.map((c) => c.id), groupOf(m.id));
  unregisterKeys([], viewGroup(m.id)); // its group of the view goes with its commands
}

for (const e of entries) if (e.enabled && e.manifest) declareKeys(e.manifest);
