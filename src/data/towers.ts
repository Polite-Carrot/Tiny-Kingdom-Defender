// Tower balance data. All in-run tower numbers live here.
// Distances are in tiles (1 tile = 1 world unit). Times are in seconds.

export type TowerId = 'archer' | 'cannon' | 'frost' | 'lightning';
export type DamageType = 'physical' | 'magic';
export type TargetMode = 'first' | 'strongest' | 'closest';

export interface TowerStats {
  damage: number;
  range: number;
  /** Seconds between shots. */
  cooldown: number;
  /** Splash radius (0 = single target). */
  splash: number;
  /** Projectile speed in tiles/s (0 = instant hit). */
  projectileSpeed: number;
  /** Multiplicative slow applied on hit (0.6 = 40% slower). 1 = none. */
  slowFactor: number;
  slowDuration: number;
  /** Number of chain jumps (lightning). */
  chains: number;
  chainRange: number;
  /** Number of simultaneous targets (volley). */
  multishot: number;
  /** Stun seconds on hit. */
  stun: number;
  /** Chance to freeze (full stop) for stun seconds. */
  freezeChance: number;
  /** Armor shred: adds this much vulnerability to physical for 3s. */
  shred: number;
  /** Pulses damage+slow on all enemies in range instead of shooting. */
  aura: boolean;
}

export interface TowerBranch {
  id: string;
  name: string;
  description: string;
  stats: Partial<TowerStats>;
}

export interface TowerDef {
  id: TowerId;
  name: string;
  role: string;
  cost: number;
  damageType: DamageType;
  hitsAir: boolean;
  hitsGround: boolean;
  color: string;
  /** Stats per tier, index 0 = tier 1. Tier 3 is the last regular tier. */
  tiers: TowerStats[];
  /** Upgrade cost from tier N to N+1 (index 0 = 1->2, 1 = 2->3, 2 = 3->specialisation). */
  upgradeCosts: number[];
  branches: [TowerBranch, TowerBranch];
}

const base: TowerStats = {
  damage: 0, range: 0, cooldown: 1, splash: 0, projectileSpeed: 0, slowFactor: 1, slowDuration: 0,
  chains: 0, chainRange: 0, multishot: 1, stun: 0, freezeChance: 0, shred: 0, aura: false,
};
const s = (o: Partial<TowerStats>): TowerStats => ({ ...base, ...o });

/** Upgrade cost chain: each step ~1.6x the previous (see economy.ts UPGRADE_COST_GROWTH). */
const chain = (first: number) => [first, Math.round(first * 1.6 / 5) * 5, Math.round(first * 1.6 * 1.6 / 5) * 5];

