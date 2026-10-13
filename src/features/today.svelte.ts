// «Сегодня» (ТЗ 32): a part of the core — its pinned tab, its section of the settings (after «Основные»), its blocks,
// ⇧⌘H, and opening by itself at the start of the day (at launch, on coming back to the window, on the first action
// after 4:00).

import { untrack } from 'svelte';
import { registerSettings, registerView } from '../views';
import { store } from '../store.svelte';
import { TODAY, today } from '../todayState.svelte';
import { registerTodayBlock } from '../todayBlocks';
import { BLOCKS } from '../today';
import Today from '../Today.svelte';
import TodaySettings from '../TodaySettings.svelte';

export const SUN = 'M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4';

registerView({ kind: TODAY, label: () => 'Сегодня', icon: SUN, component: Today, crumbs: () => ['Сегодня'], pinned: true, single: true, hasInspector: () => false });
registerSettings({ id: 'Сегодня', icon: SUN, order: 5, component: TodaySettings });

// the core's blocks; «1-1 сегодня» and «Цели квартала» come later (ТЗ 32, part C)
const WIDE = new Set(['note', 'focus']);
for (const b of BLOCKS.filter((x) => x.id !== 'oneOnOne' && x.id !== 'goals')) registerTodayBlock({ id: b.id, title: b.title, hint: b.hint, wide: WIDE.has(b.id) });


// ---- by itself: at launch (each notes folder), on coming back to the window, on the first action after 4:00 ----
$effect.root(() => {
  $effect(() => {
    if (store.loaded && !store.mirror) {
      void store.dir;
      untrack(() => {
        today.start();
        today.check(true);
      });
    }
  });
  $effect(() => {
    if (store.appActive) untrack(() => today.check(false));
  });
});
let last = 0;
const poke = () => {
  const n = Date.now();
  if (n - last < 30000) return; // a look at the clock now and then is enough
  last = n;
  today.check(false);
};
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', poke, true);
  window.addEventListener('mousedown', poke, true);
}
