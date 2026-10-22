// Hero and ally unit data.

import type { IconName } from '../ui/icons';
import type { TargetMode } from './towers';

export type HeroId = 'ranger' | 'knight' | 'mage' | 'dwarf' | 'valkyrie' | 'ninja' | 'sniper';
export type AbilityKind = 'arrowRain' | 'taunt' | 'meteor' | 'quake' | 'holyLight' | 'shadowStrike' | 'rapidFire';

export interface HeroDef {
  id: HeroId;
  name: string;
  title: string;
  description: string;
  color: string;
  hp: number;
  damage: number;
  range: number;
  /** Attack range from the pad the hero stands on. */
  postRange: number;
  cooldown: number;
  speed: number;
  damageType: 'physical' | 'magic';
  hitsAir: boolean;
  respawnTime: number;
  /** HP regenerated per second while not in contact. */
  regen: number;
  /** Reaches every enemy on the map, wherever the hero stands (the Sniper). */
  global?: boolean;
  /** Which enemy the hero aims at (default: the closest). */
  targeting?: TargetMode;
  /** Shot speed (default 14). */
  shotSpeed?: number;
  ability: {
    kind: AbilityKind;
    name: string;
    description: string;
    cooldown: number;
    damage: number;
    radius: number;
    /** Stun/taunt/slow duration. */
    duration: number;
    /** Shadow Strike: how many enemies it hits. Holy Light: castle HP restored. */
    count?: number;
    /** How far from the hero the ability can be aimed. */
    castRange: number;
    /** Rapid Fire: the time between shots is multiplied by this while it lasts. */
    rapidRate?: number;
  };
}

export const HEROES: Record<HeroId, HeroDef> = {
  ranger: {
    id: 'ranger', name: 'Robin', title: 'Royal Ranger', color: '#4f9d4a',
    description: 'Quick bow attacks that hit flyers.',
    hp: 180, damage: 13, range: 3.0, postRange: 3.4, cooldown: 0.55, speed: 2.6, damageType: 'physical', hitsAir: true, respawnTime: 10, regen: 6,
    ability: { kind: 'arrowRain', name: 'Arrow Storm', description: 'Rains arrows on a wide area.', cooldown: 16, damage: 75, radius: 1.8, duration: 0, castRange: 4 },
  },
  knight: {
    id: 'knight', name: 'Sir Bramble', title: 'Castle Knight', color: '#5a7fd1',
    description: 'Hurls his mighty sword. Taunt stuns all nearby foes.',
    hp: 480, damage: 28, range: 1.1, postRange: 2.5, cooldown: 0.8, speed: 2.1, damageType: 'physical', hitsAir: false, respawnTime: 12, regen: 10,
    ability: { kind: 'taunt', name: 'Taunt', description: 'Stops every nearby enemy for 3s.', cooldown: 14, damage: 30, radius: 2.2, duration: 3, castRange: 0 },
  },
  mage: {
    id: 'mage', name: 'Elowen', title: 'Court Mage', color: '#a15bd1',
    description: 'Magic bolts. Meteor obliterates clusters.',
    hp: 150, damage: 24, range: 2.8, postRange: 3.0, cooldown: 0.9, speed: 2.3, damageType: 'magic', hitsAir: true, respawnTime: 12, regen: 5,
    ability: { kind: 'meteor', name: 'Meteor', description: 'Huge fire blast on the densest crowd.', cooldown: 20, damage: 260, radius: 1.6, duration: 0, castRange: 5 },
  },
  dwarf: {
    id: 'dwarf', name: 'Brokk', title: 'Dwarf Engineer', color: '#c9783f',
    description: 'Throws heavy hammers. His Earthquake cracks the ground.',
    hp: 560, damage: 36, range: 1.2, postRange: 2.4, cooldown: 1.0, speed: 1.9, damageType: 'physical', hitsAir: false, respawnTime: 12, regen: 12,
    ability: { kind: 'quake', name: 'Earthquake', description: 'Slams the ground: damages and slows every nearby enemy by 60% for 4s.', cooldown: 15, damage: 110, radius: 2.5, duration: 4, castRange: 0 },
  },
  valkyrie: {
    id: 'valkyrie', name: 'Seraphine', title: 'Sky Valkyrie', color: '#f2c94c',
    description: 'Winged guardian. Holy javelins strike flyers.',
    hp: 300, damage: 26, range: 2.6, postRange: 3.0, cooldown: 0.75, speed: 3.0, damageType: 'magic', hitsAir: true, respawnTime: 11, regen: 8,
    ability: { kind: 'holyLight', name: 'Holy Light', description: 'Smites nearby foes and restores 3 castle HP.', cooldown: 24, damage: 150, radius: 2.0, duration: 0, castRange: 0, count: 3 },
  },
  ninja: {
    id: 'ninja', name: 'Kage', title: 'Shadow Blade', color: '#5b4a8a',
    description: 'Lightning-fast throwing stars. Vanishes and strikes again.',
    hp: 230, damage: 22, range: 1.3, postRange: 2.6, cooldown: 0.5, speed: 3.6, damageType: 'physical', hitsAir: false, respawnTime: 9, regen: 7,
    ability: { kind: 'shadowStrike', name: 'Shadow Strike', description: 'Dashes through the 6 toughest enemies nearby, striking each.', cooldown: 13, damage: 170, radius: 0.6, duration: 0, castRange: 4.2, count: 6 },
  },
  sniper: {
    id: 'sniper', name: 'Wren', title: 'Royal Marksman', color: '#3f6f8f',
    description: 'Shoots anywhere on the map. Picks off the toughest enemy.',
    hp: 160, damage: 70, range: 99, postRange: 99, cooldown: 2.3, speed: 2.2, damageType: 'physical', hitsAir: true, respawnTime: 12, regen: 5,
    global: true, targeting: 'strongest', shotSpeed: 34,
    ability: { kind: 'rapidFire', name: 'Rapid Fire', description: 'Fires four times as fast for 6 seconds.', cooldown: 22, damage: 0, radius: 0, duration: 6, castRange: 0, rapidRate: 0.25 },
  },
};

