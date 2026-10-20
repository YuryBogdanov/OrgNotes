import { describe, expect, it } from 'vitest';
import { rekey } from './rekey';

describe('rekey', () => {
  const ren = (a: string, b: string) => (k: string) => (k === a ? b : k.startsWith(a + '/') ? b + k.slice(a.length) : k);

  it('a file renamed: its key follows, the others stay', () => {
    expect(rekey({ 'inbox.org': 'kanban.board', 'a.org': '' }, ren('inbox.org', 'Входящие.org'))).toEqual({ 'a.org': '', 'Входящие.org': 'kanban.board' });
  });
  it('a folder moved: every file inside follows', () => {
    expect(rekey({ 'p/a.org': 'x', 'p/q/b.org': 'y', 'pp.org': 'z' }, ren('p', 'arch/p'))).toEqual({ 'pp.org': 'z', 'arch/p/a.org': 'x', 'arch/p/q/b.org': 'y' });
  });
  it('trashed: dropped; nothing touched: null', () => {
    expect(rekey({ 'a.org': 'x', 'b.org': 'y' }, (k) => (k === 'a.org' ? null : k))).toEqual({ 'b.org': 'y' });
    expect(rekey({ 'a.org': 'x' }, (k) => k)).toBeNull();
  });
  it('moved onto a key that is there: the moved one wins', () => {
    expect(rekey({ 'a.org': 'x', 'b.org': 'y' }, (k) => (k === 'a.org' ? 'b.org' : k))).toEqual({ 'b.org': 'x' });
  });
});
