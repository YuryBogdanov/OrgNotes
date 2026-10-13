// The Inbox's list and its review became the plugin «inbox» (ТЗ 28 §2–3): its settings of config.json's `inbox` (the
// order, the counter, the details, the review's statuses, order and age) are read from there until the plugin writes
// them anew; the file and the quick entry's keys stay the core's. The keys follow by name (keys.ts); the review's tab is
// a session, not kept.

import { store } from '../store.svelte';
import { registerKindAlias } from '../views';

const MOVED = ['order', 'counter', 'details', 'stale', 'reviewOrder', 'reviewDone', 'reviewCancel'];

registerKindAlias('review', '');

store.registerStorage('inbox', {
  legacy: (parsed) => {
    const old = parsed?.inbox;
    if (!old || typeof old !== 'object') return undefined;
    const settings = Object.fromEntries(MOVED.filter((k) => k in old).map((k) => [k, old[k]]));
    return Object.keys(settings).length ? { settings } : undefined;
  },
  legacyKeys: MOVED.map((k) => 'inbox.' + k),
});
