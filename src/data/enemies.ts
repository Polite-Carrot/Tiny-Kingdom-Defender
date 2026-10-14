// Enemy balance data. Speeds are tiles/second.

export type EnemyId =
  | 'grunt' | 'runner' | 'knight' | 'bat' | 'shaman' | 'shield'
  | 'scarab' | 'wraith' | 'wolf' | 'golem' | 'fireimp' | 'magmaslug' | 'slugling'
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
  /** Burrows underground now and then: untargetable while hidden. */
  burrow?: { interval: number; duration: number };
  /** Freezes the nearest tower in range for a while. */
  freezeTowers?: { interval: number; radius: number; duration: number };
  /** Splits into smaller enemies when killed. */
  split?: { id: EnemyId; count: number };
  /** Immune to burning and poison. */
  dotImmune?: boolean;
  /** Which Age it belongs to (for the bestiary); undefined = everywhere. */
  age?: number;
  /** Boss mechanics. */
  boss?: {
    mechanics: BossMechanic[];
    summonId?: EnemyId; summonCount?: number; summonInterval?: number;
    chargeInterval?: number; chargeDuration?: number; chargeSpeedMult?: number;
    /** HP fractions at which the boss becomes immune. */
    immuneAt?: number[]; immuneDuration?: number;
  };
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  grunt: {
    id: 'grunt', name: 'Grunt', description: 'Basic goblin foot soldier.',
    hp: 34, speed: 1.0, armor: 0, magicResist: 0, flying: false, bounty: 4, leakDamage: 1, cost: 1, scale: 1,
  },
  runner: {
    id: 'runner', name: 'Runner', description: 'Fast and fragile.',
    hp: 22, speed: 1.9, armor: 0, magicResist: 0, flying: false, bounty: 4, leakDamage: 1, cost: 1.2, scale: 0.85,
  },
  knight: {
    id: 'knight', name: 'Knight', description: 'Armoured. Resists physical damage.',
    hp: 110, speed: 0.75, armor: 0.5, magicResist: 0, flying: false, bounty: 9, leakDamage: 2, cost: 3.2, scale: 1.15,
  },
  bat: {
    id: 'bat', name: 'Bat', description: 'Flying. Only towers that hit flyers can reach it.',
    hp: 30, speed: 1.45, armor: 0, magicResist: 0, flying: true, bounty: 5, leakDamage: 1, cost: 1.6, scale: 0.9,
  },
  shaman: {
    id: 'shaman', name: 'Shaman', description: 'Heals nearby enemies.',
    hp: 60, speed: 0.85, armor: 0, magicResist: 0.25, flying: false, bounty: 8, leakDamage: 1, cost: 3, scale: 1,
    heal: { amount: 10, radius: 1.8, interval: 2.0 },
  },
  shield: {
    id: 'shield', name: 'Shield-bearer', description: 'Shields allies right behind it.',
    hp: 140, speed: 0.75, armor: 0.3, magicResist: 0, flying: false, bounty: 10, leakDamage: 2, cost: 4, scale: 1.2,
    shield: { reduction: 0.45, range: 1.6 },
  },
  // Age of Sands.
  scarab: {
    id: 'scarab', name: 'Scarab Swarm', description: 'Tiny armoured beetles that come in huge numbers.', age: 1,
    hp: 14, speed: 1.55, armor: 0.35, magicResist: 0, flying: false, bounty: 2, leakDamage: 1, cost: 0.55, scale: 0.6,
  },
  wraith: {
    id: 'wraith', name: 'Sand Wraith', description: 'Burrows under the sand where towers cannot hit it.', age: 1,
    hp: 70, speed: 1.1, armor: 0.1, magicResist: 0.2, flying: false, bounty: 8, leakDamage: 1, cost: 2.6, scale: 1,
    burrow: { interval: 4, duration: 1.6 },
  },
  // Age of Frost.
  wolf: {
    id: 'wolf', name: 'Snow Wolf', description: 'Hunts in fast packs.', age: 2,
    hp: 40, speed: 2.0, armor: 0, magicResist: 0.1, flying: false, bounty: 4, leakDamage: 1, cost: 1.4, scale: 0.95,
  },
  golem: {
    id: 'golem', name: 'Ice Golem', description: 'Huge and slow. Freezes nearby towers solid.', age: 2,
    hp: 300, speed: 0.6, armor: 0.4, magicResist: 0.2, flying: false, bounty: 18, leakDamage: 3, cost: 7, scale: 1.45,
    freezeTowers: { interval: 6, radius: 2.4, duration: 2.5 },
  },
  // Age of Fire.
  fireimp: {
    id: 'fireimp', name: 'Fire Imp', description: 'Flying fire spirit. Shrugs off magic.', age: 3,
    hp: 46, speed: 1.6, armor: 0, magicResist: 0.5, flying: true, bounty: 6, leakDamage: 1, cost: 2, scale: 0.85, dotImmune: true,
  },
  magmaslug: {
    id: 'magmaslug', name: 'Lava Slug', description: 'Splits into two sluglings when killed. Immune to burning.', age: 3,
    hp: 150, speed: 0.7, armor: 0.25, magicResist: 0.1, flying: false, bounty: 10, leakDamage: 2, cost: 4.5, scale: 1.2, dotImmune: true,
    split: { id: 'slugling', count: 2 },
  },
  slugling: {
    id: 'slugling', name: 'Slugling', description: 'What is left of a Lava Slug.', age: 3,
    hp: 45, speed: 1.0, armor: 0.1, magicResist: 0, flying: false, bounty: 2, leakDamage: 1, cost: 1, scale: 0.7, dotImmune: true,
  },
  minion: {
    id: 'minion', name: 'Imp', description: 'Summoned by bosses.',
    hp: 26, speed: 1.3, armor: 0, magicResist: 0, flying: false, bounty: 1, leakDamage: 1, cost: 0.8, scale: 0.7,
  },
  boss_ogre: {
    id: 'boss_ogre', name: 'Ogre Warchief', description: 'Summons imps as it marches.',
    hp: 1800, speed: 0.48, armor: 0.2, magicResist: 0.1, flying: false, bounty: 120, leakDamage: 8, cost: 40, scale: 2.0,
    boss: { mechanics: ['summon'], summonId: 'minion', summonCount: 3, summonInterval: 6 },
  },
  boss_scorpion: {
    id: 'boss_scorpion', name: 'Sand Colossus', description: 'Hardens its shell and becomes briefly immune.',
    hp: 1700, speed: 0.5, armor: 0.35, magicResist: 0.1, flying: false, bounty: 160, leakDamage: 8, cost: 55, scale: 2.0,
    boss: { mechanics: ['immune', 'summon'], immuneAt: [0.7, 0.4], immuneDuration: 3, summonId: 'runner', summonCount: 3, summonInterval: 9 },
  },
  boss_yeti: {
    id: 'boss_yeti', name: 'Frost Yeti', description: 'Periodically charges forward at great speed.',
    hp: 1800, speed: 0.45, armor: 0.25, magicResist: 0.3, flying: false, bounty: 200, leakDamage: 10, cost: 70, scale: 2.1,
    boss: { mechanics: ['charge'], chargeInterval: 7, chargeDuration: 1.6, chargeSpeedMult: 3.2 },
  },
  boss_dragon: {
    id: 'boss_dragon', name: 'Magma Drake', description: 'Charges, summons and shields itself in flame.',
    hp: 1900, speed: 0.5, armor: 0.3, magicResist: 0.3, flying: false, bounty: 260, leakDamage: 12, cost: 90, scale: 2.2,
    boss: { mechanics: ['charge', 'summon', 'immune'], chargeInterval: 9, chargeDuration: 1.4, chargeSpeedMult: 2.8, summonId: 'minion', summonCount: 2, summonInterval: 9, immuneAt: [0.5], immuneDuration: 3 },
  },
};

