// Tower balance data. Towers have 10 tiers; each tier is a new building material.
// Distances are in tiles (1 tile = 1 world unit). Times are in seconds.

export type TowerId = 'archer' | 'cannon' | 'frost' | 'lightning' | 'mage' | 'ballista' | 'flame' | 'alchemist' | 'catapult' | 'gale' | 'mine' | 'beacon';
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
  /** Chance to freeze (full stop) for `stun` seconds. */
  freezeChance: number;
  /** Armor shred: removes this much armor for a few seconds. */
  shred: number;
  /** Pulses damage+slow on all enemies in range instead of shooting. */
  aura: boolean;
  /** Bolts fly straight through this many enemies (0 = normal homing shot). */
  pierce: number;
  /** Damage over time: per second, as a fraction of the hit damage, for dotDuration seconds. */
  dot: number;
  dotDuration: number;
  /** Tiles each hit pushes an enemy back along its road (Storm Shrine). */
  knockback: number;
  /** Gold paid at the end of every wave (Gold Mine). */
  income: number;
  /** Extra gold from enemies that die within range (Prospector mine). */
  goldAura: number;
  /** Damage bonus given to every tower in range (Beacon). */
  buff: number;
  /** Faster firing given to towers in range (Haste beacon), 0.15 = 15%. */
  haste: number;
}

/** How stats grow with each tier above 1. */
export interface TierGrowth {
  damage: number; // multiplier per tier
  range: number; // tiles added per tier
  rangeMax: number; // max tiles added by tiers
  cooldown: number; // multiplier per tier (<1 = faster)
  splash: number; // tiles added per tier
  slow: number; // slowFactor reduction per tier
  slowMin: number;
  chainsEvery: number; // +1 chain every N tiers (0 = never)
}

/** A specialisation chosen when upgrading from tier 3 to tier 4. Applies to every tier from 4 up. */
export interface TowerBranch {
  id: string;
  name: string;
  description: string;
  damageMult: number;
  rangeAdd?: number;
  cooldownMult?: number;
  splashAdd?: number;
  set?: Partial<TowerStats>;
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
  base: TowerStats;
  growth: TierGrowth;
  /** Cost of the first upgrade (tier 1 -> 2); each next one is UPGRADE_COST_GROWTH times more. */
  firstUpgrade: number;
  branches: [TowerBranch, TowerBranch];
}

/** Material tiers (Wood … Celestial). */
export const MAX_TIER = 10;
/** After Celestial, towers keep growing with star levels (★1, ★2, …) up to this total level. */
export const MAX_LEVEL = MAX_TIER + 30;
export const STAR_DAMAGE = 1.18;
export const STAR_COST_GROWTH = 1.35;
/** Upgrading from this tier picks a specialisation. */
export const BRANCH_TIER = 3;
export const UPGRADE_COST_GROWTH = 1.8;

export interface TierMaterial {
  name: string;
  /** Main walls. */
  body: string;
  /** Trim, bands and crenellations. */
  trim: string;
  /** Roof / cap. */
  roof: string;
  /** Accent (gems, flags, rings). Values above 1 in the shader glow slightly. */
  accent: string;
  glow: number;
}

/** One material per tier: Wood → Stone → … → Celestial. */
export const TIER_MATERIALS: TierMaterial[] = [
  { name: 'Wood', body: '#9a6a3f', trim: '#6e4527', roof: '#b5803f', accent: '#e8c547', glow: 1 },
  { name: 'Stone', body: '#c9c1b3', trim: '#a39a8b', roof: '#d9573f', accent: '#e8c547', glow: 1 },
  { name: 'Iron', body: '#8a929e', trim: '#5d6470', roof: '#4a5260', accent: '#d9dde3', glow: 1 },
  { name: 'Bronze', body: '#c58a4e', trim: '#8f5a2c', roof: '#a8662e', accent: '#ffd27a', glow: 1 },
  { name: 'Silver', body: '#dfe5ec', trim: '#a8b2bf', roof: '#5a7fd1', accent: '#ffffff', glow: 1.1 },
  { name: 'Gold', body: '#f2cf5b', trim: '#c9952a', roof: '#d9573f', accent: '#fff3b0', glow: 1.2 },
  { name: 'Jade', body: '#6fcf9b', trim: '#3f8f66', roof: '#2f6f4e', accent: '#e8fff2', glow: 1.25 },
  { name: 'Crystal', body: '#a9e4fb', trim: '#6fb8de', roof: '#c8a6ff', accent: '#ffffff', glow: 1.45 },
  { name: 'Obsidian', body: '#3b3346', trim: '#231d2b', roof: '#7b4fd6', accent: '#c58cff', glow: 1.7 },
  { name: 'Celestial', body: '#fff8e8', trim: '#f2c94c', roof: '#7fd6ff', accent: '#fff2a8', glow: 1.9 },
];

