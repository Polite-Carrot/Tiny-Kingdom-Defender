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
  /** Attack towers: damage per shop level. The Gold Mine gets the same share as gold instead. */
  damagePerLevel: 0.06,
  rangePerLevel: 0.015,
  /** The Beacon's boost to nearby towers grows at this share of the damage rate (it multiplies every tower around it). */
  beaconShare: 0.5,
} as const;

export const META_UPGRADES: Record<'castleHp' | 'battlements' | 'warChest' | 'heroPower', MetaUpgradeDef & { perLevel: number }> = {
  castleHp: { id: 'castleHp', name: 'Castle Walls', description: '+2 castle HP per level', baseCost: 80, maxLevel: 15, perLevel: 2 },
  battlements: { id: 'battlements', name: 'Battlements', description: 'Archers on the castle walls shoot nearby enemies. More damage each level; a second archer at Lv 8', baseCost: 110, maxLevel: 15, perLevel: 1 },
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
  /** From the monthly Reward Track. */
  track: { coinsMin: 220, coinsMax: 340, shardsMin: 10, shardsMax: 16 },
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

/** Coins for the second hero slot. */
export const HERO_SLOT2_COST = 3000;

export const HERO_UNLOCK_COST: Record<string, number> = {
  ranger: 0,
  knight: 600,
  mage: 900,
  dwarf: 1400,
  valkyrie: 1900,
  ninja: 2500,
  sniper: 3200,
};

export type CosmeticKind = 'castle' | 'trail' | 'hero' | 'tower' | 'flag';

export const COSMETICS: { id: string; kind: CosmeticKind; name: string; cost: number; shardCost: number; color: string }[] = [
  { id: 'castle_default', kind: 'castle', name: 'Royal Stone', cost: 0, shardCost: 0, color: '#d9cbb0' },
  { id: 'castle_rose', kind: 'castle', name: 'Rose Keep', cost: 300, shardCost: 0, color: '#e8a0a8' },
  { id: 'castle_frost', kind: 'castle', name: 'Ice Citadel', cost: 0, shardCost: 25, color: '#bfe6f5' },
  { id: 'castle_gold', kind: 'castle', name: 'Golden Bastion', cost: 900, shardCost: 30, color: '#f2cf5b' },
  { id: 'trail_none', kind: 'trail', name: 'No Trail', cost: 0, shardCost: 0, color: '#ffffff' },
  { id: 'trail_fire', kind: 'trail', name: 'Ember Trail', cost: 250, shardCost: 0, color: '#ff8a3d' },
  { id: 'trail_magic', kind: 'trail', name: 'Arcane Trail', cost: 0, shardCost: 20, color: '#c08cff' },
  { id: 'trail_rainbow', kind: 'trail', name: 'Rainbow Trail', cost: 600, shardCost: 25, color: '#7ff0c0' },
  // Hero skins: a tint over the selected hero's outfit.
  { id: 'hero_none', kind: 'hero', name: 'Classic Hero', cost: 0, shardCost: 0, color: '#ffffff' },
  { id: 'hero_shadow', kind: 'hero', name: 'Shadow Hero', cost: 0, shardCost: 30, color: '#8a78c8' },
  { id: 'hero_frost', kind: 'hero', name: 'Frostborn Hero', cost: 400, shardCost: 20, color: '#bfe2ff' },
  { id: 'hero_ember', kind: 'hero', name: 'Ember Hero', cost: 400, shardCost: 20, color: '#ffb48a' },
  { id: 'hero_gold', kind: 'hero', name: 'Gilded Hero', cost: 1200, shardCost: 45, color: '#ffe48a' },
  // Tower finishes: a tint over every tower.
  { id: 'tower_none', kind: 'tower', name: 'Classic Towers', cost: 0, shardCost: 0, color: '#ffffff' },
  { id: 'tower_moon', kind: 'tower', name: 'Moonstone Towers', cost: 0, shardCost: 35, color: '#cfdcff' },
  { id: 'tower_autumn', kind: 'tower', name: 'Autumn Towers', cost: 700, shardCost: 20, color: '#ffd4a8' },
  { id: 'tower_verdant', kind: 'tower', name: 'Verdant Towers', cost: 700, shardCost: 20, color: '#d2f2c4' },
  { id: 'tower_royal', kind: 'tower', name: 'Royal Gold Towers', cost: 1500, shardCost: 50, color: '#fff0b8' },
  // Castle banners: a great flag flying over the keep.
  { id: 'flag_none', kind: 'flag', name: 'No Banner', cost: 0, shardCost: 0, color: '#ffffff' },
  { id: 'flag_crimson', kind: 'flag', name: 'Crimson Banner', cost: 350, shardCost: 0, color: '#c23a4a' },
  { id: 'flag_emerald', kind: 'flag', name: 'Emerald Banner', cost: 350, shardCost: 0, color: '#2f9a5a' },
  { id: 'flag_midnight', kind: 'flag', name: 'Midnight Banner', cost: 0, shardCost: 25, color: '#2a2a6a' },
  { id: 'flag_sun', kind: 'flag', name: 'Sunburst Banner', cost: 900, shardCost: 30, color: '#f2b83a' },
];

export const TOWER_IDS_FOR_META: TowerId[] = ['archer', 'cannon', 'frost', 'lightning'];

/** Castle battlements: archers on the walls (damage scales with the wave so they stay useful). */
export const BATTLEMENTS = {
  range: 2.9,
  cooldown: 1.0,
  /** Damage = perLevel × level × (wave HP multiplier)^waveExp. */
  damagePerLevel: 5,
  waveExp: 0.6,
  secondArcherLevel: 8,
};

/** The castle grows as you upgrade it: tier = (walls + battlements levels) / levelsPerTier, up to 3. */
export const CASTLE_GROWTH = { levelsPerTier: 5, maxTier: 3 };
