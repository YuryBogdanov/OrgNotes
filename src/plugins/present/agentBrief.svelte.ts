// «Презентация», the brief for AI agents (fix-59-1 §5): `.orgnotes/agents/presentation.md` in the notes folder — made
// with the standard text when there is none; brought up to a new standard text by itself while the user has not
// changed it (the text last written by the plugin is kept in the folder's storage), else only said («есть новая
// версия»). Edited in «Настройки → Презентация → ИИ-АГЕНТЫ», copied from there and from the palette.

import STANDARD from './agent-brief.md?raw';
import { present } from './state.svelte';

export const BRIEF = 'presentation';
export { STANDARD };

class Brief {
  /** The file's text as last read or written; null — not read yet. */
  text = $state<string | null>(null);
  /** The standard text changed since the user changed theirs. */
  newer = $state(false);

  private get ctx() {
    return present.ctx;
  }
  private base(): string | null {
    return this.ctx.storage.folder.get<{ base?: string }>()?.base ?? null;
  }
  private async setBase(base: string) {
    await this.ctx.storage.folder.set({ ...(this.ctx.storage.folder.get<Record<string, unknown>>() ?? {}), base });
  }
  /** On the plugin's start and on another folder: the file made, or brought up to the standard text. */
  async ensure() {
    const a = this.ctx.agents;
    if (!a) return;
    const now = await a.read(BRIEF).catch(() => null);
    const base = this.base();
    if (now === null) {
      await a.write(BRIEF, STANDARD).catch(() => {});
      await this.setBase(STANDARD);
      this.text = STANDARD;
      this.newer = false;
      return;
    }
    if (base !== null && now === base && base !== STANDARD) {
      // not changed by the user: the new standard text
      await a.write(BRIEF, STANDARD).catch(() => {});
      await this.setBase(STANDARD);
      this.text = STANDARD;
      this.newer = false;
      return;
    }
    if (base === null && now === STANDARD) await this.setBase(STANDARD);
    this.text = now;
    this.newer = base !== null && base !== STANDARD && now !== base;
  }
  /** The file read again (the settings' section opened: it may have been changed outside). */
  async reload() {
    const t = await this.ctx.agents?.read(BRIEF).catch(() => null);
    if (t !== undefined && t !== null) this.text = t;
  }
  async save(text: string) {
    this.text = text;
    await this.ctx.agents?.write(BRIEF, text);
  }
  async restore() {
    await this.save(STANDARD);
    await this.setBase(STANDARD);
    this.newer = false;
  }
  async copy() {
    const t = this.text ?? (await this.ctx.agents?.read(BRIEF).catch(() => null)) ?? STANDARD;
    await this.ctx.clipboard?.write(t);
    this.ctx.ui.notify('Бриф скопирован');
  }
}

export const brief = new Brief();
