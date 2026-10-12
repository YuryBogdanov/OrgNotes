import { describe, expect, it } from 'vitest';
import { listEnter, listIndent } from './textList';

const at = (s: string) => ({ value: s.replace('|', ''), caret: s.indexOf('|') });
const show = (e: { value: string; caret: number } | null) => (e ? e.value.slice(0, e.caret) + '|' + e.value.slice(e.caret) : null);

describe('lists in a text field', () => {
  it('↩ in an item makes the next one, with its indent; numbers go on', () => {
    const a = at('План:\n- раз|');
    expect(show(listEnter(a.value, a.caret))).toBe('План:\n- раз\n- |');
    const b = at('  - вложенный|');
    expect(show(listEnter(b.value, b.caret))).toBe('  - вложенный\n  - |');
    const c = at('1. первый|');
    expect(show(listEnter(c.value, c.caret))).toBe('1. первый\n2. |');
  });
  it('↩ in an empty item leaves the list; outside a list it is a plain new line', () => {
    const a = at('- раз\n- |');
    expect(show(listEnter(a.value, a.caret))).toBe('- раз\n|');
    const b = at('просто текст|');
    expect(listEnter(b.value, b.caret)).toBeNull();
  });
  it('⇥ moves the line in, ⇧⇥ out; nothing to move out: nothing', () => {
    const a = at('- раз\n- дв|а');
    expect(show(listIndent(a.value, a.caret, 1))).toBe('- раз\n  - дв|а');
    const b = at('- раз\n  - дв|а');
    expect(show(listIndent(b.value, b.caret, -1))).toBe('- раз\n- дв|а');
    const c = at('- дв|а');
    expect(listIndent(c.value, c.caret, -1)).toBeNull();
  });
});
