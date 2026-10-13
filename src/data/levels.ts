// Campaign, chapter themes, map layouts and wave-composition parameters.

import type { EnemyId } from './enemies';
import type { TowerId } from './towers';

export const GRID_SIZE = 13; // tiles per side (0..12)

export type Waypoint = [number, number];
export interface Layout {
  /** Each path is a list of tile waypoints joined by straight orthogonal segments. Last point = castle. */
  paths: Waypoint[][];
}

export interface ChapterTheme {
  id: string;
  name: string;
  subtitle: string;
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
  props: ('tree' | 'pine' | 'rock' | 'cactus' | 'bush' | 'flower' | 'dune' | 'snowman' | 'crystal' | 'lavarock' | 'deadtree' | 'mushroom')[];
  /** Music: root note (MIDI), scale, bpm. */
  music: { root: number; scale: number[]; bpm: number; wave: OscillatorType };
  enemyWeights: Partial<Record<EnemyId, number>>;
}

export interface ChapterDef {
  index: number;
  theme: ChapterTheme;
  layouts: Layout[];
  /** Build spots generated per level. */
  buildSpots: number;
  /** Extra starting gold in this chapter (enemies hit harder from wave 1). */
  startGoldBonus: number;
  /** Wave budget parameters. */
  budgetBase: number;
  budgetPerWave: number;
  /** Extra per-level-in-chapter budget ramp. */
  budgetPerLevel: number;
  hpMult: number;
  waveCountMin: number;
  waveCountMax: number;
}

// --- Layouts -----------------------------------------------------------------

const MEADOW: Layout[] = [
  { paths: [[[-1, 6], [3, 6], [3, 2], [8, 2], [8, 9], [12, 9]]] },
  { paths: [[[-1, 2], [9, 2], [9, 6], [3, 6], [3, 10], [12, 10]]] },
  { paths: [[[6, -1], [6, 3], [2, 3], [2, 8], [10, 8], [10, 4], [12, 4]]] },
  { paths: [[[-1, 1], [10, 1], [10, 4], [2, 4], [2, 7], [10, 7], [10, 11], [12, 11]]] },
  { paths: [[[-1, 10], [2, 10], [2, 2], [10, 2], [10, 10], [5, 10], [5, 6], [7, 6]]] },
  { paths: [[[2, -1], [2, 9], [6, 9], [6, 3], [10, 3], [10, 12]]] },
];

const DESERT: Layout[] = [
  { paths: [[[-1, 3], [5, 3], [5, 7], [12, 7]], [[5, 13], [5, 10], [8, 10], [8, 7], [12, 7]]] },
  { paths: [[[-1, 2], [6, 2], [6, 6], [12, 6]], [[-1, 10], [6, 10], [6, 6], [12, 6]]] },
  { paths: [[[3, -1], [3, 4], [9, 4], [9, 8], [12, 8]], [[-1, 11], [5, 11], [5, 8], [9, 8], [12, 8]]] },
  { paths: [[[-1, 6], [4, 6], [4, 2], [8, 2], [8, 6], [12, 6]], [[-1, 6], [4, 6], [4, 10], [8, 10], [8, 6], [12, 6]]] },
  { paths: [[[-1, 1], [11, 1], [11, 4], [1, 4], [1, 8], [8, 8], [8, 12]], [[13, 10], [11, 10], [11, 6], [9, 6], [9, 8], [8, 8], [8, 12]]] },
  { paths: [[[6, -1], [6, 4], [2, 4], [2, 9], [6, 9], [6, 12]], [[6, -1], [6, 4], [10, 4], [10, 9], [6, 9], [6, 12]]] },
];

const SNOW: Layout[] = [
  { paths: [[[-1, 3], [8, 3], [8, 9], [12, 9]], [[3, 13], [3, 6], [8, 6], [8, 9], [12, 9]]] },
  { paths: [[[-1, 1], [9, 1], [9, 4], [3, 4], [3, 6], [6, 6]], [[13, 11], [3, 11], [3, 8], [9, 8], [9, 6], [6, 6]]] },
  { paths: [[[-1, 2], [4, 2], [4, 8], [6, 8], [6, 12]], [[13, 2], [8, 2], [8, 8], [6, 8], [6, 12]]] },
  { paths: [[[-1, 2], [5, 2], [5, 5], [1, 5], [1, 10], [7, 10], [7, 6], [12, 6]], [[10, -1], [10, 3], [8, 3], [8, 6], [12, 6]]] },
  { paths: [[[-1, 6], [2, 6], [2, 2], [6, 2], [6, 6]], [[13, 6], [10, 6], [10, 10], [6, 10], [6, 6]], [[6, 13], [6, 12], [2, 12], [2, 9], [4, 9], [4, 7], [6, 7], [6, 6]]] },
  { paths: [[[-1, 1], [11, 1], [11, 3], [1, 3], [1, 5], [11, 5], [11, 7], [1, 7], [1, 9], [11, 9], [11, 11], [12, 11]]] },
];

