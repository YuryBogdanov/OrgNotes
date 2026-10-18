// Custom agendas («Мои агенды», `agendas` in config.json; tech sprint 2.4, from the store): the list, and the builder
// that edits a copy of one. The store owns one: it reads the list with the config and opens a saved agenda.

import { presetOf } from './builtinAgendas';
import { cloneAgenda, newAgenda, readAgendas, sameAgenda, withAgendas, type Agenda } from './agendas';
import type { Tab } from './layout';

/** What the store gives: a change of config.json, an agenda opened in the active pane. */
export interface AgendaHost {
  updateConfig(make: (raw: string | null) => string): Promise<boolean>;
  show(id: string): void;
}

export class AgendaStore {
  private host: AgendaHost;
  constructor(host: AgendaHost) {
    this.host = host;
  }
  /** The project's agendas, as config.json has them. */
  list = $state.raw<Agenda[]>([]);
  /** The agenda a tab shows (undefined: a file, or the built-in agenda). */
  of(t: Tab | undefined): Agenda | undefined {
    // the new interface's built-in ones («Неделя», «Сегодня», «Все задачи», ТЗ 45 §3.1) too: read-only
    return t?.kind === 'agenda' && t.agenda ? (this.list.find((a) => a.id === t.agenda) ?? presetOf(t.agenda)) : undefined;
  }
  /** The builder: an editable copy of the agenda; `orig` is null for a new one. */
  builder = $state<{ draft: Agenda; orig: Agenda | null; n: number } | null>(null);
  /** ⌘S while the builder is open: «Сохранить агенду» (the builder watches this). */
  builderSave = $state(0);
  /** «Новая агенда»: opens the builder with an empty agenda (nothing is saved until «Сохранить агенду»). */
  newAgendaInBuilder(from?: Element | null, draft?: Agenda) {
    if (this.builder) return;
    this.builderFrom = from ?? (document.activeElement as Element | null);
    this.builder = { draft: draft ?? newAgenda(), orig: null, n: Date.now() };
  }
  editAgenda(id: string, from?: Element | null) {
    const a = this.list.find((x) => x.id === id);
    if (!a || this.builder) return;
    this.builderFrom = from ?? (document.activeElement as Element | null);
    this.builder = { draft: cloneAgenda(a), orig: a, n: Date.now() };
  }
  /** Where the builder was opened from: the focus goes back there when it closes (a clicked button has none in WebKit). */
  private builderFrom: Element | null = null;
  private leaveBuilder() {
    this.builder = null;
    const el = this.builderFrom as HTMLElement | null;
    this.builderFrom = null;
    // after the window under the sheet takes input again
    if (el?.isConnected) setTimeout(() => el.isConnected && el.focus({ preventScroll: true }));
  }
  get builderDirty() {
    const b = this.builder;
    return !!b && (!b.orig || !sameAgenda(b.draft, b.orig));
  }
  closeBuilder() {
    this.leaveBuilder();
  }
  /** «Сохранить агенду»: writes it (a saved one is replaced whole), closes the builder and shows the agenda. */
  /** `keep` (the new interface's tab, ТЗ 48 §5): the builder stays open on the agenda saved, clean. */
  async saveAgenda(a: Agenda, o: { keep?: boolean } = {}): Promise<boolean> {
    const copy = cloneAgenda(a);
    const ok = await this.host.updateConfig((raw) => {
      const list = this.agendasIn(raw);
      const i = list.findIndex((x) => x.id === copy.id);
      if (i >= 0) list[i] = copy;
      else list.push(copy);
      return withAgendas(raw, list);
    });
    if (!ok) return false;
    if (o.keep && this.builder) {
      this.builder.orig = cloneAgenda(copy);
      return true;
    }
    this.leaveBuilder();
    this.host.show(copy.id);
    return true;
  }
  async deleteAgenda(id: string) {
    await this.host.updateConfig((raw) => withAgendas(raw, this.agendasIn(raw).filter((x) => x.id !== id)));
  }
  private agendasIn(raw: string | null): Agenda[] {
    try {
      return readAgendas(raw ? JSON.parse(raw)?.agendas : null);
    } catch {
      return [];
    }
  }
}
