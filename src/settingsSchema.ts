// Settings by schema (roadmap 0.6): a feature describes its settings as data — groups of fields, each with a type,
// a label, a hint and where it is kept — and the core draws them (SchemaSettings.svelte) in the settings sheet's look.
// The feature keeps reading and writing its values; the schema only says what to show and how to change it.

/** A choice's option: the value as stored (null: unset), what is shown. */
export interface Opt {
  value: string | number | boolean | null;
  label: string;
  disabled?: boolean;
}
export type Values = Record<string, unknown>;
/** The notes folder (`.orgnotes/plugins/<id>.json`, goes with the notes) or this Mac (the look, the habits). */
export type Where = 'folder' | 'local';

interface Base {
  key: string;
  label: string;
  /** A line under the label; a function sees the values (a hint that follows the choice). */
  hint?: string | ((v: Values) => string);
  where: Where;
}
export type Field =
  /** Buttons in a row (a few short options) or a menu. */
  | (Base & { type: 'choice'; look: 'segments' | 'menu'; options: Opt[] | ((v: Values) => Opt[]) })
  | (Base & { type: 'switch' })
  /** A line of text, saved when left; `clean` tidies what was typed. */
  | (Base & { type: 'text'; placeholder?: string; clean?: (s: string) => string })
  /** A file of the folder, chosen with the core's picker («Выбрать…»); null is «not chosen», `clear` names it. */
  | (Base & { type: 'file'; show: (rel: string | null) => string; clear?: string })
  /** Two menus in one row («С 8:00 – До 20:00»): the second key is `key2`. */
  | (Base & { type: 'pair'; key2: string; labels: [string, string]; options: (v: Values) => [Opt[], Opt[]] });

export interface Group {
  caption: string;
  fields: Field[];
  help?: string;
}
export interface Schema {
  /** The prefix of the controls' ids (a feature's id). */
  id: string;
  /** The section's name for the screen reader. */
  label: string;
  groups: Group[];
  values(): Values;
  set(patch: Values): unknown;
}

/** The keys a schema keeps in a place: what the feature's storage splits by. */
export function keysOf(s: Pick<Schema, 'groups'>, where: Where): string[] {
  return s.groups.flatMap((g) => g.fields.filter((f) => f.where === where).flatMap((f) => (f.type === 'pair' ? [f.key, f.key2] : [f.key])));
}
/** Where a group's fields are kept, when they all are in one place (said under the group). */
export function whereOfGroup(g: Group): Where | null {
  const w = new Set(g.fields.map((f) => f.where));
  return w.size === 1 ? [...w][0] : null;
}
export const WHERE_NOTE: Record<Where, string> = { folder: 'Хранится в папке заметок.', local: 'Хранится на этом Mac.' };
export const hintOf = (f: Field, v: Values) => (typeof f.hint === 'function' ? f.hint(v) : f.hint);
export const optionsOf = (f: Extract<Field, { type: 'choice' }>, v: Values) => (typeof f.options === 'function' ? f.options(v) : f.options);
/** A menu's value for an option's: the text of it, unset as empty. */
export const optValue = (value: unknown) => (value == null ? '' : String(value));
/** The option's value for a menu's: back to its own type. */
export const optOf = (opts: Opt[], s: string) => opts.find((o) => optValue(o.value) === s)?.value ?? null;
