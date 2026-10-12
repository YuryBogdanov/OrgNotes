// The plugin «quarter-goals» (ТЗ 27): what it adds — the section «Цели», the tab of the overview and of a person, the
// commands, the set of statuses «Цели на квартал» — and how it follows the notes.

import { definePlugin, type Ctx } from '@panopticon/api';
import { mount, unmount } from 'svelte';
import { core } from './core.svelte';
import { goals, OVERVIEW } from './state.svelte';
import { GOALS_WORKFLOW } from './goals';
import { openAdd, openForm, startReview } from './actions';
import Overview from './Overview.svelte';
import Panel from './Panel.svelte';
import './styles.css';

/** The name of a goals tab: the overview or a person. */
const label = (key: string | null) => (!key || key === '*' ? 'Обзор квартала' : (goals.goalPeople.find((p) => p.key === key)?.name ?? 'Цели'));

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
      render: (el, state) => {
        const app = mount(Overview, { target: el, props: { who: state } });
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
  },
});
