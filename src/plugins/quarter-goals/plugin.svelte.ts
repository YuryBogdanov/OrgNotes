// The plugin «quarter-goals» (ТЗ 27): what it adds — the section «Цели», the tab of the overview and of a person, the
// commands, the set of statuses «Цели на квартал» — and how it follows the notes.

import type { HeadingRef } from '@panopticon/api';
import { definePlugin, type Ctx } from '@panopticon/api';
import { mount, unmount } from 'svelte';
import { core } from './core.svelte';
import { goals, OVERVIEW, splitView } from './state.svelte';
import { GOALS_WORKFLOW, GOAL_STATES, goalsIn, isDone, oneOnOneLine, quarterOf, todayPerson } from './goals';
import Card from './Card.svelte';
import { openAdd, openForm, startReview } from './actions';
import Overview from './Overview.svelte';
import Panel from './Panel.svelte';
import Today from './Today.svelte';
import './styles.css';

/** The name of a goals tab: the overview or a person. */
const label = (state: string | null) => {
  const key = splitView(state).key;
  return key === '*' ? 'Обзор квартала' : (goals.goalPeople.find((p) => p.key === key)?.name ?? 'Цели');
};

/** «Цели на квартал»: the goals' statuses once there are goals, while no set of the project knows ACTIVE. */
let setsOn: boolean | null = null;
function statusSets(ctx: Ctx) {
  setsOn = goals.goalSources.length > 0;
  ctx.statusSets.set(
    goals.goalSources.length
      ? [{ name: GOALS_WORKFLOW.name, states: GOALS_WORKFLOW.states.map((x) => ({ name: x.name, done: !!(x as { done?: boolean }).done, color: x.color as never })) }]
      : [],
    { ifMissing: true },
  );
}

export default definePlugin({
  async activate(ctx) {
    core.ctx = ctx;
    goals.ctx = ctx;
    goals.readStored();
    statusSets(ctx);
    await core.load();
    ctx.exports({ myActiveGoals: () => goals.myActiveGoals() });

    // the sources and the thresholds changed (here, or the notes folder): read again
    const stored = () => {
      goals.readStored();
      if (setsOn !== goals.goalSources.length > 0) {
        statusSets(ctx);
        void core.load(); // the statuses of the files changed
      }
    };
    ctx.storage.folder.onChange(stored);
    ctx.settings.onChange(stored);
    ctx.events.on('file.changed', (p) => void core.refresh((p as { path: string }).path));
    ctx.events.on('folder.changed', () => {
      goals.readStored();
      statusSets(ctx);
      void core.load();
    });
    ctx.events.on('tab.active', (p) => {
      core.active = p as typeof core.active;
    });

    // the section, the tab
    ctx.ui.navSection('quarter-goals', (el) => {
      const app = mount(Panel, { target: el });
      return () => void unmount(app);
    });
    ctx.ui.view<string | null>(OVERVIEW, {
      title: (key) => label(key),
      crumbs: (key) => ['Цели', label(key)],
      restore: (raw) => (typeof raw === 'string' && raw ? raw : '*'),
      render: (el, state, tab) => {
        const v = splitView(state);
        const app = mount(Overview, { target: el, props: { who: v.key, wheel: v.wheel, setWheel: (on: boolean) => tab.setState(on ? v.key + '~wheel' : v.key) } });
        return () => void unmount(app);
      },
    });

    // the commands: offered only when they can run
    ctx.commands.on('quarter-goals.new', () => openForm());
    ctx.commands.on('quarter-goals.overview', () => goals.openGoals('*'));
    ctx.commands.on('quarter-goals.add', () => openAdd());
    ctx.commands.on('quarter-goals.review', async () => {
      const people = goals.goalPeople.filter((p) => p.found);
      const key = await ctx.ui.choose({ title: 'Разбор целей квартала на 1-1', placeholder: 'Чьи цели разобрать', items: people.map((p) => ({ id: p.key, label: p.name, hint: p.src.file.split('/').pop() })) });
      if (key) await startReview(key);
    });
    goals.watchAvailable();
    goals.watchBadge();

    // «Сегодня» (ТЗ 32): the block of goals; the goals' line and «Разбор целей» on a card of 1-1
    ctx.ui.todayBlock('quarter-goals.today', (el, block) => {
      const app = mount(Today, { target: el, props: { hide: (h: boolean) => block.setHidden(h) } });
      return () => void unmount(app);
    });
    const personOf = (path: string) => goals.goalPeople.find((p) => p.found && !p.src.me && p.src.file === path);
    ctx.ui.oneOnOne({
      line: (path) => {
        const p = personOf(path);
        return p ? oneOnOneLine(todayPerson(p.data, quarterOf(new Date()), new Date(), goals.goalSettings.silent), goals.goalSettings.silent) : null;
      },
      action: { label: 'Разбор целей', available: (path) => !!personOf(path), run: (path) => void (personOf(path) && startReview(personOf(path)!.key)) },
    });
    // the card of a file of goals (ТЗ 44 §5): the person's goals of the quarter, the silent one, the 1-1's review
    const sourceOf = (path: string) => goals.goalPeople.find((x) => x.found && x.src.file === path);
    const cards = new WeakMap<HTMLElement, { path: string; heading: HeadingRef | null }>();
    ctx.ui.fileCard('quarter-goals.card', {
      match: (path) => !!sourceOf(path),
      count: (path) => {
        const p = sourceOf(path);
        return p ? goalsIn(p.data, quarterOf(new Date())).filter((g) => !isDone(g, [GOAL_STATES.done])).length || null : null;
      },
      render: (el, c) => {
        const at = cards.get(el);
        if (at) return void Object.assign(at, c);
        const fresh = $state({ path: c.path, heading: c.heading });
        cards.set(el, fresh);
        const app = mount(Card, { target: el, props: { at: fresh, person: () => sourceOf(fresh.path) } });
        return () => {
          void unmount(app);
          cards.delete(el);
        };
      },
    });
    // «действия с задачей» (ТЗ 34): a goal chosen in a list — the agenda, «Сегодня», the board
    ctx.ui.taskAction({ label: 'Добавить отметку…', when: (h) => !!goals.goalAt(h.ref), run: (ref) => void goals.markFromList(ref) });
  },
});
