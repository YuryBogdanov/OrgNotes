// ⌃C ⌃L «Ссылка на заголовок…» and «Изменить ссылку…» (ТЗ 35 §3): the palette «Ссылка на» for the editor. Here and
// not in the store: it needs the palette's steps, which need the store.

import { store } from './store.svelte';
import { linkStep } from './commands';
import { linkHooks, relTarget } from './linkEdit';

linkHooks.pick = (o) => {
  const make = (target: string, label: string | null) => (label ? `[[${target}][${label}]]` : `[[${target}]]`);
  const here = linkHooks.rel(o.path);
  store.openStep(
    linkStep({
      sel: o.sel,
      edit: o.edit,
      heading: (path, line, own) => {
        const p = store.headingLinkPlan(path, line);
        if (!p) return;
        const label = o.edit ? o.edit.label : own || !o.sel ? p.label : o.sel;
        o.apply(make(relTarget(p.target, here), label));
        void p.write?.(); // the :ID: after the link is in: the editor's positions stay as they were
      },
      address: (addr) => o.apply(make(relTarget(addr, here), o.edit ? o.edit.label : o.sel || null)),
    }),
  );
};