export const TOWERS: Record<TowerId, TowerDef> = {
  archer: {
    id: 'archer', name: 'Archer', role: 'Fast single-target. Hits flying.', cost: 70,
    damageType: 'physical', hitsAir: true, hitsGround: true, color: '#7bbf5a',
    tiers: [
      s({ damage: 8, range: 2.9, cooldown: 0.6, projectileSpeed: 16 }),
      s({ damage: 13, range: 3.1, cooldown: 0.55, projectileSpeed: 17 }),
      s({ damage: 20, range: 3.3, cooldown: 0.5, projectileSpeed: 18 }),
    ],
    upgradeCosts: chain(60),
    branches: [
      { id: 'longbow', name: 'Longbow', description: 'Huge range, heavy piercing arrows.', stats: { damage: 58, range: 4.6, cooldown: 0.85, projectileSpeed: 26, shred: 0.15 } },
      { id: 'volley', name: 'Volley', description: 'Fires at 3 enemies at once.', stats: { damage: 22, range: 3.4, cooldown: 0.42, multishot: 3 } },
    ],
  },
  cannon: {
    id: 'cannon', name: 'Cannon', role: 'Slow splash damage. Ground only.', cost: 120,
    damageType: 'physical', hitsAir: false, hitsGround: true, color: '#c9783f',
    tiers: [
      s({ damage: 24, range: 2.7, cooldown: 1.9, splash: 1.05, projectileSpeed: 7 }),
      s({ damage: 38, range: 2.8, cooldown: 1.8, splash: 1.15, projectileSpeed: 7.5 }),
      s({ damage: 56, range: 3.0, cooldown: 1.7, splash: 1.25, projectileSpeed: 8 }),
    ],
    upgradeCosts: chain(95),
    branches: [
      { id: 'bombard', name: 'Bombard', description: 'Massive blast radius and damage.', stats: { damage: 135, range: 3.3, cooldown: 2.0, splash: 1.8, projectileSpeed: 8 } },
      { id: 'shrapnel', name: 'Shrapnel', description: 'Rapid fire. Shreds armor.', stats: { damage: 60, range: 3.0, cooldown: 0.95, splash: 1.2, projectileSpeed: 10, shred: 0.3 } },
    ],
  },
  frost: {
    id: 'frost', name: 'Frost', role: 'Slows enemies. Low damage.', cost: 90,
    damageType: 'magic', hitsAir: true, hitsGround: true, color: '#7fd0f0',
    tiers: [
      s({ damage: 4, range: 2.6, cooldown: 1.0, splash: 0.6, projectileSpeed: 11, slowFactor: 0.6, slowDuration: 1.6 }),
      s({ damage: 7, range: 2.8, cooldown: 0.95, splash: 0.7, projectileSpeed: 12, slowFactor: 0.52, slowDuration: 1.8 }),
      s({ damage: 11, range: 3.0, cooldown: 0.9, splash: 0.8, projectileSpeed: 12, slowFactor: 0.45, slowDuration: 2.0 }),
    ],
    upgradeCosts: chain(70),
    branches: [
      { id: 'glacier', name: 'Glacier', description: 'Deep slow and a chance to freeze solid.', stats: { damage: 24, range: 3.2, cooldown: 0.85, splash: 0.9, slowFactor: 0.32, slowDuration: 2.4, freezeChance: 0.18, stun: 1.0 } },
      { id: 'blizzard', name: 'Blizzard', description: 'Constant icy aura hits everything in range.', stats: { damage: 13, range: 2.6, cooldown: 0.5, aura: true, slowFactor: 0.5, slowDuration: 0.8 } },
    ],
  },
  lightning: {
    id: 'lightning', name: 'Lightning', role: 'Chains between 3-5 enemies.', cost: 150,
    damageType: 'magic', hitsAir: true, hitsGround: true, color: '#b48cf0',
    tiers: [
      s({ damage: 20, range: 2.8, cooldown: 1.45, chains: 3, chainRange: 1.8 }),
      s({ damage: 30, range: 3.0, cooldown: 1.35, chains: 4, chainRange: 1.9 }),
      s({ damage: 44, range: 3.1, cooldown: 1.25, chains: 5, chainRange: 2.0 }),
    ],
    upgradeCosts: chain(115),
    branches: [
      { id: 'storm', name: 'Storm Spire', description: 'Chains to 8 enemies.', stats: { damage: 56, range: 3.3, cooldown: 1.15, chains: 8, chainRange: 2.2 } },
      { id: 'tesla', name: 'Tesla Overload', description: 'Devastating bolt that stuns.', stats: { damage: 165, range: 3.3, cooldown: 1.5, chains: 2, chainRange: 1.6, stun: 0.8 } },
    ],
  },
};

export const TOWER_ORDER: TowerId[] = ['archer', 'cannon', 'frost', 'lightning'];

export const TOWER_RULES = {
  sellRefund: 0.7,
  /** Damage multiplier of the chain decay for each lightning jump. */
  chainFalloff: 0.85,
  /** Projectile hit radius in tiles. */
  projectileHitRadius: 0.3,
  /** Armor shred duration in seconds. */
  shredDuration: 3,
  /** Ground-only towers never target flyers. */
  defaultTargetMode: 'first' as TargetMode,
};

/** Returns stats for a tower tier (1-3) or specialisation (tier 4 + branch index). */
export function towerStats(def: TowerDef, tier: number, branch: number): TowerStats {
  if (tier >= 4 && branch >= 0) return { ...def.tiers[2], ...def.branches[branch].stats };
  return def.tiers[Math.min(tier, 3) - 1];
}

export function totalInvested(def: TowerDef, tier: number): number {
  let total = def.cost;
  for (let i = 0; i < tier - 1; i++) total += def.upgradeCosts[i];
  return total;
}
