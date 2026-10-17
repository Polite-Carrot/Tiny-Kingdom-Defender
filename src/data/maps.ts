// The realms: each is its own kingdom map with its own road layout, saved siege and best wave.
// Roads are tile waypoints joined by straight orthogonal segments; every road ends at the castle
// (the last point of the first road). Tunnels sit just off the board edge (-1 or 15).

import { ROADS, type Road } from './base';

export type MapId = 'vale' | 'serpent' | 'winds' | 'crooked';

export interface MapDef {
  id: MapId;
  name: string;
  description: string;
  /** Best wave (in any realm) needed to found a kingdom here. */
  unlockWave: number;
  roads: Road[];
}

export const MAPS: MapDef[] = [
  {
    id: 'vale', name: 'Kingdom Vale', unlockWave: 0,
    description: 'Your first kingdom. A winding west road, with more opening from the north-east and south.',
    roads: ROADS,
  },
  {
    id: 'serpent', name: 'Serpent Pass', unlockWave: 20,
    description: 'One endless switchback road: lots of room to line it with towers, but short gates open late.',
    roads: [
      { name: 'Serpent Road', openWave: 0, points: [[-1, 1], [12, 1], [12, 4], [2, 4], [2, 7], [12, 7], [12, 10], [7, 10], [7, 12]] },
      { name: 'East Gate', openWave: 20, points: [[15, 13], [10, 13], [10, 12], [7, 12]] },
      { name: 'West Gate', openWave: 40, points: [[-1, 13], [3, 13], [3, 11], [5, 11], [5, 12], [7, 12]] },
    ],
  },
  {
    id: 'winds', name: 'Four Winds', unlockWave: 35,
    description: 'The castle stands at the crossroads. Short roads close in from all four sides.',
    roads: [
      { name: 'North Road', openWave: 0, points: [[7, -1], [7, 2], [4, 2], [4, 5], [7, 5], [7, 7]] },
      { name: 'East Road', openWave: 15, points: [[15, 7], [12, 7], [12, 10], [9, 10], [9, 7], [7, 7]] },
      { name: 'South Road', openWave: 30, points: [[7, 15], [7, 13], [4, 13], [4, 10], [7, 10], [7, 7]] },
      { name: 'West Road', openWave: 45, points: [[-1, 4], [2, 4], [2, 9], [5, 9], [5, 7], [7, 7]] },
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
];

export const MAP_BY_ID = Object.fromEntries(MAPS.map((m) => [m.id, m])) as Record<MapId, MapDef>;
