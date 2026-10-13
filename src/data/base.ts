// The persistent kingdom: map, roads, land expansion, endless wave scaling, checkpoints and unlocks.

import type { EnemyId } from './enemies';
import type { TowerId } from './towers';

export const GRID_SIZE = 15; // tiles per side (0..14); the castle sits in the middle

export type Waypoint = [number, number];

export interface Road {
  /** Tile waypoints joined by straight orthogonal segments. Last point = castle. */
  points: Waypoint[];
  /** Wave index (0-based) at which this road opens to enemies. */
  openWave: number;
  name: string;
}

export const ROADS: Road[] = [
  {
    name: 'West Road', openWave: 0,
    points: [[-1, 1], [5, 1], [5, 4], [1, 4], [1, 12], [5, 12], [5, 7], [7, 7]],
  },
  {
    name: 'North-East Road', openWave: 25,
    points: [[12, -1], [12, 2], [8, 2], [8, 5], [12, 5], [12, 7], [7, 7]],
  },
  {
    name: 'South Road', openWave: 50,
    points: [[9, 15], [9, 13], [13, 13], [13, 9], [7, 9], [7, 7]],
  },
];

export const LAND = {
  /** Total build pads on the map. */
  totalSpots: 34,
  /** Pads usable from the start (best-covering pads of the first road). */
  initialSpots: 6,
  /** Gold cost to clear land for one more pad: base × growth^padsCleared. */
  clearBase: 90,
  clearGrowth: 1.3,
};

export const SIEGE = {
  /** Gold when a brand new kingdom is founded. */
  startingGold: 220,
  castleHp: 20,
  /** Seconds between waves. */
  waveGap: 12,
  /** Losing sends you back to the last multiple of this (towers and gold are kept). */
  checkpointEvery: 10,
  /** A new Age (theme, music, enemy mix) every N waves. */
  ageEvery: 25,
  bossEvery: 10,
  /** Wave budget: (base + perWave × n^exp) × (1 + roadBonus × (openRoads - 1)). */
  budgetBase: 6,
  budgetPerWave: 2.1,
  budgetExp: 1.08,
  roadBudgetBonus: 0.35,
  /** Enemy HP multiplier: (1 + hpLinear × n) × hpExp^n. */
  hpLinear: 0.05,
  hpExp: 1.022,
  /** Multiplier on all battle gold (kills and wave clears): generous early, tapering to goldScale by goldTaperWave. */
  goldScale: 0.45,
  goldScaleEarly: 1,
  goldTaperWave: 30,
  /** Bounty scales with HP^exponent so tougher enemies pay more (but gold/HP still falls). */
  bountyHpExponent: 0.35,
  /** Boss HP multiplier: base × (1 + bossGrowth × bossNumber). */
  bossHpBase: 0.55,
  bossGrowth: 0.18,
  /** Gold for clearing a wave: base + perWave × n. */
  waveClearBase: 15,
  waveClearPerWave: 1.2,
  /** Early call: gold per remaining second of the countdown. */
  earlyCallGoldPerSecond: 1.6,
  earlyCallMaxGold: 60,
  /** Gold Rush rewarded ad: kill gold multiplier and how many waves it lasts. */
  goldRushMult: 2,
  goldRushWaves: 3,
};

/** Coins (meta currency) earned in the siege. */
export const SIEGE_COINS = {
  /** Coins for each wave cleared: base + n × perWave. */
  perWaveBase: 2,
  perWaveGrowth: 0.06,
  /** Coins for reaching a checkpoint for the first time: base + checkpoint# × growth. */
  checkpointBase: 40,
  checkpointGrowth: 12,
  /** Re-reaching an old checkpoint pays this fraction. */
  checkpointRepeatFraction: 0.35,
};

/** Best wave reached (0-based count of waves cleared) needed to unlock things. */
export const UNLOCK_WAVE: Record<'cannon' | 'frost' | 'shop' | 'missions' | 'dailyLogin' | 'treasury' | 'chests' | 'heroes' | 'reinforcements' | 'goldRush' | 'lightning', number> = {
  cannon: 2,
  frost: 5,
  dailyLogin: 1,
  shop: 3,
  missions: 4,
  treasury: 4,
  chests: 6,
  reinforcements: 8,
  goldRush: 8,
  heroes: 12,
  lightning: 15, // also needs a coin purchase in the Shop
};

export const TOWER_UNLOCK_WAVE: Record<TowerId, number> = {
  archer: 0,
  cannon: UNLOCK_WAVE.cannon,
  frost: UNLOCK_WAVE.frost,
  lightning: UNLOCK_WAVE.lightning,
};

/** Enemy introduction: earliest wave index each enemy type may appear. */
export const ENEMY_FIRST_WAVE: Partial<Record<EnemyId, number>> = {
  grunt: 0,
  runner: 2,
  bat: 6,
  knight: 8,
  shaman: 13,
  shield: 17,
};

export const WAVE_COMPOSER = {
  maxGroups: 3,
  /** Seconds between groups within a wave. */
  groupGap: 2.5,
  /** Boss waves get this multiple of a normal wave's budget; escorts get bossEscortFraction of it. */
  bossBudgetMult: 1.5,
  bossEscortFraction: 0.45,
  /** Wave index from which waves can mix several enemy types. */
  mixFromWave: 3,
  /** Performance cap: above this many enemies, counts shrink and each enemy gets tougher (and richer) instead. */
  maxEnemiesPerWave: 70,
};
