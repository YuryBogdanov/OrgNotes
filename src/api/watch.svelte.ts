// Small helpers of the host's modules (tech sprint 3.2).

import { untrack } from 'svelte';
import type { Dispose } from './index';

export const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
/** An effect outside any component: `fn` with the new value when it changes (not at first). */
export function watch<T>(read: () => T, fn: (v: T) => void): Dispose {
  let first = true;
  return $effect.root(() => {
    $effect(() => {
      const v = read();
      if (first) {
        first = false;
        return;
      }
      untrack(() => fn(v));
    });
  });
}
