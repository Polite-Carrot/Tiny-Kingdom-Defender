// Meta economy (coins): permanent upgrades, unlocks, idle income, chests, rewards.
// In-siege gold numbers live in data/base.ts.

import type { TowerId } from './towers';
import { UNLOCK_WAVE } from './base';

/** Meta upgrade cost curve: base × growth^level. */
export const COST_GROWTH = 1.35;
export const metaCost = (base: number, level: number) => Math.round(base * Math.pow(COST_GROWTH, level));

export interface MetaUpgradeDef {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  maxLevel: number;
}

export const TOWER_META = {
  baseCost: 60,
  maxLevel: 20,
  damagePerLevel: 0.06,
  rangePerLevel: 0.015,
} as const;

export const META_UPGRADES: Record<'castleHp' | 'warChest' | 'heroPower', MetaUpgradeDef & { perLevel: number }> = {
  castleHp: { id: 'castleHp', name: 'Castle Walls', description: '+2 castle HP per level', baseCost: 80, maxLevel: 15, perLevel: 2 },
  warChest: { id: 'warChest', name: 'War Chest', description: '+5% gold from defeated enemies per level', baseCost: 90, maxLevel: 15, perLevel: 0.05 },
  heroPower: { id: 'heroPower', name: 'Hero Training', description: '+8% hero damage & HP per level', baseCost: 90, maxLevel: 15, perLevel: 0.08 },
};

export const UNLOCKS = {
  lightning: { cost: 400, requiresWave: UNLOCK_WAVE.lightning },
};

export const TREASURY = {
  /** Coins per hour while away. */
  coinsPerHour: 12,
  /** Bonus to the hourly rate per best wave reached. */
  coinsPerHourPerWave: 0.25,
  capHours: 8,
  /** Minimum coins before it shows as collectable. */
  minCollect: 5,
};

export const CHESTS = {
  freeChestHours: 4,
  free: { coinsMin: 40, coinsMax: 80, shardsMin: 2, shardsMax: 5 },
  /** Earned at every checkpoint reached for the first time. */
  milestone: { coinsMin: 100, coinsMax: 160, shardsMin: 5, shardsMax: 10 },
  daily: { coinsMin: 150, coinsMax: 220, shardsMin: 8, shardsMax: 14 },
};

/** 7-day login cycle. Day 7 is a chest. */
export const DAILY_LOGIN: ({ kind: 'coins'; amount: number } | { kind: 'chest' })[] = [
  { kind: 'coins', amount: 30 },
  { kind: 'coins', amount: 40 },
  { kind: 'coins', amount: 50 },
  { kind: 'coins', amount: 60 },
  { kind: 'coins', amount: 75 },
  { kind: 'coins', amount: 90 },
  { kind: 'chest' },
];

export const AD_REWARDS = {
  shopBundleCoins: 60,
  shopBundlePerDay: 3,
  reviveHpFraction: 0.5,
  reinforcementDuration: 30,
  /** Checkpoint ad: multiply the checkpoint coins. */
  checkpointMult: 2,
};

export const HERO_UNLOCK_COST: Record<string, number> = {
  ranger: 0,
  knight: 600,
  mage: 900,
};

export const COSMETICS: { id: string; kind: 'castle' | 'trail'; name: string; cost: number; shardCost: number; color: string }[] = [
  { id: 'castle_default', kind: 'castle', name: 'Royal Stone', cost: 0, shardCost: 0, color: '#d9cbb0' },
  { id: 'castle_rose', kind: 'castle', name: 'Rose Keep', cost: 300, shardCost: 0, color: '#e8a0a8' },
  { id: 'castle_frost', kind: 'castle', name: 'Ice Citadel', cost: 0, shardCost: 25, color: '#bfe6f5' },
  { id: 'castle_gold', kind: 'castle', name: 'Golden Bastion', cost: 900, shardCost: 30, color: '#f2cf5b' },
  { id: 'trail_none', kind: 'trail', name: 'No Trail', cost: 0, shardCost: 0, color: '#ffffff' },
  { id: 'trail_fire', kind: 'trail', name: 'Ember Trail', cost: 250, shardCost: 0, color: '#ff8a3d' },
  { id: 'trail_magic', kind: 'trail', name: 'Arcane Trail', cost: 0, shardCost: 20, color: '#c08cff' },
  { id: 'trail_rainbow', kind: 'trail', name: 'Rainbow Trail', cost: 600, shardCost: 25, color: '#7ff0c0' },
];

export const TOWER_IDS_FOR_META: TowerId[] = ['archer', 'cannon', 'frost', 'lightning'];
