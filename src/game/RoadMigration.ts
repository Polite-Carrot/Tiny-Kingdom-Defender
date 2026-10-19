// Realms that lost roads (a realm never has more roads than its place in the list) have a
// different pad layout, since pads are laid out around every road. This moves a saved kingdom
// onto the new layout square by square: towers, cleared pads and heroes stay where they stood.

import type { Road } from '../data/base';
import { MAP_BY_ID, type MapId } from '../data/maps';
import type { BaseSnapshot } from './Run';
import { buildRealmMap, initialSpots, kingdomMap } from './Siege';

export interface Layout {
  roads: Road[];
  /** Whether pads could stand a square further out (see LevelMap). */
  wide: boolean;
}

const narrow = (roads: Road[]): Layout => ({ roads, wide: false });

/**
 * The layouts realms had in older save versions (only realms that changed afterwards).
 * LAYOUTS[v][id] is what a version-v save of that realm was laid out around.
 */
export const LAYOUTS: Record<number, Partial<Record<MapId, Layout>>> = {
  4: {
    vale: narrow([
      { name: 'West Road', openWave: 0, points: [[-1, 1], [5, 1], [5, 4], [1, 4], [1, 12], [5, 12], [5, 7], [7, 7]] },
      { name: 'North-East Road', openWave: 20, points: [[12, -1], [12, 2], [8, 2], [8, 5], [12, 5], [12, 7], [7, 7]] },
      { name: 'South Road', openWave: 40, points: [[9, 15], [9, 13], [13, 13], [13, 9], [7, 9], [7, 7]] },
    ]),
    serpent: narrow([
      { name: 'Serpent Road', openWave: 0, points: [[-1, 1], [12, 1], [12, 4], [2, 4], [2, 7], [12, 7], [12, 10], [7, 10], [7, 12]] },
      { name: 'East Gate', openWave: 20, points: [[15, 13], [10, 13], [10, 12], [7, 12]] },
      { name: 'West Gate', openWave: 40, points: [[-1, 13], [3, 13], [3, 11], [5, 11], [5, 12], [7, 12]] },
    ]),
    winds: narrow([
      { name: 'North Road', openWave: 0, points: [[7, -1], [7, 2], [4, 2], [4, 5], [7, 5], [7, 7]] },
      { name: 'East Road', openWave: 15, points: [[15, 7], [12, 7], [12, 10], [9, 10], [9, 7], [7, 7]] },
      { name: 'South Road', openWave: 30, points: [[7, 15], [7, 13], [4, 13], [4, 10], [7, 10], [7, 7]] },
      { name: 'West Road', openWave: 45, points: [[-1, 4], [2, 4], [2, 9], [5, 9], [5, 7], [7, 7]] },
    ]),
    coil: narrow([
      { name: 'The Coil', openWave: 0, points: [[-1, 1], [15, 1], [15, 15], [1, 15], [1, 3], [13, 3], [13, 13], [3, 13], [3, 5], [11, 5], [11, 11], [5, 11], [5, 7], [9, 7], [9, 9], [8, 9], [8, 8]] },
      { name: 'The Breach', openWave: 30, points: [[17, 8], [8, 8]] },
    ]),
    gauntlet: narrow([
      { name: 'The Gauntlet', openWave: 0, points: [[-1, 1], [17, 1], [17, 5], [1, 5], [1, 9], [17, 9], [17, 13], [1, 13], [1, 17], [9, 17]] },
      { name: 'Back Door', openWave: 40, points: [[19, 17], [9, 17]] },
    ]),
  },
  5: {
    serpent: {
      wide: true,
      roads: [
        { name: 'Serpent Road', openWave: 0, points: [[-1, 1], [12, 1], [12, 4], [2, 4], [2, 7], [12, 7], [12, 10], [7, 10], [7, 12]] },
        { name: 'East Gate', openWave: 20, points: [[15, 13], [10, 13], [10, 12], [7, 12]] },
      ],
    },
    coil: narrow([
      { name: 'The Coil', openWave: 0, points: [[-1, 1], [15, 1], [15, 15], [1, 15], [1, 3], [13, 3], [13, 13], [3, 13], [3, 5], [11, 5], [11, 11], [5, 11], [5, 7], [9, 7], [9, 9], [8, 9], [8, 8]] },
      { name: 'The Breach', openWave: 30, points: [[17, 8], [8, 8]] },
    ]),
    gauntlet: narrow([
      { name: 'The Gauntlet', openWave: 0, points: [[-1, 1], [17, 1], [17, 5], [1, 5], [1, 9], [17, 9], [17, 13], [1, 13], [1, 17], [9, 17]] },
      { name: 'Back Door', openWave: 60, points: [[19, 17], [9, 17]] },
    ]),
  },
  6: {
    vale: { wide: true, roads: [{ name: 'West Road', openWave: 0, points: [[-1, 1], [5, 1], [5, 4], [1, 4], [1, 12], [5, 12], [5, 7], [7, 7]] }] },
  },
  7: {
    serpent: {
      wide: true,
      roads: [
        { name: 'Serpent Road', openWave: 0, points: [[-1, 1], [12, 1], [12, 4], [2, 4], [2, 7], [12, 7], [12, 10], [7, 10], [7, 12]] },
        { name: 'East Gate', openWave: 20, points: [[14, -1], [14, 13], [9, 13], [9, 12], [7, 12]] },
      ],
    },
  },
};

