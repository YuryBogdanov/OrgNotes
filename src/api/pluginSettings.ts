// A plugin's own storage and its settings by the manifest's schema (tech sprint 3.2, from the host): `{ data,
// settings }` in its file of the notes folder or on this Mac; the values with the defaults; the schema the settings
// sheet draws, with what the plugin computes for it (`settings.dynamic`).

import { store } from '../store.svelte';
import type { Field, FieldCtrl, Group, Opt as CoreOpt, Schema, Values } from '../settingsSchema';
import type { Manifest, ManifestSettings } from './manifest';

type Guard = <T>(id: string, fn: () => T, fallback: T) => T;
/** What a plugin computes for a field of its settings. */
export interface Dynamic {
  options?(v: Values): CoreOpt[] | [CoreOpt[], CoreOpt[]];
  hint?(v: Values): string;
  show?(path: string | null): string;
  clean?(text: string): string;
  render?(el: HTMLElement, ctrl: FieldCtrl): (() => void) | void;
}

/** The plugin's own place of a storage: `{ data, settings }` in its file (or on this Mac). */
export function whole(id: string, where: 'folder' | 'local'): Record<string, unknown> {
  const v = where === 'folder' ? store.folderData(id) : store.localData(id);
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
export async function put(id: string, where: 'folder' | 'local', part: 'data' | 'settings', value: unknown) {
  const next = { ...whole(id, where), [part]: value };
  if (where === 'folder') await store.setFolderData(id, next);
  else store.setLocalData(id, next);
}
function fields(m: Manifest): Field[] {
  return m.contributes.settings.flatMap((s) => s.groups.flatMap((g) => g.fields));
}
export function settingsValues(m: Manifest): Values {
  const out: Values = {};
  const folder = (whole(m.id, 'folder').settings ?? {}) as Values;
  const local = (whole(m.id, 'local').settings ?? {}) as Values;
  for (const f of fields(m))
    for (const k of f.type === 'pair' ? [f.key, f.key2] : [f.key]) {
      const own = f.where === 'folder' ? folder : local;
      const d = (f as { default?: unknown; default2?: unknown })[k === f.key ? 'default' : 'default2'];
      out[k] = k in own ? own[k] : (d ?? null);
    }
  return out;
}
export async function setSettings(m: Manifest, patch: Values) {
  const by = { folder: {} as Values, local: {} as Values };
  for (const f of fields(m)) for (const k of f.type === 'pair' ? [f.key, f.key2] : [f.key]) if (k in patch) by[f.where][k] = patch[k];
  for (const where of ['folder', 'local'] as const)
    if (Object.keys(by[where]).length) await put(m.id, where, 'settings', { ...((whole(m.id, where).settings ?? {}) as Values), ...by[where] });
  // the first change moves what config.json still has (a feature's settings of before) to the plugin's file
  if (store.hasLegacy(m.id)) await store.setFolderData(m.id, whole(m.id, 'folder'));
}
export function schemaOf(m: Manifest, s: ManifestSettings, i: number, guard: Guard, dynamic: (key: string) => Dynamic | undefined): Schema {
  const dyn = (key: string) => dynamic(m.id + ':' + key);
  const field = (f: Field): Field => {
    const hint = (v: Values) => guard(m.id, () => dyn(f.key)?.hint?.(v), undefined) ?? (typeof f.hint === 'string' ? f.hint : '');
    if (f.type === 'choice') return { ...f, hint, options: (v) => (guard(m.id, () => dyn(f.key)?.options?.(v), undefined) as CoreOpt[] | undefined) ?? (Array.isArray(f.options) ? f.options : []) };
    if (f.type === 'file') return { ...f, hint, show: (rel) => guard(m.id, () => dyn(f.key)?.show?.(rel), undefined) ?? rel ?? 'Не выбран' };
    if (f.type === 'text') return { ...f, hint, clean: (t) => guard(m.id, () => dyn(f.key)?.clean?.(t), undefined) ?? t };
    if (f.type === 'pair') {
      const both = (f as unknown as { options?: [CoreOpt[], CoreOpt[]] }).options;
      return { ...f, hint, options: (v) => (guard(m.id, () => dyn(f.key)?.options?.(v), undefined) as [CoreOpt[], CoreOpt[]] | undefined) ?? (Array.isArray(both) ? both : [[], []]) };
    }
    // drawn by the plugin (1.12); nothing until it gives its `render`
    if (f.type === 'custom') return { ...f, hint, render: (el, ctrl) => guard(m.id, () => dyn(f.key)?.render?.(el, ctrl), undefined) };
    return { ...f, hint };
  };
  return {
    id: `${m.id}-${i}`,
    label: s.section ?? s.block ?? m.name,
    groups: s.groups.map((g): Group => ({ ...g, fields: g.fields.map(field) })),
    values: () => settingsValues(m),
    set: (patch) => setSettings(m, patch),
  };
}
