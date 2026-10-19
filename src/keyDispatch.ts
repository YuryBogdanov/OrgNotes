// The window's keyboard: every configurable shortcut (keys.ts) is found and run here, in the order of the scopes —
// the review's tab, then the editor with the focus (a heading first), then the window. A chord («⌃C S») waits for
// its second press. The native menu shows the same shortcuts; WebKit gives a key to the page first, so a key run
// here does not reach the menu, and a menu item run by its key is not run here again.

import { KEY_COMMANDS, SCOPES, pressOf, type Scope } from './keys';
import { focusedEditor, type EditorKeys } from './editorKeys';
import { contextOf } from './commands';
import { store, type ScopeKeys } from './store.svelte';

const CHORD_WAIT = 1500; // ms for the second press of a chord
const PALETTE = new Set(['status', 'schedule', 'deadline', 'tags']);
/** Not configurable, but the window's: in the app the menu has it too, in a plain browser only this. */
const FIXED: Record<string, string> = { '⌘Q': 'quit' };

let pending: string | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;
// a press run by one of the two (this handler, the menu) is left by the other one
let byKeys = { press: '', t: 0 };
let byMenu = { press: '', t: 0 };
const recent = (r: { press: string; t: number }, press: string) => press === r.press && Date.now() - r.t < 250;
/** The menu runs an item: false if this handler has just run the same press. */
export function menuMayRun(press: string | undefined) {
  if (press && recent(byKeys, press)) return false;
  if (press) byMenu = { press, t: Date.now() };
  return true;
}

/** The features' scopes active now (their tabs shown), the higher rank first; the editor; the window. */
type Ctx = { features: [string, ScopeKeys][]; editor: EditorKeys | null; window: (id: string) => boolean };

function scopesNow(c: Ctx): Scope[] {
  return [...c.features.map(([id]) => id), ...(c.editor ? (['heading', 'editor'] as Scope[]) : []), 'window', 'global'];
}
function runOne(id: string, scope: Scope, c: Ctx): boolean {
  const f = c.features.find(([s]) => s === scope);
  if (f) return f[1].run(id);
  if (scope === 'heading' && (PALETTE.has(id) || id === 'refile' || id === 'archive')) {
    if (!contextOf().heading || store.sheetOpen) return false;
    if (id === 'refile') store.startRefile();
    else if (id === 'archive') void store.archiveSubtree();
    else store.openPalette(id as 'status');
    return true;
  }
  if (scope === 'heading' || scope === 'editor') return c.editor!.run(id);
  return c.window(id);
}
/** Run the command bound to this sequence of presses in the scopes active now; false if there is none here. */
function runSeq(seq: string, c: Ctx): boolean {
  for (const scope of scopesNow(c))
    for (const cmd of KEY_COMMANDS)
      if (cmd.scope === scope && store.bindings.get(cmd.id)?.includes(seq) && runOne(cmd.id, scope, c)) return true;
  return false;
}
const isPrefix = (seq: string, c: Ctx) => {
  const scopes = scopesNow(c);
  return KEY_COMMANDS.some((cmd) => scopes.includes(cmd.scope) && store.bindings.get(cmd.id)?.some((k) => k.startsWith(seq + ' ')));
};

/** The handler, on the window in the capture phase: before the editor, the fields and the menu. */
export function keyHandler(window: (id: string) => boolean) {
  return (e: KeyboardEvent) => {
    if (store.keyRecording) return; // the settings are recording a shortcut
    const press = pressOf(e);
    if (!press) return;
    // a plugin's element that takes its keys itself (the terminal, ТЗ 55 §3): every ⌃ and ⌥ press goes to it (⌃C, ⌃R,
    // ⌃C … of the app's chords too), ⌘ ones stay the app's but those it names (`data-own-keys="⌘C ⌘F"`); the menu leaves
    // what it took
    const own = !pending && (e.target as Element | null)?.closest?.('[data-own-keys]');
    if (own && (!e.metaKey || own.getAttribute('data-own-keys')!.split(' ').includes(press))) {
      byKeys = { press, t: Date.now() };
      return;
    }
    const features = [...store.scopeKeys].filter(([, k]) => k.active()).sort(([a], [b]) => (SCOPES.get(b)?.rank ?? 0) - (SCOPES.get(a)?.rank ?? 0));
    const c: Ctx = { features, editor: focusedEditor(), window };
    const consume = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (pending) {
      const seq = pending + ' ' + press;
      pending = null;
      clearTimeout(pendingTimer);
      // a chord of three presses (⌃X N S, ТЗ 42): the first two wait for the third
      if (!runSeq(seq, c) && isPrefix(seq, c)) {
        pending = seq;
        pendingTimer = setTimeout(() => (pending = null), CHORD_WAIT);
      }
      consume(); // a chord that means nothing here is not typed either
      return;
    }
    if (recent(byMenu, press)) return consume();
    if (runSeq(press, c)) {
      byKeys = { press, t: Date.now() };
      return consume();
    }
    if (FIXED[press] && window(FIXED[press])) return consume();
    if (isPrefix(press, c)) {
      pending = press;
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => (pending = null), CHORD_WAIT);
      consume();
    }
  };
}
