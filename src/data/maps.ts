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
    id: 'winds', name: 'Four Winds', unlockWave: 35,
    description: 'The castle stands at a crossroads. Short roads close in from three sides.',
    roads: [
      { name: 'North Road', openWave: 0, points: [[7, -1], [7, 2], [4, 2], [4, 5], [7, 5], [7, 7]] },
      { name: 'East Road', openWave: 15, points: [[15, 7], [12, 7], [12, 10], [9, 10], [9, 7], [7, 7]] },
      { name: 'South Road', openWave: 30, points: [[7, 15], [7, 13], [4, 13], [4, 10], [7, 10], [7, 7]] },
    ],
  },
  {
    id: 'crooked', name: 'Crooked Keep', unlockWave: 50,
    description: 'A keep tucked into a corner. Roads wind across the whole realm to reach it.',
    roads: [
      { name: 'Long Road', openWave: 0, points: [[15, 1], [10, 1], [10, 5], [4, 5], [4, 8], [9, 8], [9, 11], [3, 11]] },
      { name: 'Ridge Road', openWave: 20, points: [[1, -1], [1, 3], [2, 3], [2, 8], [1, 8], [1, 11], [3, 11]] },
      { name: 'Lake Road', openWave: 40, points: [[15, 13], [5, 13], [5, 12], [3, 12], [3, 11]] },
    ],
  },
  {
    id: 'kingsway', name: 'The Kingsway', unlockWave: 55, size: 21, spots: 46,
    description: 'A vast realm and one dead-straight royal road from the far side to the castle. Line it with towers.',
    roads: [
      { name: "King's Road", openWave: 0, points: [[-1, 10], [19, 10]] },
      { name: 'North Gate', openWave: 25, points: [[10, -1], [10, 4], [16, 4], [16, 10], [19, 10]] },
      { name: 'South Gate', openWave: 50, points: [[10, 21], [10, 16], [16, 16], [16, 10], [19, 10]] },
    ],
  },
  {
    id: 'mirefen', name: 'Mirefen', unlockWave: 65,
    description: 'Two winding bog roads meet before the keep, and a reed path cuts straight down the middle.',
    roads: [
      { name: 'Bog Road', openWave: 0, points: [[-1, 2], [5, 2], [5, 7], [2, 7], [2, 11], [7, 11], [7, 13]] },
      { name: 'Fen Road', openWave: 20, points: [[15, 2], [9, 2], [9, 7], [12, 7], [12, 11], [7, 11], [7, 13]] },
      { name: 'Reed Path', openWave: 40, points: [[7, -1], [7, 13]] },
    ],
  },
  {
    id: 'twin', name: 'Twin Rivers', unlockWave: 75,
    description: 'The castle sits between two rivers. Mirror-image roads close in from every side, two at a time.',
    roads: [
      { name: 'West Road', openWave: 0, points: [[-1, 3], [3, 3], [3, 11], [5, 11], [5, 7], [7, 7]] },
      { name: 'East Road', openWave: 15, points: [[15, 11], [11, 11], [11, 3], [9, 3], [9, 7], [7, 7]] },
      { name: 'North Road', openWave: 35, points: [[7, -1], [7, 1], [5, 1], [5, 5], [7, 5], [7, 7]] },
      { name: 'South Road', openWave: 55, points: [[7, 15], [7, 13], [9, 13], [9, 9], [7, 9], [7, 7]] },
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