const base = (o: Partial<TowerStats>): TowerStats => ({
  damage: 0, range: 0, cooldown: 1, splash: 0, projectileSpeed: 0, slowFactor: 1, slowDuration: 0,
  chains: 0, chainRange: 0, multishot: 1, stun: 0, freezeChance: 0, shred: 0, aura: false, pierce: 0, dot: 0, dotDuration: 0,
  knockback: 0, income: 0, goldAura: 0, buff: 0, haste: 0, ...o,
});

export const TOWERS: Record<TowerId, TowerDef> = {
  archer: {
    id: 'archer', name: 'Archer', role: 'Fast single-target. Hits flying.', cost: 70,
    damageType: 'physical', hitsAir: true, hitsGround: true, color: '#7bbf5a',
    base: base({ damage: 8, range: 2.9, cooldown: 0.6, projectileSpeed: 16 }),
    growth: { damage: 1.42, range: 0.12, rangeMax: 1.2, cooldown: 0.97, splash: 0, slow: 0, slowMin: 1, chainsEvery: 0 },
    firstUpgrade: 60,
    branches: [
      { id: 'longbow', name: 'Longbow', description: 'Huge range, heavy piercing arrows.', damageMult: 2.4, rangeAdd: 1.1, cooldownMult: 1.6, set: { projectileSpeed: 26, shred: 0.15 } },
      { id: 'volley', name: 'Volley', description: 'Fires at 3 enemies at once.', damageMult: 0.95, cooldownMult: 0.85, set: { multishot: 3 } },
    ],
  },
  cannon: {
    id: 'cannon', name: 'Cannon', role: 'Slow splash damage. Ground only.', cost: 120,
    damageType: 'physical', hitsAir: false, hitsGround: true, color: '#c9783f',
    base: base({ damage: 24, range: 2.7, cooldown: 1.9, splash: 1.05, projectileSpeed: 7 }),
    growth: { damage: 1.42, range: 0.1, rangeMax: 1.0, cooldown: 0.97, splash: 0.06, slow: 0, slowMin: 1, chainsEvery: 0 },
    firstUpgrade: 95,
    branches: [
      { id: 'bombard', name: 'Bombard', description: 'Massive blast radius and damage.', damageMult: 2.0, rangeAdd: 0.3, cooldownMult: 1.15, splashAdd: 0.55 },
      { id: 'shrapnel', name: 'Shrapnel', description: 'Rapid fire. Shreds armor.', damageMult: 0.9, cooldownMult: 0.55, set: { projectileSpeed: 10, shred: 0.3 } },
    ],
  },
  frost: {
    id: 'frost', name: 'Frost', role: 'Slows enemies. Low damage.', cost: 90,
    damageType: 'magic', hitsAir: true, hitsGround: true, color: '#7fd0f0',
    base: base({ damage: 4, range: 2.6, cooldown: 1.0, splash: 0.6, projectileSpeed: 11, slowFactor: 0.6, slowDuration: 1.6 }),
    growth: { damage: 1.4, range: 0.1, rangeMax: 1.0, cooldown: 0.97, splash: 0.05, slow: 0.035, slowMin: 0.3, chainsEvery: 0 },
    firstUpgrade: 70,
    branches: [
      { id: 'glacier', name: 'Glacier', description: 'Deep slow and a chance to freeze solid.', damageMult: 2.0, set: { freezeChance: 0.18, stun: 1.0, slowDuration: 2.4 } },
      { id: 'blizzard', name: 'Blizzard', description: 'Constant icy aura hits everything in range.', damageMult: 1.1, cooldownMult: 0.55, rangeAdd: -0.3, set: { aura: true, slowDuration: 0.8 } },
    ],
  },
  lightning: {
    id: 'lightning', name: 'Lightning', role: 'Chains between 3+ enemies.', cost: 150,
    damageType: 'magic', hitsAir: true, hitsGround: true, color: '#b48cf0',
    base: base({ damage: 20, range: 2.8, cooldown: 1.45, chains: 3, chainRange: 1.8 }),
    growth: { damage: 1.4, range: 0.1, rangeMax: 1.0, cooldown: 0.97, splash: 0, slow: 0, slowMin: 1, chainsEvery: 2 },
    firstUpgrade: 115,
    branches: [
      { id: 'storm', name: 'Storm Spire', description: 'Chains to 4 more enemies.', damageMult: 1.15, rangeAdd: 0.2, set: { chainRange: 2.2 } },
      { id: 'tesla', name: 'Tesla Overload', description: 'Devastating bolt that stuns.', damageMult: 3.2, cooldownMult: 1.1, set: { stun: 0.8, chainRange: 1.6 } },
    ],
  },
  mage: {
    id: 'mage', name: 'Mage', role: 'Arcane bolts. Ignores armor.', cost: 110,
    damageType: 'magic', hitsAir: true, hitsGround: true, color: '#9b7bff',
    base: base({ damage: 15, range: 2.8, cooldown: 1.05, projectileSpeed: 10 }),
    growth: { damage: 1.42, range: 0.1, rangeMax: 1.0, cooldown: 0.97, splash: 0, slow: 0, slowMin: 1, chainsEvery: 0 },
    firstUpgrade: 85,
    branches: [
      { id: 'archmage', name: 'Archmage', description: 'Huge arcane orbs that burst on impact.', damageMult: 2.2, cooldownMult: 1.25, set: { splash: 0.9 } },
      { id: 'barrage', name: 'Arcane Barrage', description: 'Fires at 3 enemies at once.', damageMult: 0.9, cooldownMult: 0.8, set: { multishot: 3 } },
    ],
  },
  ballista: {
    id: 'ballista', name: 'Ballista', role: 'Long range. Bolts pierce a whole line.', cost: 140,
    damageType: 'physical', hitsAir: true, hitsGround: true, color: '#b58a5a',
    base: base({ damage: 22, range: 3.5, cooldown: 2.0, projectileSpeed: 18, pierce: 3 }),
    growth: { damage: 1.42, range: 0.12, rangeMax: 1.2, cooldown: 0.97, splash: 0, slow: 0, slowMin: 1, chainsEvery: 0 },
    firstUpgrade: 105,
    branches: [
      { id: 'siege', name: 'Siege Bolt', description: 'Massive bolts that pierce everything and shred armor.', damageMult: 2.3, rangeAdd: 0.5, cooldownMult: 1.2, set: { pierce: 8, shred: 0.25, projectileSpeed: 24 } },
      { id: 'repeater', name: 'Repeater', description: 'Rapid-fire bolts.', damageMult: 0.85, cooldownMult: 0.45 },
    ],
  },
  flame: {
    id: 'flame', name: 'Flame', role: 'Short range. Sets enemies burning.', cost: 130,
    damageType: 'magic', hitsAir: false, hitsGround: true, color: '#ff7a2a',
    base: base({ damage: 4, range: 2.1, cooldown: 0.45, splash: 0.5, projectileSpeed: 9, dot: 0.4, dotDuration: 2.5 }),
    growth: { damage: 1.42, range: 0.08, rangeMax: 0.8, cooldown: 0.98, splash: 0.04, slow: 0, slowMin: 1, chainsEvery: 0 },
    firstUpgrade: 100,
    branches: [
      { id: 'inferno', name: 'Inferno', description: 'Bigger blasts that burn far longer.', damageMult: 1.4, splashAdd: 0.3, set: { dot: 0.6, dotDuration: 4 } },
      { id: 'dragon', name: "Dragon's Breath", description: 'Long fiery reach and faster flames.', damageMult: 1.3, rangeAdd: 1.0, cooldownMult: 0.75 },
    ],
  },
  alchemist: {
    id: 'alchemist', name: 'Alchemist', role: 'Poison flasks. Melts armor over time.', cost: 125,
    damageType: 'physical', hitsAir: false, hitsGround: true, color: '#7fd65a',
    base: base({ damage: 6, range: 2.7, cooldown: 1.8, splash: 0.9, projectileSpeed: 6, dot: 0.9, dotDuration: 4, shred: 0.15 }),
    growth: { damage: 1.42, range: 0.1, rangeMax: 1.0, cooldown: 0.97, splash: 0.05, slow: 0, slowMin: 1, chainsEvery: 0 },
    firstUpgrade: 95,
    branches: [
      { id: 'plague', name: 'Plague', description: 'Huge toxic clouds and long-lasting poison.', damageMult: 1.6, splashAdd: 0.5, set: { dotDuration: 6 } },
      { id: 'corrosive', name: 'Corrosive', description: 'Strips armor and slows.', damageMult: 1.3, set: { shred: 0.45, slowFactor: 0.75, slowDuration: 2 } },
    ],
  },
  mine: {
    id: 'mine', name: 'Gold Mine', role: 'No attack. Digs up gold at the end of every wave.', cost: 150,
    damageType: 'physical', hitsAir: false, hitsGround: false, color: '#f2c94c',
    base: base({ range: 2.2, income: 14 }),
    growth: { damage: 1, range: 0.06, rangeMax: 0.6, cooldown: 1, splash: 0, slow: 0, slowMin: 1, chainsEvery: 0 },
    firstUpgrade: 110,
    branches: [
      { id: 'deepshaft', name: 'Deep Shaft', description: 'Digs far deeper: 60% more gold every wave.', damageMult: 1 },
      { id: 'prospector', name: 'Prospector', description: 'Enemies that fall nearby drop 30% more gold.', damageMult: 1, rangeAdd: 0.4, set: { goldAura: 0.3 } },
    ],
  },
  catapult: {
    id: 'catapult', name: 'Catapult', role: 'Very long range. Hurls boulders that crush crowds. Ground only.', cost: 160,
    damageType: 'physical', hitsAir: false, hitsGround: true, color: '#a08a6a',
    base: base({ damage: 38, range: 3.9, cooldown: 3.1, splash: 1.25, projectileSpeed: 5 }),
    growth: { damage: 1.42, range: 0.1, rangeMax: 1.0, cooldown: 0.97, splash: 0.06, slow: 0, slowMin: 1, chainsEvery: 0 },
    firstUpgrade: 120,
    branches: [
      { id: 'trebuchet', name: 'Trebuchet', description: 'Hurls from across the map. Huge boulders.', damageMult: 2.3, rangeAdd: 1.4, cooldownMult: 1.25, splashAdd: 0.3 },
      { id: 'firepot', name: 'Firepots', description: 'Flaming pots set whole crowds burning.', damageMult: 1.3, splashAdd: 0.4, set: { dot: 0.5, dotDuration: 3 } },
    ],
  },
  gale: {
    id: 'gale', name: 'Storm Shrine', role: 'Gusts of wind blow enemies back down the road.', cost: 135,
    damageType: 'magic', hitsAir: true, hitsGround: true, color: '#9fe3d0',
    base: base({ damage: 6, range: 2.6, cooldown: 1.7, splash: 0.55, projectileSpeed: 13, knockback: 0.7 }),
    growth: { damage: 1.4, range: 0.1, rangeMax: 1.0, cooldown: 0.97, splash: 0.03, slow: 0, slowMin: 1, chainsEvery: 0 },
    firstUpgrade: 100,
    branches: [
      { id: 'tempest', name: 'Tempest', description: 'Wider gusts that hurl enemies much further back.', damageMult: 1.4, splashAdd: 0.4 },
      { id: 'cyclone', name: 'Cyclone', description: 'Three whirlwinds at once.', damageMult: 0.9, cooldownMult: 0.85, set: { multishot: 3 } },
    ],
  },
  beacon: {
    id: 'beacon', name: 'Beacon', role: 'No attack. Its light makes nearby towers hit harder.', cost: 175,
    damageType: 'magic', hitsAir: false, hitsGround: false, color: '#ffe08a',
    base: base({ range: 2.2, buff: 0.15 }),
    growth: { damage: 1, range: 0.08, rangeMax: 0.8, cooldown: 1, splash: 0, slow: 0, slowMin: 1, chainsEvery: 0 },
    firstUpgrade: 130,
    branches: [
      { id: 'rally', name: 'War Banner', description: 'Its bonus to nearby towers is half again as big.', damageMult: 1 },
      { id: 'haste', name: 'Sunfire', description: 'Nearby towers also fire 15% faster.', damageMult: 1, set: { haste: 0.15 } },
    ],
  },
};

