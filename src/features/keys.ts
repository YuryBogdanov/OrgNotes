// The shortcuts of the built-in features (roadmap 0.3). The Inbox and its review, the goals of the quarter and the
// calendar became plugins (ТЗ 27–29): their keys are in their manifests. Here: the mini window's (ТЗ 31). The tests
// of keys import this module as the app does.

import { C, registerGroup, registerKeys, registerScope } from '../keys';

// ---- the mini window: one system-wide key, and the keys of its own window ------------------------------------------
registerGroup({ id: 'mini', title: 'МИНИ-ОКНО', note: 'только в мини-окне' });
registerScope({ id: 'mini', name: 'в мини-окне', over: ['window', 'editor', 'heading'], outside: { scopes: ['window'], word: 'В главном окне' }, rank: 5, alone: true });
registerKeys([
  // ⌃⌥Space of the spec switches the input source on macOS: ⌃⌥⌘M (ТЗ 31, decision 3)
  C('miniShow', 'Показать мини-окно и писать', 'global', 'global', ['⌃⌥⌘M'], { synonyms: ['мини-окно', 'поверх', 'созвон'], after: 'capture' }),
  C('miniBack', 'Вернуть фокус в предыдущую программу', 'mini', 'mini', ['⎋'], { note: 'Когда в мини-окне нечего закрывать' }),
  C('miniPalette', 'Сменить заметку', 'mini', 'mini', ['⌘P']),
  C('miniHide', 'Скрыть мини-окно', 'mini', 'mini', ['⌘W']),
]);