export const REGULAR_ENEMIES: EnemyId[] = ['grunt', 'runner', 'knight', 'bat', 'shaman', 'shield', 'scarab', 'wraith', 'wolf', 'golem', 'fireimp', 'magmaslug'];
export const BOSS_BY_CHAPTER: EnemyId[] = ['boss_ogre', 'boss_scorpion', 'boss_yeti', 'boss_dragon'];

export const ENEMY_RULES = {
  /** Spacing in seconds between spawns inside a group. */
  spawnSpacing: 0.75,
  /** Health of hero contact damage per second dealt by an adjacent enemy. */
  contactDps: 6,
  bossContactDps: 30,
  /** Flying enemies hover at this height. */
  flyHeight: 0.9,
};

/** Elite enemies: rare, glowing, tougher variants with one trait. */
export type EliteTrait = 'regen' | 'splitter' | 'unstoppable' | 'armored' | 'swift';

export const ELITES: Record<EliteTrait, { name: string; description: string; color: string }> = {
  regen: { name: 'Regenerating', description: 'Heals quickly over time.', color: '#5aff8a' },
  splitter: { name: 'Splitting', description: 'Splits into two when killed.', color: '#c86af0' },
  unstoppable: { name: 'Unstoppable', description: 'Cannot be slowed, stunned or frozen.', color: '#ff5a4a' },
  armored: { name: 'Armoured', description: 'Shrugs off much more damage of both kinds.', color: '#c9d2df' },
  swift: { name: 'Swift', description: 'Moves half again as fast.', color: '#ffd84a' },
};

export const ELITE_RULES = {
  /** No elites before this wave. */
  firstWave: 8,
  /** Chance per regular spawn: base + perWave × wave, capped. */
  chanceBase: 0.025,
  chancePerWave: 0.0006,
  chanceMax: 0.09,
  hpMult: 2.6,
  bountyMult: 4,
  scale: 1.25,
  regenPerSecond: 0.035,
  armorBonus: 0.3,
  swiftMult: 1.5,
  /** Gems awarded for killing an elite. */
  gems: 1,
};
