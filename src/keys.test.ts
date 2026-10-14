import './features/keys'; // the built-in features' commands, as in the app
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  KEY_COMMANDS, bindingsOf, chordNote, clash, conflictsOf, fromAccelerator, isModified, matchesQuery, modifiedCount, normPress, outerNote,
  parseState, pressOf, queryKeys, refusal, toAccelerator, withKeys, commandById, defaultsOf, keyName, type KeyState,
} from './keys';
import './api/declare'; // the built-in plugins' keys (the Inbox's review, ТЗ 28), as the app declares them

const ev = (code: string, mods = '') => ({ code, ctrlKey: mods.includes('c'), altKey: mods.includes('a'), shiftKey: mods.includes('s'), metaKey: mods.includes('m') });
const emacs: KeyState = { preset: 'emacs', overrides: {} };
const mac: KeyState = { preset: 'mac', overrides: {} };

describe('presses', () => {
  it('by the physical key, modifiers in the macOS order', () => {
    expect(pressOf(ev('KeyO', 'sm'))).toBe('⇧⌘O');
    expect(pressOf(ev('ArrowRight', 'cam'))).toBe('⌃⌥⌘→');
    expect(pressOf(ev('Comma', 'm'))).toBe('⌘,');
    expect(pressOf(ev('Backslash', 'sm'))).toBe('⇧⌘\\');
    expect(pressOf(ev('F5'))).toBe('F5');
    expect(pressOf(ev('ShiftLeft', 's'))).toBeNull();
    expect(normPress('⌘⇧⌥G')).toBe('⌥⇧⌘G');
  });
  it('to and from the accelerators of the menu bar; chords have none', () => {
    expect(toAccelerator('⇧⌘O')).toBe('Shift+CmdOrCtrl+KeyO');
    expect(toAccelerator('⌃⌥⌘←')).toBe('Control+Alt+CmdOrCtrl+ArrowLeft');
    expect(toAccelerator('⌘,')).toBe('CmdOrCtrl+Comma');
    expect(toAccelerator('⌘1')).toBe('CmdOrCtrl+Digit1');
    expect(toAccelerator('⌃C S')).toBeUndefined();
    expect(fromAccelerator('Shift+CmdOrCtrl+KeyI')).toBe('⇧⌘I');
    expect(fromAccelerator('Alt+CmdOrCtrl+KeyK')).toBe('⌥⌘K');
    expect(fromAccelerator('CmdOrCtrl+N')).toBe('⌘N');
    for (const c of KEY_COMMANDS)
      for (const k of [...(c.keys ?? []), ...(c.emacs ?? [])]) if (!k.includes(' ')) expect(fromAccelerator(toAccelerator(k)!), k).toBe(k);
  });
  it('a chord is told as two presses', () => {
    expect(chordNote('⌃C S')).toBe('Аккорд: ⌃C, затем S');
  });
});

describe('what may be recorded', () => {
  it('a modifier, F-keys alone; ⇧ + letter is typing; the system keeps its own', () => {
    expect(refusal('⌘E', 'window')).toBeNull();
    expect(refusal('⌃C', 'heading')).toBeNull();
    expect(refusal('F6', 'window')).toBeNull();
    expect(refusal('⇧A', 'window')).toMatch(/Нужна/);
    expect(refusal('A', 'editor')).toMatch(/Нужна/);
    expect(refusal('⌘Q', 'window')).toBe('Это сочетание занято macOS');
    expect(refusal('⌘Space', 'window')).toBe('Это сочетание занято macOS');
  });
  it('in the editor also ⇧ + arrows, Tab and ⇧Tab', () => {
    expect(refusal('⇧→', 'heading')).toBeNull();
    expect(refusal('⇥', 'heading')).toBeNull();
    expect(refusal('⇧⇥', 'editor')).toBeNull();
    expect(refusal('⇧→', 'window')).not.toBeNull();
  });
});