const VOLCANO: Layout[] = [
  { paths: [[[-1, 3], [9, 3], [9, 9], [3, 9], [3, 6], [6, 6]], [[13, 11], [11, 11], [11, 1], [6, 1], [6, 6]]] },
  { paths: [[[-1, 2], [4, 2], [4, 9], [6, 9], [6, 12]], [[13, 2], [8, 2], [8, 9], [6, 9], [6, 12]], [[6, -1], [6, 5], [6, 12]]] },
  { paths: [[[-1, 1], [11, 1], [11, 4], [1, 4], [1, 7], [11, 7], [11, 10], [6, 10], [6, 12]], [[13, 7], [11, 7], [11, 10], [6, 10], [6, 12]]] },
  { paths: [[[-1, 6], [3, 6], [3, 1], [9, 1], [9, 6], [12, 6]], [[-1, 6], [3, 6], [3, 11], [9, 11], [9, 6], [12, 6]], [[6, -1], [6, 1], [9, 1], [9, 6], [12, 6]]] },
  { paths: [[[-1, 2], [10, 2], [10, 6], [6, 6]], [[13, 10], [2, 10], [2, 6], [6, 6]], [[13, 4], [12, 4], [12, 8], [8, 8], [8, 6], [6, 6]]] },
  { paths: [
    [[-1, 1], [11, 1], [11, 3], [1, 3], [1, 5], [11, 5], [11, 7], [1, 7], [1, 9], [11, 9], [11, 11], [12, 11]],
    [[-1, 9], [11, 9], [11, 11], [12, 11]],
    [[-1, 5], [11, 5], [11, 7], [1, 7], [1, 9], [11, 9], [11, 11], [12, 11]],
  ] },
];

export const ENDLESS_LAYOUT: Layout = {
  paths: [[[-1, 2], [10, 2], [10, 5], [2, 5], [2, 9], [6, 9], [6, 12]], [[13, 9], [10, 9], [10, 7], [6, 7], [6, 9], [6, 12]]],
};

// --- Chapters ----------------------------------------------------------------

export const CHAPTERS: ChapterDef[] = [
  {
    index: 0, layouts: MEADOW, buildSpots: 10, startGoldBonus: 0,
    budgetBase: 6, budgetPerWave: 2.4, budgetPerLevel: 0.75, hpMult: 1.0, waveCountMin: 8, waveCountMax: 10,
    theme: {
      id: 'meadow', name: 'Meadow', subtitle: 'The Green Vale',
      grass: '#8fcf5f', grassAlt: '#7fc057', path: '#e3c48a', pathEdge: '#c9a66b', cliff: '#a0764a', cliffDark: '#7a5636',
      pad: '#cfc6b4', sky: '#bfe6ff', fog: '#d6efff', sun: '#fff1d6', ambient: '#a7c8e8',
      props: ['tree', 'tree', 'bush', 'flower', 'rock', 'mushroom'],
      music: { root: 60, scale: [0, 2, 4, 5, 7, 9, 11], bpm: 112, wave: 'triangle' },
      enemyWeights: { grunt: 5, runner: 3, knight: 2, bat: 2, shaman: 1.5, shield: 1 },
    },
  },
  {
    index: 1, layouts: DESERT, buildSpots: 12, startGoldBonus: 50,
    budgetBase: 9, budgetPerWave: 3.4, budgetPerLevel: 1.0, hpMult: 1.25, waveCountMin: 9, waveCountMax: 11,
    theme: {
      id: 'desert', name: 'Desert', subtitle: 'Sunscorch Dunes',
      grass: '#ecc985', grassAlt: '#e2bb73', path: '#c99b5b', pathEdge: '#ab7e43', cliff: '#c4834a', cliffDark: '#9a5f30',
      pad: '#e8dcc2', sky: '#ffe2b0', fog: '#ffe8c4', sun: '#fff0cc', ambient: '#e8c9a0',
      props: ['cactus', 'cactus', 'dune', 'rock', 'deadtree'],
      music: { root: 62, scale: [0, 1, 4, 5, 7, 8, 10], bpm: 104, wave: 'sawtooth' },
      enemyWeights: { grunt: 3, runner: 5, knight: 2, bat: 2.5, shaman: 2, shield: 1.5 },
    },
  },
  {
    index: 2, layouts: SNOW, buildSpots: 13, startGoldBonus: 100,
    budgetBase: 12, budgetPerWave: 4.4, budgetPerLevel: 1.0, hpMult: 1.6, waveCountMin: 10, waveCountMax: 12,
    theme: {
      id: 'snow', name: 'Snow', subtitle: 'Frostpeak Pass',
      grass: '#eef5fb', grassAlt: '#dfeaf4', path: '#a9b8c8', pathEdge: '#8899ad', cliff: '#7d8fa6', cliffDark: '#5d6d84',
      pad: '#c4ccd6', sky: '#cfe3f5', fog: '#e4eef8', sun: '#f4f8ff', ambient: '#a9c0dd',
      props: ['pine', 'pine', 'rock', 'snowman', 'crystal'],
      music: { root: 57, scale: [0, 2, 3, 5, 7, 8, 10], bpm: 96, wave: 'sine' },
      enemyWeights: { grunt: 3, runner: 2, knight: 4, bat: 2, shaman: 2, shield: 3 },
    },
  },
  {
    index: 3, layouts: VOLCANO, buildSpots: 14, startGoldBonus: 150,
    budgetBase: 15, budgetPerWave: 5.4, budgetPerLevel: 1.1, hpMult: 1.95, waveCountMin: 10, waveCountMax: 12,
    theme: {
      id: 'volcano', name: 'Volcano', subtitle: 'Cinder Crown',
      grass: '#5a4a4f', grassAlt: '#4e3f45', path: '#2f2629', pathEdge: '#e0582b', cliff: '#3b2e33', cliffDark: '#241b1f',
      pad: '#8c7c78', sky: '#3a2430', fog: '#5a2f30', sun: '#ffc08a', ambient: '#8a5a6a',
      props: ['lavarock', 'lavarock', 'deadtree', 'crystal', 'rock'],
      music: { root: 55, scale: [0, 1, 3, 5, 7, 8, 11], bpm: 120, wave: 'square' },
      enemyWeights: { grunt: 2.5, runner: 3, knight: 3, bat: 3, shaman: 2, shield: 2 },
    },
  },
];

