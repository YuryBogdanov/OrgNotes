// The terminal's profiles (ТЗ 55 §6): a saved launch — a name, a command (empty: the shell), its arguments, a folder
// (the notes folder by default), variables; one of them by default. On this Mac (`storage.local`): commands and paths
// are the machine's. Two to begin with: «Оболочка» (by default) and an empty «Агент».

import type { Ctx, Values } from '@panopticon/api';
import type { Launch } from './sessions.svelte';

export interface Profile {
  id: string;
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  isDefault: boolean;
}
const START: Profile[] = [
  { id: 'shell', name: 'Оболочка', command: '', args: [], cwd: '', env: {}, isDefault: true },
  { id: 'agent', name: 'Агент', command: '', args: [], cwd: '', env: {}, isDefault: false },
];
/** «KEY=value» a line each, the comments and empty lines left out. */
export function envOf(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of text.split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(l);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
export const envText = (env: Record<string, string>) => Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n');
/** «agent --resume» → the command and its arguments (quotes keep spaces). */
export function splitCommand(s: string): { command: string; args: string[] } {
  const parts = [...s.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  return { command: parts[0] ?? '', args: parts.slice(1) };
}
export const commandLine = (p: Pick<Profile, 'command' | 'args'>) => [p.command, ...p.args.map((a) => (/\s/.test(a) ? `"${a}"` : a))].filter(Boolean).join(' ');

class Profiles {
  list = $state<Profile[]>(START);
  private ctx!: Ctx;
  init(ctx: Ctx) {
    this.ctx = ctx;
    this.read();
    ctx.storage.local.onChange(() => this.read());
  }
  private read() {
    const v = this.ctx.storage.local.get<{ profiles?: Profile[] }>()?.profiles;
    if (Array.isArray(v) && v.length) this.list = v;
  }
  private save() {
    void this.ctx.storage.local.set({ ...(this.ctx.storage.local.get<object>() ?? {}), profiles: $state.snapshot(this.list) });
  }
  get default() {
    return this.list.find((p) => p.isDefault) ?? this.list[0];
  }
  launchOf(p: Profile): Launch {
    const name = p.command ? p.command.split('/').pop()! : p.name === 'Оболочка' ? 'zsh' : p.name;
    return { name, ...(p.command ? { command: p.command, args: p.args } : {}), ...(p.cwd ? { cwd: p.cwd } : {}), ...(Object.keys(p.env).length ? { env: p.env } : {}) };
  }
  /** «+ Профиль…» or «Изменить…»: the form; the profile kept (null: cancelled). */
  async edit(p?: Profile): Promise<Profile | null> {
    const v: Values | null = await this.ctx.ui.form({
      title: p ? `Профиль «${p.name}»` : 'Новый профиль',
      submit: 'Сохранить',
      initial: { name: p?.name ?? '', command: p ? commandLine(p) : '', cwd: p?.cwd ?? '', env: p ? envText(p.env) : '', isDefault: p?.isDefault ?? false },
      groups: [
        {
          fields: [
            { type: 'text', key: 'name', label: 'Имя', placeholder: 'Агент' },
            { type: 'text', key: 'command', label: 'Команда', placeholder: 'например, имя консольного агента', hint: 'Пусто — оболочка пользователя' },
            { type: 'text', key: 'cwd', label: 'Папка', placeholder: 'рабочая папка', hint: 'Путь; пусто — рабочая папка' },
            { type: 'textarea', key: 'env', label: 'Переменные', placeholder: 'KEY=value — по строке' },
            { type: 'switch', key: 'isDefault', label: 'Профиль по умолчанию' },
          ],
        },
      ],
      validate: (x) => (String(x.name ?? '').trim() ? null : 'Нужно имя'),
    });
    if (!v) return null;
    const { command, args } = splitCommand(String(v.command ?? ''));
    const next: Profile = { id: p?.id ?? `p${Date.now().toString(36)}`, name: String(v.name).trim(), command, args, cwd: String(v.cwd ?? '').trim(), env: envOf(String(v.env ?? '')), isDefault: !!v.isDefault };
    let list = p ? this.list.map((x) => (x.id === p.id ? next : x)) : [...this.list, next];
    if (next.isDefault) list = list.map((x) => ({ ...x, isDefault: x.id === next.id }));
    else if (!list.some((x) => x.isDefault)) list[0] = { ...list[0], isDefault: true };
    this.list = list;
    this.save();
    return next;
  }
  remove(id: string) {
    let list = this.list.filter((p) => p.id !== id);
    if (!list.length) list = [START[0]];
    if (!list.some((x) => x.isDefault)) list[0] = { ...list[0], isDefault: true };
    this.list = list;
    this.save();
  }
  makeDefault(id: string) {
    this.list = this.list.map((x) => ({ ...x, isDefault: x.id === id }));
    this.save();
  }
}
export const profiles = new Profiles();
