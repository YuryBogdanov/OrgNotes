// The plugins as declared (ТЗ 26 §4): the manifests found, checked, on or off; the commands of those that are on go
// to the registry of keys here — before the store reads the saved shortcuts, so their changes are kept (imported by
// main.ts right after the built-in features' keys). Nothing of the store here.

import { C, registerGroup, registerKeys } from '../keys';
import { API_VERSION } from './index';
import { incompatible, parseManifest, type Manifest } from './manifest';
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
}

const BUILTIN = import.meta.glob('../plugins/*/manifest.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const ENABLED_KEY = 'plugins:enabled';
/** The core's features: their storages and keys are taken. */
const CORE_IDS = ['goals', 'calendar', 'inbox', 'review', 'agenda', 'files', 'search'];

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

const choices = readChoices();
export const entries: Entry[] = Object.entries(BUILTIN)
  .map(([path, raw]) => entryOf(path.split('/').at(-2)!, raw, true, choices))
  .sort((a, b) => (a.manifest?.name ?? a.dir).localeCompare(b.manifest?.name ?? b.dir, 'ru'));

/** The group of «Клавиши» of a plugin. */
export const groupOf = (id: string) => 'plugin:' + id;

for (const e of entries) {
  const m = e.manifest;
  if (!e.enabled || !m || !m.contributes.commands.length) continue;
  registerGroup({ id: groupOf(m.id), title: m.name.toUpperCase(), note: 'плагин' });
  registerKeys(m.contributes.commands.map((c) => C(c.id, c.title, groupOf(m.id), 'window', c.keys ?? [], { synonyms: c.synonyms })));
}
