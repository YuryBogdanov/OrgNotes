// The core's controls in a plugin's element (ТЗ 27, roadmap 2.1 B): the calendar of three months, the choice of a
// place in columns, lines with lists — the very fields of the form (FormField.svelte), mounted where the plugin
// asks, its value in and out.

import { mount, unmount, untrack } from 'svelte';
import FormField from '../FormField.svelte';
import { WIDE, type Field } from '../settingsSchema';
import type { FormField as ApiField } from './index';

let seq = 0;
export function mountWidget(plugin: string, el: HTMLElement, field: ApiField, value: unknown, onChange: (v: unknown) => void, fail: (err: unknown) => void) {
  if (!WIDE.has(field.type)) throw new Error(`виджета «${field.type}» нет: только textarea, date, place, custom`);
  const props = $state({
    f: { ...field, where: 'local' } as unknown as Field,
    id: `pw-${plugin}-${++seq}`,
    values: { [field.key]: value } as Record<string, unknown>,
    set: (k: string, v: unknown) => {
      props.values = { ...untrack(() => props.values), [k]: v };
      try {
        onChange(v);
      } catch (err) {
        fail(err);
      }
    },
  });
  const app = mount(FormField, { target: el, props }) as { move(d: 1 | -1): void; focusList(w: 'file' | 'head'): void };
  return {
    // from a plugin's effect too: what is there is read without making that effect depend on it
    set: (v: unknown) => void (props.values = { ...untrack(() => props.values), [field.key]: v }),
    dispose: () => void unmount(app),
    move: (d: 1 | -1) => app.move(d),
    focusList: (w: 'file' | 'head') => app.focusList(w),
  };
}
