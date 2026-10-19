// The realms: each is its own kingdom map with its own road layout, saved siege and best wave.
// Roads are tile waypoints joined by straight orthogonal segments; every road ends at the castle
// (the last point of the first road). Tunnels sit just off the board edge (-1 or the size).
// Most realms are the classic 15×15; some are bigger. A realm never has more roads than its place
// in the list. The first realms are the gentlest: one long road each.

import { ROADS, type Road } from './base';

export type MapId = 'vale' | 'serpent' | 'winds' | 'crooked' | 'kingsway' | 'mirefen' | 'twin' | 'coil' | 'gauntlet' | 'crownfall';

export interface MapDef {
  id: MapId;
  name: string;
  description: string;
  /** Best wave (in any realm) needed to found a kingdom here. */
  unlockWave: number;
  roads: Road[];
  /** Tiles per side (default 15). */
  size?: number;
  /** Hand-placed pads beside the roads (default LAND.totalSpots). */
  spots?: number;
}

export const MAPS: MapDef[] = [
  {
    id: 'coil', name: 'Coil Keep', unlockWave: 0, size: 17, spots: 40,
    description: 'One enormous spiral winds all the way in to the keep at its heart. A long road, and the only one.',
    roads: [
      { name: 'The Coil', openWave: 0, points: [[-1, 1], [15, 1], [15, 15], [1, 15], [1, 3], [13, 3], [13, 13], [3, 13], [3, 5], [11, 5], [11, 11], [5, 11], [5, 7], [9, 7], [9, 9], [8, 9], [8, 8]] },
    ],
  },
  {
    id: 'gauntlet', name: 'The Gauntlet', unlockWave: 10, size: 19, spots: 44,
    description: 'A huge realm crossed by one long snaking road, back and forth from wall to wall to a keep in the far corner.',
    roads: [
      { name: 'The Gauntlet', openWave: 0, points: [[-1, 1], [17, 1], [17, 5], [1, 5], [1, 9], [17, 9], [17, 13], [1, 13], [1, 17], [17, 17]] },
    ],
  },
  {
    id: 'vale', name: 'Kingdom Vale', unlockWave: 0,
    description: 'The original kingdom. Two identical winding roads, west and east, meet at the castle in the middle.',
    roads: ROADS,
  },
  {
    id: 'serpent', name: 'Serpent Pass', unlockWave: 20,
    description: 'One endless switchback road to a keep in the south-west corner, and an east gate down the far side and along the south wall that opens later.',
    roads: [
      { name: 'Serpent Road', openWave: 0, points: [[-1, 1], [12, 1], [12, 4], [2, 4], [2, 7], [12, 7], [12, 10], [2, 10], [2, 12]] },
      { name: 'East Gate', openWave: 20, points: [[14, -1], [14, 13], [2, 13], [2, 12]] },
    ],
  },
  {
    id: 'winds', name: 'The Crossing', unlockWave: 30,
    description: 'Two roads, each folded back and forth across half the realm, meet at the keep in the middle. The south road opens later.',
    roads: [
      { name: 'North Road', openWave: 0, points: [[-1, 2], [12, 2], [12, 5], [3, 5], [3, 7], [7, 7]] },
      { name: 'South Road', openWave: 20, points: [[15, 12], [2, 12], [2, 9], [11, 9], [11, 7], [7, 7]] },
    ],
  },
  {
    id: 'crooked', name: 'Three Fords', unlockWave: 40,
    description: 'Three winding roads from the west, north and east all ford down to a keep on the south bank.',
    roads: [
      { name: 'West Ford', openWave: 0, points: [[-1, 1], [3, 1], [3, 5], [1, 5], [1, 10], [5, 10], [5, 12], [7, 12]] },
      { name: 'North Ford', openWave: 20, points: [[5, -1], [5, 2], [9, 2], [9, 7], [7, 7], [7, 12]] },
      { name: 'East Ford', openWave: 60, points: [[15, 1], [11, 1], [11, 5], [13, 5], [13, 10], [9, 10], [9, 12], [7, 12]] },
    ],
  },
  {
    id: 'kingsway', name: 'The Kingsway', unlockWave: 50, size: 21, spots: 46,
    description: 'A vast realm. One dead-straight royal road runs from the far side to the castle, and two long winding gates open later from the north and south.',
    roads: [
      { name: "King's Road", openWave: 0, points: [[-1, 10], [19, 10]] },
      { name: 'North Gate', openWave: 20, points: [[2, -1], [2, 6], [8, 6], [8, 2], [14, 2], [14, 6], [19, 6], [19, 10]] },
      { name: 'South Gate', openWave: 40, points: [[2, 21], [2, 14], [8, 14], [8, 18], [14, 18], [14, 14], [19, 14], [19, 10]] },
    ],
  },
  {
    id: 'mirefen', name: 'The Old Vale', unlockWave: 60,
    description: 'The original three-road Kingdom Vale: a long west road, then the north-east and south roads as you go deeper.',
    roads: [
      { name: 'West Road', openWave: 0, points: [[-1, 1], [5, 1], [5, 4], [1, 4], [1, 12], [5, 12], [5, 7], [7, 7]] },
      { name: 'North-East Road', openWave: 20, points: [[12, -1], [12, 2], [8, 2], [8, 5], [12, 5], [12, 7], [7, 7]] },
      { name: 'South Road', openWave: 40, points: [[9, 15], [9, 13], [13, 13], [13, 9], [7, 9], [7, 7]] },
    ],
  },
  {
    id: 'twin', name: 'Pinwheel Keep', unlockWave: 75, size: 17, spots: 40,
    description: 'Four arms turn like a pinwheel into the keep at its heart, one after another.',
    roads: [
      { name: 'North Arm', openWave: 0, points: [[2, -1], [2, 2], [11, 2], [11, 5], [8, 5], [8, 8]] },
      { name: 'East Arm', openWave: 20, points: [[17, 2], [14, 2], [14, 11], [11, 11], [11, 8], [8, 8]] },
      { name: 'South Arm', openWave: 40, points: [[14, 17], [14, 14], [5, 14], [5, 11], [8, 11], [8, 8]] },
      { name: 'West Arm', openWave: 60, points: [[-1, 14], [2, 14], [2, 5], [5, 5], [5, 8], [8, 8]] },
    ],
  },
  {
    id: 'crownfall', name: 'Crownfall', unlockWave: 90, size: 21, spots: 52,
    description: 'The greatest realm of all: the crown at its centre, four long roads from the four winds.',
    roads: [
      { name: 'North Road', openWave: 0, points: [[10, -1], [10, 2], [4, 2], [4, 6], [10, 6], [10, 10]] },
      { name: 'East Road', openWave: 15, points: [[21, 10], [18, 10], [18, 4], [14, 4], [14, 10], [10, 10]] },
      { name: 'South Road', openWave: 35, points: [[10, 21], [10, 18], [16, 18], [16, 14], [10, 14], [10, 10]] },
      { name: 'West Road', openWave: 55, points: [[-1, 10], [2, 10], [2, 16], [6, 16], [6, 10], [10, 10]] },
    ],
  },
];

export const MAP_BY_ID = Object.fromEntries(MAPS.map((m) => [m.id, m])) as Record<MapId, MapDef>;
