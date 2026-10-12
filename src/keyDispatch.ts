// The window's keyboard: every configurable shortcut (keys.ts) is found and run here, in the order of the scopes —
// the review's tab, then the editor with the focus (a heading first), then the window. A chord («⌃C S») waits for
// its second press. The native menu shows the same shortcuts; WebKit gives a key to the page first, so a key run
// here does not reach the menu, and a menu item run by its key is not run here again.

import { KEY_COMMANDS, pressOf, type Scope } from './keys';
import { focusedEditor, type EditorKeys } from './editorKeys';
import { contextOf } from './commands';
import { store } from './store.svelte';

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

type Ctx = { review: typeof store.reviewKeys; goals: typeof store.goalReviewKeys; editor: EditorKeys | null; window: (id: string) => boolean };

function scopesNow(c: Ctx): Scope[] {
  return [...(c.goals ? (['goalReview'] as Scope[]) : []), ...(c.review ? (['review'] as Scope[]) : []), ...(c.editor ? (['heading', 'editor'] as Scope[]) : []), 'window', 'global'];
}
function runOne(id: string, scope: Scope, c: Ctx): boolean {
  if (scope === 'review') return c.review!.run(id);
  if (scope === 'goalReview') return c.goals!.run(id);
  if (scope === 'heading' && (PALETTE.has(id) || id === 'refile')) {
    if (!contextOf().heading || store.sheetOpen) return false;
    if (id === 'refile') store.startRefile();
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
    const c: Ctx = { review: store.reviewKeys?.active() ? store.reviewKeys : null, goals: store.goalReviewKeys?.active() ? store.goalReviewKeys : null, editor: focusedEditor(), window };
    const consume = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (pending) {
      const seq = pending + ' ' + press;
      pending = null;
      clearTimeout(pendingTimer);
      runSeq(seq, c);
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