/** The layout a realm had in save version `v` (the current one if it hasn't changed since). */
export function layoutAt(v: number, id: MapId): Layout | null {
  for (let k = v; LAYOUTS[k]; k++) if (LAYOUTS[k][id]) return LAYOUTS[k][id]!;
  return null;
}

/** Moves every saved kingdom in a version-`v` save onto the version-(v+1) layouts. */
export function migrateLayouts(v: number, base: BaseSnapshot, id: MapId): BaseSnapshot {
  const from = LAYOUTS[v]?.[id];
  if (!from) return base;
  return remapBase(id, base, from, layoutAt(v + 1, id));
}

/** Moves a kingdom from one layout of a realm onto another (null: its current layout). */
export function remapBase(id: MapId, base: BaseSnapshot, from: Layout, to: Layout | null): BaseSnapshot {
  const def = MAP_BY_ID[id];
  const oldMap = buildRealmMap(def, from.roads, from.wide);
  const newMap = to ? buildRealmMap(def, to.roads, to.wide) : kingdomMap(id);
  const at = new Map(newMap.buildSpots.map((s) => [`${s.col},${s.row}`, s.index]));
  const move = (i: number): number => {
    const s = oldMap.buildSpots[i];
    return s ? at.get(`${s.col},${s.row}`) ?? -1 : -1;
  };
  const towers = base.towers.map((t) => ({ ...t, spot: move(t.spot) }));
  // A tower whose square became road moves to the nearest free square instead of being lost.
  const taken = new Set(towers.map((t) => t.spot).filter((i) => i >= 0));
  base.towers.forEach((t, k) => {
    if (towers[k].spot >= 0) return;
    const from = oldMap.buildSpots[t.spot];
    let best = -1, bd = Infinity;
    for (const sp of newMap.buildSpots) {
      if (taken.has(sp.index) || !from) continue;
      const d = (sp.col - from.col) ** 2 + (sp.row - from.row) ** 2;
      if (d < bd) { bd = d; best = sp.index; }
    }
    towers[k].spot = best;
    if (best >= 0) taken.add(best);
  });
  const kept = towers.filter((t) => t.spot >= 0);
  const spots = new Set(base.spots.map(move).filter((i) => i >= 0));
  // Every tower stands on an unlocked pad, and the new layout's starting pads come free.
  for (const t of kept) spots.add(t.spot);
  const startRoads = (to ? to.roads : def.roads).map((r, i) => (r.openWave === 0 ? i : -1)).filter((i) => i >= 0);
  for (const i of initialSpots(newMap, startRoads)) spots.add(i);
  // A hero whose pad became road goes back to the castle wall (a free move later).
  const post = (p: number | undefined) => (p === undefined || p < 0 ? p : move(p) >= 0 && !taken.has(move(p)) ? move(p) : -1);
  return {
    ...base,
    towers: kept,
    spots: [...spots],
    // Barricades on a road that is gone come down.
    barricades: base.barricades?.filter((b) => newMap.isPath(b.col, b.row)),
    heroPost: post(base.heroPost),
    hero2Post: post(base.hero2Post),
  };
}
