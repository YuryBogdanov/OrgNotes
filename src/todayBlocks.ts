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
  /** A row of its own, the screen's whole width, where the order puts it (a plugin's banner, «Цели недели»). */
  full?: boolean;
  /** Where it goes in the order when it is new there: before or after this block (else at the end). */
  before?: string;
  after?: string;
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

export type Row = { kind: 'top'; ids: string[] } | { kind: 'full'; id: string } | { kind: 'cols'; cols: string[][] };
/**
 * The blocks as the screen lays them out: the first row (the wide ones), then the columns; a `full` block is a row
 * of its own where the order puts it (above the first row, between it and the columns…). `top` and `cols` — all of
 * them, as before the full rows came.
 */
export function arrange(order: { id: string; on: boolean }[], shown: (id: string) => TodayBlockSpec | undefined): { top: string[]; cols: string[][]; rows: Row[] } {
  const top: string[] = [];
  const cols: string[][] = [];
  const rows: Row[] = [];
  let topRow: { kind: 'top'; ids: string[] } | null = null;
  let colRow: { kind: 'cols'; cols: string[][] } | null = null;
  for (const o of order) {
    const b = o.on ? shown(o.id) : undefined;
    if (!b) continue;
    if (b.full) {
      rows.push({ kind: 'full', id: b.id });
      topRow = colRow = null;
    } else if (b.wide) {
      top.push(b.id);
      if (!topRow) rows.push((topRow = { kind: 'top', ids: [] }));
      topRow.ids.push(b.id);
    } else {
      const attach = b.attach && cols.length && colRow?.cols.length;
      if (attach) {
        cols[cols.length - 1].push(b.id);
        colRow!.cols[colRow!.cols.length - 1].push(b.id);
      } else {
        cols.push([b.id]);
        if (!colRow) rows.push((colRow = { kind: 'cols', cols: [] }));
        colRow.cols.push([b.id]);
      }
    }
  }
  return { top, cols, rows };
}
/** The order with the blocks new to it put where they ask (`before` / `after` a block), else at the end. */
export function withNew(saved: { id: string; on: boolean }[], all: TodayBlockSpec[]): { id: string; on: boolean }[] {
  const out = [...saved];
  for (const b of all) {
    if (out.some((s) => s.id === b.id)) continue;
    const at = b.before ? out.findIndex((s) => s.id === b.before) : b.after ? out.findIndex((s) => s.id === b.after) + 1 : -1;
    if (at >= 0 && (b.before || at > 0)) out.splice(at, 0, { id: b.id, on: true });
    else out.push({ id: b.id, on: true });
  }
  return out;
}
