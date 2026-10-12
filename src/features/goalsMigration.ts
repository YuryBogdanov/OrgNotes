// The goals of the quarter became the plugin «quarter-goals» (ТЗ 27 §3): what the core kept under the old id is read
// from there until the plugin writes it anew — the sources (`.orgnotes/plugins/goals.json`, before 0.6 the key `goals`
// of config.json), the thresholds (`feature:goals` on this Mac), the tabs of a saved layout. The keys and the
// navigator's mode follow by name (keys.ts, store.svelte.ts).

import { store } from '../store.svelte';
import { registerKindAlias } from '../views';

registerKindAlias('goals', 'quarter-goals.overview');
registerKindAlias('goalReview', ''); // a review is a session: not kept

store.registerStorage('goals'); // its file is read, to be moved
store.registerStorage('quarter-goals', {
  legacy: (parsed) => {
    const old = store.folderData('goals') as { sources?: unknown } | undefined;
    const sources = old?.sources ?? parsed?.goals;
    return sources ? { data: { sources } } : undefined;
  },
  legacyKeys: ['goals'],
  localLegacy: (parsed) => {
    let v: unknown = null;
    try {
      v = JSON.parse(localStorage.getItem('feature:goals') ?? 'null');
    } catch {
      /* none */
    }
    v = v ?? parsed?.goalSettings;
    return v ? { settings: v } : undefined;
  },
});