/** Towers that never attack (economy and support). */
export const SUPPORT_TOWERS: TowerId[] = ['mine', 'beacon'];
export const isSupport = (id: TowerId) => SUPPORT_TOWERS.includes(id);

export const TOWER_ORDER: TowerId[] = ['archer', 'cannon', 'frost', 'mage', 'ballista', 'lightning', 'mine', 'flame', 'catapult', 'gale', 'beacon', 'alchemist'];

export const TOWER_RULES = {
  sellRefund: 0.7,
  /** Damage multiplier of the chain decay for each lightning jump. */
  chainFalloff: 0.85,
  /** Projectile hit radius in tiles. */
  projectileHitRadius: 0.3,
  /** Armor shred duration in seconds. */
  shredDuration: 3,
  defaultTargetMode: 'first' as TargetMode,
};

/** Stars above Celestial for a tower level. */
export const starsOf = (level: number) => Math.max(0, level - MAX_TIER);

/** Stats for a tower at a level (1..MAX_LEVEL) with an optional specialisation (from tier 4). */
export function towerStats(def: TowerDef, tier: number, branch: number): TowerStats {
  const g = def.growth;
  const k = Math.max(0, Math.min(tier, MAX_TIER) - 1);
  const s: TowerStats = { ...def.base };
  s.damage = def.base.damage * Math.pow(g.damage, k) * Math.pow(STAR_DAMAGE, starsOf(tier));
  s.range = def.base.range + Math.min(g.rangeMax, g.range * k);
  s.cooldown = def.base.cooldown * Math.pow(g.cooldown, k);
  if (s.splash > 0) s.splash += g.splash * k;
  if (s.slowFactor < 1) s.slowFactor = Math.max(g.slowMin, def.base.slowFactor - g.slow * k);
  if (g.chainsEvery > 0) s.chains += Math.floor(k / g.chainsEvery);
  if (s.knockback > 0) s.knockback += 0.05 * k;
  if (s.income > 0) s.income = def.base.income * Math.pow(1.38, k) * Math.pow(STAR_DAMAGE, starsOf(tier));
  if (s.buff > 0) s.buff += 0.02 * k + 0.01 * starsOf(tier);
  if (tier > BRANCH_TIER && branch >= 0) {
    const b = def.branches[branch];
    s.damage *= b.damageMult;
    s.range += b.rangeAdd ?? 0;
    s.cooldown *= b.cooldownMult ?? 1;
    s.splash += b.splashAdd ?? 0;
    if (b.id === 'storm') s.chains += 4;
    if (b.id === 'tesla') s.chains = 2;
    if (b.id === 'tempest') s.knockback *= 1.8;
    if (b.id === 'deepshaft') s.income *= 1.6;
    if (b.id === 'rally') s.buff *= 1.5;
    Object.assign(s, b.set ?? {});
  }
  return s;
}

/** Gold to upgrade from `tier` to `tier + 1` (star levels grow more gently). */
export function upgradeCost(def: TowerDef, tier: number): number {
  const materialTier = Math.min(tier, MAX_TIER - 1);
  const base = def.firstUpgrade * Math.pow(UPGRADE_COST_GROWTH, materialTier - 1);
  const stars = Math.max(0, tier - (MAX_TIER - 1));
  return Math.round((base * Math.pow(STAR_COST_GROWTH, stars)) / 5) * 5;
}

/** Display name, e.g. "Iron", "Celestial ★3". */
export function levelName(level: number): string {
  const st = starsOf(level);
  return `${materialFor(level).name}${st ? ` ★${st}` : ''}`;
}

export function totalInvested(def: TowerDef, tier: number): number {
  let total = def.cost;
  for (let t = 1; t < tier; t++) total += upgradeCost(def, t);
  return total;
}

export function materialFor(tier: number): TierMaterial {
  return TIER_MATERIALS[Math.max(0, Math.min(TIER_MATERIALS.length - 1, tier - 1))];
}
