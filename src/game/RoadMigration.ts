// Realms that lost roads (a realm never has more roads than its place in the list) have a
// different pad layout, since pads are laid out around every road. This moves a saved kingdom
// onto the new layout square by square: towers, cleared pads and heroes stay where they stood.

import type { Road } from '../data/base';
import { MAP_BY_ID, type MapId } from '../data/maps';
import type { BaseSnapshot } from './Run';
import { buildRealmMap, initialSpots, kingdomMap } from './Siege';

/** The roads these realms had before (saves from version 4 were laid out around them). */
export const LEGACY_ROADS: Partial<Record<MapId, Road[]>> = {
  vale: [
    { name: 'West Road', openWave: 0, points: [[-1, 1], [5, 1], [5, 4], [1, 4], [1, 12], [5, 12], [5, 7], [7, 7]] },
    { name: 'North-East Road', openWave: 20, points: [[12, -1], [12, 2], [8, 2], [8, 5], [12, 5], [12, 7], [7, 7]] },
    { name: 'South Road', openWave: 40, points: [[9, 15], [9, 13], [13, 13], [13, 9], [7, 9], [7, 7]] },
  ],
  serpent: [
    { name: 'Serpent Road', openWave: 0, points: [[-1, 1], [12, 1], [12, 4], [2, 4], [2, 7], [12, 7], [12, 10], [7, 10], [7, 12]] },
    { name: 'East Gate', openWave: 20, points: [[15, 13], [10, 13], [10, 12], [7, 12]] },
    { name: 'West Gate', openWave: 40, points: [[-1, 13], [3, 13], [3, 11], [5, 11], [5, 12], [7, 12]] },
  ],
  winds: [
    { name: 'North Road', openWave: 0, points: [[7, -1], [7, 2], [4, 2], [4, 5], [7, 5], [7, 7]] },
    { name: 'East Road', openWave: 15, points: [[15, 7], [12, 7], [12, 10], [9, 10], [9, 7], [7, 7]] },
    { name: 'South Road', openWave: 30, points: [[7, 15], [7, 13], [4, 13], [4, 10], [7, 10], [7, 7]] },
    { name: 'West Road', openWave: 45, points: [[-1, 4], [2, 4], [2, 9], [5, 9], [5, 7], [7, 7]] },
  ],
};

/** Moves a kingdom saved on a realm's old layout onto its current one. */
export function remapBase(id: MapId, base: BaseSnapshot): BaseSnapshot {
  const legacy = LEGACY_ROADS[id];
  if (!legacy) return base;
  const oldMap = buildRealmMap(MAP_BY_ID[id], legacy, false);
  const newMap = kingdomMap(id);
  const at = new Map(newMap.buildSpots.map((s) => [`${s.col},${s.row}`, s.index]));
  const move = (i: number): number => {
    const s = oldMap.buildSpots[i];
    return s ? at.get(`${s.col},${s.row}`) ?? -1 : -1;
  };
  const towers = base.towers.map((t) => ({ ...t, spot: move(t.spot) })).filter((t) => t.spot >= 0);
  const spots = new Set(base.spots.map(move).filter((i) => i >= 0));
  // Every tower stands on an unlocked pad, and the new layout's starting pads come free.
  for (const t of towers) spots.add(t.spot);
  for (const i of initialSpots(newMap)) spots.add(i);
  const post = (p: number | undefined) => (p === undefined || p < 0 ? p : move(p) >= 0 ? move(p) : -1);
  return {
    ...base,
    towers,
    spots: [...spots],
    // Barricades on a road that is gone come down.
    barricades: base.barricades?.filter((b) => newMap.isPath(b.col, b.row)),
    heroPost: post(base.heroPost),
    hero2Post: post(base.hero2Post),
  };
}
