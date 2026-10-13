// Enemy balance data. Speeds are tiles/second.

export type EnemyId =
  | 'grunt' | 'runner' | 'knight' | 'bat' | 'shaman' | 'shield'
  | 'boss_ogre' | 'boss_scorpion' | 'boss_yeti' | 'boss_dragon'
  | 'minion';

export type BossMechanic = 'summon' | 'charge' | 'immune';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  description: string;
  hp: number;
  speed: number;
  /** Fraction of physical damage ignored (0..1). */
  armor: number;
  /** Fraction of magic damage ignored (0..1). */
  magicResist: number;
  flying: boolean;
  /** Gold given on kill. */
  bounty: number;
  /** Castle damage on leak. */
  leakDamage: number;
  /** Wave composer budget cost. */
  cost: number;
  /** Visual size multiplier. */
  scale: number;
  /** Healer config. */
  heal?: { amount: number; radius: number; interval: number };
  /** Protects allies behind it on the path. */
  shield?: { reduction: number; range: number };
  /** Boss mechanics. */
  boss?: {
    mechanics: BossMechanic[];
    summonId?: EnemyId; summonCount?: number; summonInterval?: number;
    chargeInterval?: number; chargeDuration?: number; chargeSpeedMult?: number;
    /** HP fractions at which the boss becomes immune. */
    immuneAt?: number[]; immuneDuration?: number;
  };
  /** Earliest level index (global, 0-based) the composer may use it. */
  unlockLevel: number;
  /** Earliest wave index within a level (keeps opening waves fair). */
  minWave?: number;
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  grunt: {
    id: 'grunt', name: 'Grunt', description: 'Basic goblin foot soldier.',
    hp: 34, speed: 1.0, armor: 0, magicResist: 0, flying: false, bounty: 4, leakDamage: 1, cost: 1, scale: 1, unlockLevel: 0,
  },
  runner: {
    id: 'runner', name: 'Runner', description: 'Fast and fragile.',
    hp: 22, speed: 1.9, armor: 0, magicResist: 0, flying: false, bounty: 4, leakDamage: 1, cost: 1.2, scale: 0.85, unlockLevel: 1,
  },
  knight: {
    id: 'knight', name: 'Knight', description: 'Armoured. Resists physical damage.',
    hp: 110, speed: 0.75, armor: 0.5, magicResist: 0, flying: false, bounty: 9, leakDamage: 2, cost: 3.2, scale: 1.15, unlockLevel: 3, minWave: 2,
  },
  bat: {
    id: 'bat', name: 'Bat', description: 'Flying. Only Archer, Frost and Lightning can hit it.',
    hp: 30, speed: 1.45, armor: 0, magicResist: 0, flying: true, bounty: 5, leakDamage: 1, cost: 1.6, scale: 0.9, unlockLevel: 4, minWave: 1,
  },
  shaman: {
    id: 'shaman', name: 'Shaman', description: 'Heals nearby enemies.',
    hp: 60, speed: 0.85, armor: 0, magicResist: 0.25, flying: false, bounty: 8, leakDamage: 1, cost: 3, scale: 1,
    heal: { amount: 10, radius: 1.8, interval: 2.0 }, unlockLevel: 6, minWave: 2,
  },
  shield: {
    id: 'shield', name: 'Shield-bearer', description: 'Shields allies right behind it.',
    hp: 140, speed: 0.75, armor: 0.3, magicResist: 0, flying: false, bounty: 10, leakDamage: 2, cost: 4, scale: 1.2,
    shield: { reduction: 0.45, range: 1.6 }, unlockLevel: 8, minWave: 3,
  },
  minion: {
    id: 'minion', name: 'Imp', description: 'Summoned by bosses.',
    hp: 26, speed: 1.3, armor: 0, magicResist: 0, flying: false, bounty: 1, leakDamage: 1, cost: 0.8, scale: 0.7, unlockLevel: 999,
  },
  boss_ogre: {
    id: 'boss_ogre', name: 'Ogre Warchief', description: 'Summons imps as it marches.',
    hp: 1800, speed: 0.48, armor: 0.2, magicResist: 0.1, flying: false, bounty: 120, leakDamage: 8, cost: 40, scale: 2.0,
    boss: { mechanics: ['summon'], summonId: 'minion', summonCount: 3, summonInterval: 6 }, unlockLevel: 999,
  },
  boss_scorpion: {
    id: 'boss_scorpion', name: 'Sand Colossus', description: 'Hardens its shell and becomes briefly immune.',
    hp: 1700, speed: 0.5, armor: 0.35, magicResist: 0.1, flying: false, bounty: 160, leakDamage: 8, cost: 55, scale: 2.0,
    boss: { mechanics: ['immune', 'summon'], immuneAt: [0.7, 0.4], immuneDuration: 3, summonId: 'runner', summonCount: 3, summonInterval: 9 }, unlockLevel: 999,
  },
  boss_yeti: {
    id: 'boss_yeti', name: 'Frost Yeti', description: 'Periodically charges forward at great speed.',
    hp: 1800, speed: 0.45, armor: 0.25, magicResist: 0.3, flying: false, bounty: 200, leakDamage: 10, cost: 70, scale: 2.1,
    boss: { mechanics: ['charge'], chargeInterval: 7, chargeDuration: 1.6, chargeSpeedMult: 3.2 }, unlockLevel: 999,
  },
  boss_dragon: {
    id: 'boss_dragon', name: 'Magma Drake', description: 'Charges, summons and shields itself in flame.',
    hp: 1900, speed: 0.5, armor: 0.3, magicResist: 0.3, flying: false, bounty: 260, leakDamage: 12, cost: 90, scale: 2.2,
    boss: { mechanics: ['charge', 'summon', 'immune'], chargeInterval: 9, chargeDuration: 1.4, chargeSpeedMult: 2.8, summonId: 'minion', summonCount: 2, summonInterval: 9, immuneAt: [0.5], immuneDuration: 3 }, unlockLevel: 999,
  },
};

export const REGULAR_ENEMIES: EnemyId[] = ['grunt', 'runner', 'knight', 'bat', 'shaman', 'shield'];
export const BOSS_BY_CHAPTER: EnemyId[] = ['boss_ogre', 'boss_scorpion', 'boss_yeti', 'boss_dragon'];

export const ENEMY_RULES = {
  /** Enemy HP multiplier per global level index (applied on top of wave scaling). */
  hpGrowthPerLevel: 0.04,
  /** Bounty scales with HP^exponent so tougher enemies pay more (but gold/HP still falls). */
  bountyHpExponent: 0.6,
  /** Boss HP scale for each boss appearance within the chapter (levels 5, 10, 15). */
  bossTierHp: [0.7, 0.85, 1.1],
  /** Spacing in seconds between spawns inside a group. */
  spawnSpacing: 0.75,
  /** Health of hero contact damage per second dealt by an adjacent enemy. */
  contactDps: 6,
  bossContactDps: 30,
  /** Flying enemies hover at this height. */
  flyHeight: 0.9,
};