export const LEVELS_PER_CHAPTER = 15;
export const TOTAL_LEVELS = CHAPTERS.length * LEVELS_PER_CHAPTER;
export const BOSS_EVERY = 5;

export const WAVE_COMPOSER = {
  /** Max distinct groups per wave. */
  maxGroups: 3,
  /** Seconds between groups within a wave. */
  groupGap: 2.5,
  /** Fraction of budget the boss wave spends on escorts. */
  bossEscortFraction: 0.45,
  /** Boss waves get this multiple of a normal wave's budget (boss + escorts). */
  bossBudgetMult: 1.6,
  /** Within a level, HP grows by this fraction per wave. */
  hpPerWave: 0.03,
  /** Level index (0-based) from which waves use more than one enemy type. */
  mixFromLevel: 1,
  /** Wave budgets scale with mean path length / this reference (short roads = fewer enemies). */
  referencePathLength: 26,
  pathFactorMin: 0.6,
  pathFactorMax: 1.15,
  /** Extra bounty per additional road (defending several roads needs more towers). */
  multiPathGoldBonus: 0.2,
};

/** Tower availability gating for onboarding (global level index, 0-based, at which it unlocks). */
export const TOWER_UNLOCK_LEVEL: Record<TowerId, number> = {
  archer: 0,
  cannon: 1,
  frost: 2,
  lightning: 6, // also requires a coin purchase
};

export const FEATURE_UNLOCK_LEVEL = {
  hero: 1,
  specialisation: 3,
  shop: 2,
  missions: 2,
  dailyLogin: 1,
  reinforcements: 3,
  endless: 5,
  weekly: 8,
  heroes: 4,
  treasury: 2,
  chests: 2,
  speedUp: 0,
};

export interface WeeklyModifier {
  id: string;
  name: string;
  description: string;
  allowedTowers?: TowerId[];
  enemySpeedMult?: number;
  enemyHpMult?: number;
  extraArmor?: number;
  startGoldMult?: number;
  waveGoldMult?: number;
  castleHpMult?: number;
  noHero?: boolean;
  weightOverrides?: Partial<Record<EnemyId, number>>;
}

export const WEEKLY_MODIFIERS: WeeklyModifier[] = [
  { id: 'frost_cannon', name: 'Ice & Iron', description: 'Only Frost and Cannon towers.', allowedTowers: ['frost', 'cannon'] },
  { id: 'double_speed', name: 'Stampede', description: 'Enemies move at double speed but have less HP.', enemySpeedMult: 2, enemyHpMult: 0.7 },
  { id: 'iron_tide', name: 'Iron Tide', description: 'All enemies gain +30% armor.', extraArmor: 0.3 },
  { id: 'bat_swarm', name: 'Night Swarm', description: 'Bats everywhere!', weightOverrides: { bat: 12 } },
  { id: 'glass_castle', name: 'Glass Castle', description: 'Castle has 40% HP, but you start rich.', castleHpMult: 0.4, startGoldMult: 1.8 },
  { id: 'lone_towers', name: 'No Heroes', description: 'Your hero stays home. Waves give +40% gold.', noHero: true, waveGoldMult: 1.4 },
];

export const WEEKLY = {
  /** Global level index whose difficulty the weekly challenge mirrors. */
  difficultyLevel: 17,
  rewardCoins: 180,
  rewardShards: 6,
};
