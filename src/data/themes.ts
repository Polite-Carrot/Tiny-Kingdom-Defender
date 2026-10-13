// Visual/audio themes for the Ages your kingdom passes through.

import type { EnemyId } from './enemies';

export type PropType = 'tree' | 'pine' | 'rock' | 'cactus' | 'bush' | 'flower' | 'dune' | 'snowman' | 'crystal' | 'lavarock' | 'deadtree' | 'mushroom';

export interface Theme {
  id: 'meadow' | 'desert' | 'snow' | 'volcano';
  name: string;
  grass: string;
  grassAlt: string;
  path: string;
  pathEdge: string;
  cliff: string;
  cliffDark: string;
  pad: string;
  sky: string;
  fog: string;
  sun: string;
  ambient: string;
  /** Plane around the diorama (sea, sand, ice, lava). */
  ground: string;
  groundGlow: boolean;
  props: PropType[];
  /** Music: root note (MIDI), scale, bpm. */
  music: { root: number; scale: number[]; bpm: number; wave: OscillatorType };
  /** Wave-composer weights for this Age. */
  enemyWeights: Partial<Record<EnemyId, number>>;
}

export const THEMES: Theme[] = [
  {
    id: 'meadow', name: 'Age of Meadows',
    grass: '#8fcf5f', grassAlt: '#7fc057', path: '#e3c48a', pathEdge: '#c9a66b', cliff: '#a0764a', cliffDark: '#7a5636',
    pad: '#cfc6b4', sky: '#bfe6ff', fog: '#d6efff', sun: '#fff1d6', ambient: '#a7c8e8', ground: '#78c3e6', groundGlow: false,
    props: ['tree', 'tree', 'bush', 'flower', 'rock', 'mushroom'],
    music: { root: 60, scale: [0, 2, 4, 5, 7, 9, 11], bpm: 112, wave: 'triangle' },
    enemyWeights: { grunt: 5, runner: 3, knight: 2, bat: 2, shaman: 1.5, shield: 1 },
  },
  {
    id: 'desert', name: 'Age of Sands',
    grass: '#f0d496', grassAlt: '#e8c884', path: '#b47f4a', pathEdge: '#94643a', cliff: '#c4834a', cliffDark: '#9a5f30',
    pad: '#e8dcc2', sky: '#ffe2b0', fog: '#ffe8c4', sun: '#fff0cc', ambient: '#e8c9a0', ground: '#e3bd7c', groundGlow: false,
    props: ['cactus', 'cactus', 'dune', 'rock', 'deadtree'],
    music: { root: 62, scale: [0, 1, 4, 5, 7, 8, 10], bpm: 104, wave: 'sawtooth' },
    enemyWeights: { grunt: 3, runner: 5, knight: 2, bat: 2.5, shaman: 2, shield: 1.5 },
  },
  {
    id: 'snow', name: 'Age of Frost',
    grass: '#eef5fb', grassAlt: '#dfeaf4', path: '#8b9db3', pathEdge: '#6f8299', cliff: '#7d8fa6', cliffDark: '#5d6d84',
    pad: '#c4ccd6', sky: '#cfe3f5', fog: '#e4eef8', sun: '#f4f8ff', ambient: '#a9c0dd', ground: '#d5e5f3', groundGlow: false,
    props: ['pine', 'pine', 'rock', 'snowman', 'crystal'],
    music: { root: 57, scale: [0, 2, 3, 5, 7, 8, 10], bpm: 96, wave: 'sine' },
    enemyWeights: { grunt: 3, runner: 2, knight: 4, bat: 2, shaman: 2, shield: 3 },
  },
  {
    id: 'volcano', name: 'Age of Fire',
    grass: '#5b4a4c', grassAlt: '#524245', path: '#b08a6e', pathEdge: '#e0582b', cliff: '#3b2e33', cliffDark: '#241b1f',
    pad: '#8c7c78', sky: '#3a2430', fog: '#5a2f30', sun: '#ffc08a', ambient: '#8a5a6a', ground: '#e8481a', groundGlow: true,
    props: ['lavarock', 'lavarock', 'deadtree', 'crystal', 'rock'],
    music: { root: 55, scale: [0, 1, 3, 5, 7, 8, 11], bpm: 120, wave: 'square' },
    enemyWeights: { grunt: 2.5, runner: 3, knight: 3, bat: 3, shaman: 2, shield: 2 },
  },
];

const ROMAN = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
/** e.g. "Age of Sands II" for the second time round the cycle. */
export function ageName(age: number): string {
  const t = THEMES[age % THEMES.length];
  const cycle = Math.floor(age / THEMES.length);
  return cycle === 0 ? t.name : `${t.name} ${ROMAN[cycle] ?? cycle + 1}`;
}