describe('sets and changes', () => {
  it('Emacs gives the ⌃C chords, macOS none; the rest is the same', () => {
    const e = bindingsOf(emacs);
    const m = bindingsOf(mac);
    expect(e.get('schedule')).toEqual(['⌃C S']);
    expect(e.get('status')).toEqual(['⌃C ⌃T']);
    expect(e.get('refile')).toEqual(['⌃C ⌃W']);
    expect(m.get('schedule')).toEqual([]);
    expect(e.get('find')).toEqual(m.get('find'));
  });
  it('a change is kept over the set; equal to the default it is not a change', () => {
    let s = withKeys(emacs, 'paletteGoto', ['⇧⌘O', '⌘P']);
    expect(bindingsOf(s).get('paletteGoto')).toEqual(['⇧⌘O', '⌘P']);
    expect(isModified(s, 'paletteGoto')).toBe(true);
    expect(modifiedCount(s)).toBe(1);
    s = withKeys(s, 'paletteGoto', ['⇧⌘O']);
    expect(s.overrides).toEqual({});
  });
  it('switching the set keeps the changes; one equal to the new default loses its dot', () => {
    const s = withKeys(mac, 'schedule', ['⌃C S']);
    expect(isModified(s, 'schedule')).toBe(true);
    const e = { ...s, preset: 'emacs' as const };
    expect(bindingsOf(e).get('schedule')).toEqual(['⌃C S']);
    expect(isModified(e, 'schedule')).toBe(false);
  });
  it('a removed shortcut is kept as an empty list', () => {
    const s = withKeys(emacs, 'find', []);
    expect(bindingsOf(s).get('find')).toEqual([]);
    expect(isModified(s, 'find')).toBe(true);
  });
  it('reads what it wrote, and drops what it does not know', () => {
    const s = withKeys(emacs, 'find', ['⌘⇧K']);
    expect(parseState(JSON.stringify(s))).toEqual({ preset: 'emacs', overrides: { find: ['⇧⌘K'] } });
    expect(parseState('{"preset":"mac","overrides":{"nope":["⌘1"],"find":[1,"⌘K"]}}')).toEqual({ preset: 'mac', overrides: { find: ['⌘K'] } });
    expect(parseState(null)).toEqual(emacs);
    expect(parseState('garbage')).toEqual(emacs);
  });
});

describe('clashes', () => {
  it('the defaults of both sets clash nowhere', () => {
    for (const s of [emacs, mac]) {
      const b = bindingsOf(s);
      for (const c of KEY_COMMANDS) for (const k of b.get(c.id)!) expect(conflictsOf(b, c.id, k), `${c.id} ${k}`).toEqual([]);
    }
  });
  it('same scope or window and editor clash; review over window and heading over editor do not', () => {
    const b = bindingsOf(emacs);
    expect(conflictsOf(b, 'refile', '⌘E')).toEqual([{ id: 'useSelection', key: '⌘E' }]);
    expect(conflictsOf(b, 'inbox.done', '⌘2')).toEqual([{ id: 'inbox.cancel', key: '⌘2' }]);
    expect(conflictsOf(b, 'inbox.done', '⌘1')).toEqual([]);
    expect(conflictsOf(b, 'statusNext', '⌥↩')).toEqual([]); // ⌥↩ is a new heading (editor) everywhere else
    expect(conflictsOf(b, 'followLink', '⌘F')).toEqual([{ id: 'find', key: '⌘F' }]);
  });
  it('a press that starts another command\'s chord clashes with it', () => {
    expect(clash('⌃C', '⌃C S')).toBe(true);
    expect(clash('⌃C S', '⌃C')).toBe(true);
    expect(clash('⌃C S', '⌃C D')).toBe(false);
    expect(conflictsOf(bindingsOf(emacs), 'find', '⌃C').map((c) => c.id)).toEqual(['status', 'schedule', 'deadline', 'tags', 'copyLink', 'refile']);
  });
  it('the review row says what its key does outside the review', () => {
    const b = bindingsOf(emacs);
    expect(outerNote(b, 'inbox.done')).toBe('Вне разбора ⌘1 — «Заметки»');
    expect(outerNote(b, 'inbox.back')).toBe('Вне разбора ⌘[ — «Назад»');
    expect(outerNote(b, 'find')).toBe('');
  });
});

