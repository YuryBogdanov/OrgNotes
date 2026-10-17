import { tick } from 'svelte';
import { plugins, type FormReq } from './api/host.svelte';
import type { Field, Group, Schema, Values } from './settingsSchema';

// The workings of a plugin's form (ТЗ 26 §5.2, ТЗ 27 §2.4) — the values, the plugin's say on a change, its check,
// its piece by the title, the answer — out of PluginSheets.svelte, so the old sheet and the new one (ТЗ 44 §4) are
// one form drawn twice. The component calls `effects()` once and draws `schema`.

export class PluginFormCtl {
  values = $state<Values>({});
  problem = $state('');
  /** The request the values are of (a new one starts them again). */
  private of: FormReq | null = null;
  private listeners = new Set<(v: Values) => void>();

  readonly schema = $derived.by((): Schema | null => {
    const r = plugins.form;
    if (!r) return null;
    const groups: Group[] = r.spec.groups.map((g) => ({
      caption: g.caption ?? '', help: g.help,
      fields: g.fields.map((f) => ({ ...f, where: 'local', ...(f.type === 'file' ? { show: (rel: string | null) => rel ?? 'Не выбран' } : {}), ...(f.type === 'pair' ? { options: () => f.options } : {}) }) as Field),
    }));
    return { id: 'pf', label: r.spec.title, groups, values: () => this.values, set: (patch) => this.set(patch) };
  });

  /** A change of the fields: the plugin may set more on it (a file chosen gives the name). */
  set(patch: Values) {
    const r = plugins.form;
    this.values = { ...this.values, ...patch };
    for (const k of Object.keys(patch)) {
      const more = r?.spec.onChange ? plugins.guard(r.plugin, () => r.spec.onChange!(k, this.values), undefined) : undefined;
      if (more && typeof more === 'object') this.values = { ...this.values, ...more };
    }
    for (const l of this.listeners) l(this.values);
  }

  /** The form's effects: the values of a new request, the plugin's piece right of the title (`extra()`), the focus
   *  on the first field (`first()`). */
  effects(extra: () => HTMLElement | undefined, first: () => HTMLElement | null | undefined) {
    $effect(() => {
      const r = plugins.form;
      if (r === this.of) return;
      this.of = r;
      if (!r) return;
      const v: Values = {};
      for (const g of r.spec.groups) for (const f of g.fields) for (const k of f.type === 'pair' ? [f.key, f.key2] : [f.key]) v[k] = r.spec.initial?.[k] ?? (f.type === 'switch' ? false : f.type === 'text' ? '' : null);
      this.values = v;
      this.problem = '';
      void tick().then(() => first()?.focus());
    });
    $effect(() => {
      const node = extra();
      const r = plugins.form;
      if (!node || !r?.spec.headerExtra) return;
      const ctrl = {
        values: () => this.values,
        set: (k: string, x: unknown) => this.set({ [k]: x }),
        onChange: (fn: (v: Values) => void) => {
          this.listeners.add(fn);
          return () => void this.listeners.delete(fn);
        },
      };
      const d = plugins.guard(r.plugin, () => r.spec.headerExtra!(node, ctrl), undefined);
      return () => {
        plugins.guard(r.plugin, () => d?.(), undefined);
        node.replaceChildren();
      };
    });
  }

  /** The answer to the plugin: the values, or null (cancelled). */
  answer(v: Values | null) {
    const r = plugins.form;
    if (!r) return;
    plugins.form = null;
    r.resolve(v);
  }
  /** «Создать»: the plugin's check first; its reason stays under the fields. */
  submit() {
    const r = plugins.form;
    if (!r) return;
    const why = r.spec.validate ? plugins.guard(r.plugin, () => r.spec.validate!(this.values), null) : null;
    if (why) this.problem = why;
    else this.answer(JSON.parse(JSON.stringify(this.values)));
  }
  /** The form's keys: ⎋ cancels, ↩ in a line (⌘↩ anywhere) sends — a text field gives its value first. */
  key(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.answer(null);
    } else if (e.key === 'Enter' && (e.metaKey || (e.target as HTMLElement).tagName === 'INPUT')) {
      e.preventDefault();
      (e.target as HTMLElement).blur?.();
      void tick().then(() => this.submit());
    }
  }
}

/** A plugin's own sheet (`ui.sheet`) on the window's keys: the focus may be back in the editor after the palette
 *  that opened it. ⎋ closes it, ↩ (⌘↩ in a field) presses its primary button; a bare sheet keeps its own keys. */
export function pluginSheetKey(e: KeyboardEvent) {
  const r = plugins.sheetReq;
  if (!r || r.spec.bare || plugins.form || plugins.trustReq) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    r.resolve(null);
  } else if (e.key === 'Enter' && (e.metaKey || !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement))) {
    const p = r.spec.buttons?.find((b) => b.primary);
    if (p) {
      e.preventDefault();
      r.resolve(p.id);
    }
  }
}

/** The answer to `ui.place`: the place chosen as the plugin sees it (a relative path), or why it cannot be. */
export function placePicked(x: { path: string; heading: { line: number; title: string } | null }, rel: string | undefined) {
  const p = plugins.place;
  if (!p) return;
  if (!rel) return 'Файл не найден';
  plugins.place = null;
  p.resolve(x.heading ? { path: rel, line: x.heading.line, title: x.heading.title } : { path: rel });
}
export function placeClosed(p: NonNullable<typeof plugins.place>) {
  if (plugins.place !== p) return;
  plugins.place = null;
  p.resolve(null);
}

/** A plugin's own sheet drawn into `node`; then the focus, if the plugin took none, on `focus()` (its primary button,
 *  as a macOS sheet, so ⎋ and ↩ reach it). The returned function takes it down. */
export function mountPluginSheet(node: HTMLElement, r: NonNullable<typeof plugins.sheetReq>, focus: () => HTMLElement | null | undefined) {
  const d = plugins.guard(r.plugin, () => r.spec.render(node, { close: (b?: string) => r.resolve(b ?? null) }), undefined);
  void tick().then(() => {
    if (!r.spec.bare && !node.contains(document.activeElement)) focus()?.focus();
  });
  return () => {
    plugins.guard(r.plugin, () => d?.(), undefined);
    node.replaceChildren();
  };
}
