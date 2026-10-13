// The blocks of «Сегодня» (ТЗ 32): a registry, as the shell's (views.ts) — the core's blocks and, later, the plugins'
// («Цели квартала»). The settings keep their order and which are on; the screen lays them out: the wide ones in the
// first row, the others in columns, a block that `attach`es going under the one before it.

import type { Component } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

export interface TodayBlockSpec {
  id: string;
  title: string;
  /** A line under its switch in the settings. */
  hint?: string;
  /** In the first row («Записка со вчера», «Главное на сегодня»). */
  wide?: boolean;
  /** Goes under the block before it, in its column («1-1 сегодня» under the agenda). */
  attach?: boolean;
  /** Drawn by its feature (none: one of the core's, drawn by the screen). */
  component?: Component;
  /** Nothing to show now: the block is left out and the others take its place. */
  empty?(): boolean;
}
const blocks = new SvelteMap<string, TodayBlockSpec>();
export function registerTodayBlock(b: TodayBlockSpec) {
  blocks.set(b.id, b);
  return () => void (blocks.get(b.id) === b && blocks.delete(b.id));
}
export const todayBlockOf = (id: string) => blocks.get(id);
export const allTodayBlocks = () => [...blocks.values()];

/** The blocks as the screen lays them out: the first row, then the columns. */
export function arrange(order: { id: string; on: boolean }[], shown: (id: string) => TodayBlockSpec | undefined): { top: string[]; cols: string[][] } {
  const top: string[] = [];
  const cols: string[][] = [];
  for (const o of order) {
    const b = o.on ? shown(o.id) : undefined;
    if (!b) continue;
    if (b.wide) top.push(b.id);
    else if (b.attach && cols.length) cols[cols.length - 1].push(b.id);
    else cols.push([b.id]);
  }
  return { top, cols };
}
