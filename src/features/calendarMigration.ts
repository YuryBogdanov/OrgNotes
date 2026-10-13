// The calendar became the plugin «calendar» (ТЗ 29 §2): its settings were flat — in `.orgnotes/plugins/calendar.json`
// (before roadmap 0.6 the key `calendar` of config.json) and `feature:calendar` on this Mac — and the layers and the
// hidden files had keys of their own (`cal:layers`, `cal:hidden`). They are read in the plugin's shape — `{ settings,
// data }` — until it writes them anew. A calendar tab of a saved layout is the plugin's view; the keys follow by name
// (keys.ts).

import { store } from '../store.svelte';
import { registerKindAlias } from '../views';

const FOLDER = ['pick', 'taskFile', 'taskHeading', 'eventFile', 'eventHeading', 'taskStatus', 'eventStatus', 'dateKind', 'minutes'];
const LOCAL = ['view', 'from', 'to', 'weekNumbers', 'weekends', 'undated', 'keepDeadline', 'askRepeat'];

const ls = (k: string) => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? 'null');
  } catch {
    return null;
  }
};
const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
/** Written by the plugin already: `settings` or `data` in it. */
const isNew = (v: unknown) => !!v && typeof v === 'object' && ('settings' in v || 'data' in v);

/** The folder's: the settings of new entries, the last files chosen («Как в прошлый раз»). */
function folder(flat: Record<string, unknown>) {
  return { settings: pick(flat, FOLDER), data: flat.last ? { last: flat.last } : {} };
}
/** This Mac's: the look, the moves; the layers and the hidden files (per notes folder). */
function local(flat: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  const layers = ls('cal:layers');
  const hidden = ls('cal:hidden');
  if (Array.isArray(layers)) data.layers = layers;
  if (hidden && typeof hidden === 'object') data.hidden = hidden;
  return { settings: pick(flat, LOCAL), data };
}

registerKindAlias('calendar', 'calendar.view');
store.registerStorage('calendar', {
  legacy: (parsed) => (parsed?.calendar && typeof parsed.calendar === 'object' ? folder(parsed.calendar) : undefined),
  legacyKeys: ['calendar'],
  localLegacy: (parsed) => local(parsed?.calendar && typeof parsed.calendar === 'object' ? parsed.calendar : {}),
  upgrade: (v, where) => (isNew(v) || !v || typeof v !== 'object' ? v : where === 'folder' ? folder(v as Record<string, unknown>) : local(v as Record<string, unknown>)),
});