export const HERO_ORDER: HeroId[] = ['ranger', 'knight', 'mage', 'dwarf', 'valkyrie', 'ninja', 'sniper'];

/** Heroes are free towers: they wait off the board until placed on any empty pad (moving later costs gold). */
export const HERO_POST = {
  /** Height of the wall walk above the castle gate, and of a pad. */
  wallHeight: 0.8,
  wallOffset: 0.42,
  padHeight: 0.1,
  /** Moving the hero after the free placement: base × (1 + wave × perWave) gold. */
  moveCost: 40,
  moveCostPerWave: 0.08,
  /** Rally perk: damage bonus for towers in the hero's range. */
  rally: 0.1,
  /** Guardian perk: castle HP restored per wave cleared. */
  guardianHp: 1,
};

/** Elite unit summoned by the Reinforcements rewarded ad. */
export const REINFORCEMENT = {
  name: 'Royal Champion',
  damage: 60,
  range: 2.4,
  cooldown: 0.45,
  splash: 0.8,
  hitsAir: true,
};

/** Hero experience: heroes level up from the enemies they defeat, and their gear upgrades with level. */
export const HERO_LEVELS = {
  max: 30,
  /** Total XP to reach level L (L ≥ 2): base × (L − 1)^exp. */
  xpBase: 60,
  xpExp: 1.55,
  hpPerLevel: 0.06,
  damagePerLevel: 0.05,
  abilityPerLevel: 0.04,
  cooldownPerLevel: 0.01,
  cooldownMin: 0.72,
  /**
   * Heroes level up from their own kills only: perCost × enemy cost (bosses and elites give more).
   * Tuned so a hero placed in the thick of it reaches about level 5 in a siege or two, level 10
   * after several sessions, and level 30 is a long-term goal.
   */
  xpPerCost: 3,
  bossXp: 90,
  eliteXp: 18,
};

export interface GearTier {
  level: number;
  name: string;
  color: string;
}

/** Gear unlocked at these levels; each adds a visible piece (pauldrons, cape, glowing weapon gem, crown). */
export const HERO_GEAR: GearTier[] = [
  { level: 1, name: 'Recruit', color: '#8a7a6a' },
  { level: 5, name: 'Veteran', color: '#c58a4e' },
  { level: 10, name: 'Elite', color: '#dfe5ec' },
  { level: 20, name: 'Champion', color: '#f2c94c' },
  { level: 30, name: 'Legend', color: '#ff9bf0' },
];

export function xpForLevel(level: number): number {
  return level <= 1 ? 0 : Math.round(HERO_LEVELS.xpBase * Math.pow(level - 1, HERO_LEVELS.xpExp));
}

export function heroLevelFor(xp: number): number {
  let l = 1;
  while (l < HERO_LEVELS.max && xp >= xpForLevel(l + 1)) l++;
  return l;
}

/** Index into HERO_GEAR for a level. */
export function gearTierFor(level: number): number {
  let t = 0;
  for (let i = 0; i < HERO_GEAR.length; i++) if (level >= HERO_GEAR[i].level) t = i;
  return t;
}

// --- Hero skills: at these levels you pick one of two perks (per hero, kept forever) ---------

export type PerkId = 'eagleEye' | 'brawler' | 'vigor' | 'swift' | 'focus' | 'empower' | 'phoenix' | 'bounty' | 'guardian' | 'legend';

export interface PerkDef {
  id: PerkId;
  name: string;
  description: string;
  icon: IconName;
}

export const PERKS: Record<PerkId, PerkDef> = {
  eagleEye: { id: 'eagleEye', name: 'Eagle Eye', description: '+25% attack range', icon: 'target' },
  brawler: { id: 'brawler', name: 'Brawler', description: '+20% damage', icon: 'sword' },
  vigor: { id: 'vigor', name: 'Rally', description: 'Towers in the hero\'s range deal 10% more damage', icon: 'flag' },
  swift: { id: 'swift', name: 'Swift', description: 'Attacks 25% faster', icon: 'fast' },
  focus: { id: 'focus', name: 'Focus', description: 'Ability recharges 25% faster', icon: 'hourglass' },
  empower: { id: 'empower', name: 'Empower', description: 'Ability is 40% stronger', icon: 'sparkle' },
  phoenix: { id: 'phoenix', name: 'Phoenix', description: 'The ability is ready again at the start of every wave', icon: 'flame' },
  bounty: { id: 'bounty', name: 'Bounty Hunter', description: 'Enemies the hero defeats drop 50% more gold', icon: 'coin' },
  guardian: { id: 'guardian', name: 'Guardian', description: 'Restores 1 castle HP after every wave cleared', icon: 'shield' },
  legend: { id: 'legend', name: 'Legend', description: '+30% damage', icon: 'crown' },
};

/** Skill tiers: the level they open at and the two perks to choose from. */
export const PERK_TIERS: { level: number; options: [PerkId, PerkId] }[] = [
  { level: 3, options: ['eagleEye', 'brawler'] },
  { level: 7, options: ['vigor', 'swift'] },
  { level: 12, options: ['focus', 'empower'] },
  { level: 18, options: ['phoenix', 'bounty'] },
  { level: 25, options: ['guardian', 'legend'] },
];