describe('search', () => {
  it('a typed shortcut in symbols or words', () => {
    expect(queryKeys('⌘G')).toBe('⌘G');
    expect(queryKeys('cmd g')).toBe('⌘G');
    expect(queryKeys('shift cmd o')).toBe('⇧⌘O');
    expect(queryKeys('ctrl+c s')).toBe('⌃C S');
    expect(queryKeys('найти')).toBeNull();
  });
  it('by title, synonyms or shortcut', () => {
    const b = bindingsOf(emacs);
    const hit = (q: string) => KEY_COMMANDS.filter((c) => matchesQuery(c, b.get(c.id)!, q)).map((c) => c.id);
    expect(hit('найти далее')).toEqual(['findNext']);
    expect(hit('⌘G')).toEqual(['findNext']);
    expect(hit('cmd g')).toEqual(['findNext']);
    expect(hit('ctrl c s')).toEqual(['schedule', 'taskSchedule']); // in the text and in a list (ТЗ 34)
    expect(hit('refile')).toEqual(['refile', 'taskRefile']);
    expect(hit('ё')).toEqual(hit('е'));
  });
});

it('every command has a group and a title; ids are unique', () => {
  expect(new Set(KEY_COMMANDS.map((c) => c.id)).size).toBe(KEY_COMMANDS.length);
  expect(commandById.get('capture')?.scope).toBe('global');
});

describe('the Rust test of the menu bar', () => {
  // src-tauri/tests/menu_accelerators.rs parses every accelerator the menu may get: the defaults of both sets of the
  // commands in the menu (the window's and the global one), and every key a recorded shortcut may have. A typo there
  // would drop the whole native menu.
  const rs = readFileSync(new URL('../src-tauri/tests/menu_accelerators.rs', import.meta.url), 'utf8');
  const listOf = (name: string) => [...rs.slice(rs.indexOf(`let ${name} = [`)).split('];')[0].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  it('lists the defaults of the registry', () => {
    const want = new Set(['CmdOrCtrl+Q', 'Alt+CmdOrCtrl+Backslash']); // «Выйти», «Разделить вниз»: not configurable
    for (const c of KEY_COMMANDS.filter((x) => (x.scope === 'window' || x.scope === 'global') && !x.id.includes('.'))) // a plugin's: not in the menu
      for (const p of ['emacs', 'mac'] as const) for (const k of defaultsOf(c, p)) if (toAccelerator(k)) want.add(toAccelerator(k)!);
    expect(listOf('defaults').sort()).toEqual([...want].sort());
  });
  it('lists every key a recorded shortcut may have', () => {
    const codes = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => 'Key' + c).concat([...'0123456789'].map((d) => 'Digit' + d), Array.from({ length: 12 }, (_, i) => 'F' + (i + 1)));
    const named = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Space', 'Backspace', 'Delete', 'Escape', 'Home', 'End', 'PageUp', 'PageDown', 'Comma', 'Period', 'Slash', 'Backslash', 'BracketLeft', 'BracketRight', 'Semicolon', 'Quote', 'Minus', 'Equal', 'Backquote'];
    for (const c of [...codes, ...named]) expect(keyName(c), c).not.toBeNull();
    expect(listOf('codes').sort()).toEqual([...codes, ...named].sort());
    // and a press of each comes back as an accelerator with that code
    for (const c of named) expect(toAccelerator('⌘' + keyName(c))).toBe('CmdOrCtrl+' + c);
  });
});
