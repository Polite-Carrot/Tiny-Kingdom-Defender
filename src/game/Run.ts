// The in-run simulation. Pure logic with no rendering dependencies so it can be
// driven both by the 3D game and by the headless balance simulator.

import { ENEMIES, ENEMY_RULES, ELITES, ELITE_RULES, type EnemyDef, type EnemyId, type EliteTrait } from '../data/enemies';
import {
  TOWERS, TOWER_RULES, MAX_LEVEL, BRANCH_TIER, towerStats, totalInvested, upgradeCost, isSupport,
  type TowerDef, type TowerId, type TowerStats, type TargetMode, type DamageType,
} from '../data/towers';
import { HEROES, REINFORCEMENT, HERO_LEVELS, HERO_POST, type HeroDef, type HeroId } from '../data/heroes';
import { TOWER_META, AD_REWARDS, BATTLEMENTS } from '../data/economy';
import { SIEGE, BARRICADE } from '../data/base';

/** Foundations on open ground cost this many times clearing an overgrown pad (clearing is the bargain). */
const FOUNDATION_PRICE = 2;
import { Emitter } from '../core/Emitter';
import { Random } from '../core/Random';
import { tileToWorld, type LevelMap, type PathPoint } from './LevelMap';
import { SYNERGIES, SYNERGY_RANGE, type SynergyId } from '../data/synergies';
import { kingdomMap, siegeWave, clearLandCost, checkpointOf, ageOf, initialSpots, hpMultFor, goldScaleAt, openRoads, nightOf, activeRoads } from './Siege';
import type { WaveDef } from './WaveComposer';
import { MASTERY, towerBonus } from '../data/mastery';
import type { ChallengeMods } from '../data/challenge';
import { SPELL_RULES, spellPower, spellCooldown, type SpellId } from '../data/spells';
import type { PerkId } from '../data/heroes';

export interface MetaBonuses {
  towerLevels: Record<TowerId, number>;
  castleHpBonus: number;
  /** Extra kill gold as a fraction (0.1 = +10%). */
  goldBonus: number;
  heroPower: number;
  heroId: HeroId | null;
  /** Selected hero's level (1 if absent). */
  heroLevel?: number;
  /** Castle battlements level (archers on the walls). */
  battlements?: number;
  /** Mastery level of each tower type. */
  mastery?: Partial<Record<TowerId, number>>;
  /** Extra tower damage from the kingdom (0.05 = +5%). */
  towerDamage?: number;
  /** Barricade HP multiplier. */
  barricadeHp?: number;
  /** Spells you can cast, with their upgrade levels. */
  spells?: Partial<Record<SpellId, number>>;
  /** The hero's chosen skill perks. */
  heroPerks?: PerkId[];
  /** A second hero (late-game slot), with their own level and perks. */
  hero2?: { id: HeroId; level: number; perks: PerkId[] } | null;
}

/** Persisted state of the kingdom (saved at wave starts and whenever the field is quiet). */
export interface SnapshotTower {
  spot: number;
  type: TowerId;
  tier: number;
  branch: number;
  mode: TargetMode;
  kills: number;
}

export interface BaseSnapshot {
  /** Wave index to start next. */
  wave: number;
  /** Last checkpoint actually reached (waves cleared); falling sends you back here. */
  checkpoint: number;
  gold: number;
  castleHp: number;
  towers: SnapshotTower[];
  /** Unlocked build pads. */
  spots: number[];
  padsCleared: number;
  /** Once-per-checkpoint-segment ad rewards already used. */
  reviveUsed: boolean;
  reinforcementsUsed: boolean;
  goldRushUsed: boolean;
  goldRushWaves: number;
  /** Barricades standing on the road (optional in older saves). */
  barricades?: { col: number; row: number; hp: number; maxHp: number }[];
  /** The pad the hero is stationed on (-1 or absent: the castle wall). */
  heroPost?: number;
  /** Whether the free placement has been used. */
  heroPlaced?: boolean;
  /** The same for the second hero. */
  hero2Post?: number;
  hero2Placed?: boolean;
}

export interface Barricade {
  id: number;
  col: number;
  row: number;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  /** Seconds since it last took a hit (for the shake). */
  hitT: number;
}

export function newKingdom(): BaseSnapshot {
  return {
    wave: 0, checkpoint: 0, gold: SIEGE.startingGold, castleHp: -1, towers: [], spots: initialSpots(), padsCleared: 0,
    reviveUsed: false, reinforcementsUsed: false, goldRushUsed: false, goldRushWaves: 0,
  };
}

export interface RunConfig {
  snapshot: BaseSnapshot;
  meta: MetaBonuses;
  /** Tower types usable now (mutable: grows as unlocks happen). */
  availableTowers: TowerId[];
  /** Whether the revive offer is possible (ads available, not headless). */
  reviveAvailable?: boolean;
  /** Hold before a wave that starts a new Age or opens a road until `continueFrontier()` (UI only). */
  announceFrontiers?: boolean;
  seed?: number;
  /** Daily Challenge twists. */
  mods?: ChallengeMods;
}

export interface Enemy {
  id: number;
  def: EnemyDef;
  alive: boolean;
  hp: number;
  maxHp: number;
  path: number;
  dist: number;
  lane: number;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirZ: number;
  slowFactor: number;
  slowTimer: number;
  stunTimer: number;
  shred: number;
  shredTimer: number;
  /** Damage over time (burning / poison): damage per second, seconds left, source. */
  dotDps: number;
  dotTimer: number;
  dotTick: number;
  dotType: DamageType;
  dotKind: 'burn' | 'poison';
  dotTowerId: number;
  /** Elite variant, or null. */
  elite: EliteTrait | null;
  /** Burrowed underground (untargetable). */
  hidden: boolean;
  burrowTimer: number;
  /** Ice Golem: time until it freezes a tower. Siege Engine: time until its next rock. */
  freezeTimer: number;
  flash: number;
  /** Damage reduction from a shield-bearer ahead (0 = none). */
  shielded: number;
  abilityTimer: number;
  summonTimer: number;
  chargeTimer: number;
  immuneTimer: number;
  immuneIdx: number;
  wave: number;
  bountyMult: number;
  armorBonus: number;
  speedMult: number;
  frozen: boolean;
  /** Animation phase offset. */
  phase: number;
}

export interface Tower {
  id: number;
  def: TowerDef;
  spot: number;
  x: number;
  z: number;
  tier: number;
  branch: number;
  stats: TowerStats;
  cooldown: number;
  targetMode: TargetMode;
  invested: number;
  kills: number;
  aim: number;
  lastFire: number;
  /** Frozen by an Ice Golem: can't fire for this many seconds. */
  frozen: number;
  /** Seconds left knocked out by a siege rock. */
  dazed: number;
  /** Active synergies and the towers they link to. */
  synergies: SynergyId[];
  partners: number[];
  /** The Beacon lighting this tower up (-1 = none). */
  buffedBy: number;
}

const DOT_TICK = 0.5;
const BOLT_HIT_RADIUS = 0.38;
/** Projectile each tower type fires. */
const PROJECTILE_OF: Partial<Record<TowerId, ProjectileKind>> = {
  cannon: 'cannon', frost: 'frost', mage: 'arcane', ballista: 'bolt', flame: 'fire', alchemist: 'poison', catapult: 'boulder', gale: 'gust',
};

export type ProjectileKind = 'arrow' | 'cannon' | 'frost' | 'arcane' | 'bolt' | 'fire' | 'poison' | 'boulder' | 'gust' | 'heroArrow' | 'heroBolt' | 'champion';

export interface Projectile {
  id: number;
  active: boolean;
  kind: ProjectileKind;
  x: number; y: number; z: number;
  sx: number; sy: number; sz: number;
  tx: number; tz: number;
  targetId: number;
  speed: number;
  t: number;
  duration: number;
  damage: number;
  damageType: DamageType;
  splash: number;
  slowFactor: number;
  slowDuration: number;
  stun: number;
  freezeChance: number;
  shred: number;
  hitsAir: boolean;
  hitsGround: boolean;
  towerId: number;
  arc: boolean;
  /** Piercing bolts: enemies left to pass through, and those already hit. */
  pierce: number;
  pierced: number[];
  dot: number;
  dotDuration: number;
  knockback: number;
}

export interface Hero {
  def: HeroDef;
  /** 0 = the main hero, 1 = the second hero. */
  slot: number;
  level: number;
  perks: PerkId[];
  /** The free placement on a pad has been used (later moves cost gold). */
  placed: boolean;
  x: number; z: number;
  /** Height the hero stands at (on the castle wall or a pad). */
  y: number;
  /** Where the hero is stationed: -1 = the castle wall, else a build pad. */
  post: number;
  tx: number; tz: number;
  hp: number; maxHp: number;
  damage: number;
  cooldown: number;
  abilityCd: number;
  dead: boolean;
  respawn: number;
  facing: number;
  moving: boolean;
  contactTimer: number;
  attackAnim: number;
}

export interface Ally {
  active: boolean;
  x: number; z: number;
  timer: number;
  cooldown: number;
  facing: number;
  attackAnim: number;
}

export type RunState = 'prep' | 'playing' | 'reviveOffer' | 'lost';

export interface RunStats {
  kills: number;
  flyingKills: number;
  bossKills: number;
  goldEarned: number;
  towersBuilt: number;
  upgrades: number;
  heroAbilityUses: number;
  earlyCalls: number;
  maxTowers: number;
  leaks: number;
}

export type RunEvents = {
  enemySpawn: Enemy;
  enemyHit: { enemy: Enemy; amount: number; immune: boolean; type: DamageType };
  enemyDeath: { enemy: Enemy; bounty: number };
  enemyLeak: { enemy: Enemy; damage: number };
  towerFire: { tower: Tower; target: Enemy | null };
  projectileHit: { p: Projectile; x: number; z: number };
  splash: { x: number; z: number; radius: number; kind: ProjectileKind | 'aura' | 'ability' | 'meteor' };
  lightning: { tower: Tower | null; points: number[] };
  waveStart: { index: number; total: number };
  waveCleared: { index: number; gold: number };
  gold: { amount: number; total: number };
  castleHit: { damage: number; hp: number };
  heroAttack: { hero: Hero; target: Enemy };
  heroAbility: { hero: Hero; x: number; z: number; radius: number; /** Shadow Strike: x,z of each enemy struck, in order. */ points?: number[] };
  heroMoved: { hero: Hero; cost: number };
  burrow: { enemy: Enemy; hidden: boolean };
  heroKill: { enemy: Enemy; hero: Hero };
  castleFire: void;
  barricadeBuilt: Barricade;
  barricadeRepaired: Barricade;
  synergy: { synergy: SynergyId; a: Tower; b: Tower };
  barricadeBroken: Barricade;
  barricadeRemoved: { barricade: Barricade; refund: number };
  eliteSpawn: Enemy;
  eliteKill: Enemy;
  towerFrozen: { tower: Tower; enemy: Enemy };
  /** A Siege Engine lobs a rock (it lands after `flight` seconds). */
  siegeThrow: { enemy: Enemy; tower: Tower; flight: number };
  siegeHit: { tower: Tower };
  goldStolen: { enemy: Enemy; amount: number };
  allyAttack: { ally: Ally; target: Enemy };
  bossMechanic: { enemy: Enemy; kind: 'summon' | 'charge' | 'immune' };
  heal: { enemy: Enemy; targets: Enemy[] };
  towerBuilt: Tower;
  towerUpgraded: Tower;
  towerSold: { tower: Tower; refund: number };
  reviveOffer: void;
  revived: void;
  defeat: void;
  /** The castle fell: fell back to `toWave`, keeping towers and gold. */
  retreat: { fromWave: number; toWave: number };
  /** Reached a checkpoint (wave count cleared, multiple of checkpointEvery). */
  checkpoint: { wave: number };
  ageChange: { age: number; wave: number };
  /** About to start a wave that begins a new Age and/or opens roads; the siege holds until continueFrontier(). */
  frontier: { wave: number; age: number; newAge: boolean; roads: number[] };
  roadOpened: { road: number };
  landCleared: { spot: number; cost: number };
  goldRush: { waves: number };
  earlyCall: { gold: number };
  /** A spell was cast (x, z: where it lands, for meteors). */
  spell: { id: SpellId; x: number; z: number; radius: number; value: number };
  /** A Gold Mine paid out at the end of a wave. */
  mineGold: { tower: Tower; gold: number };
};

interface SpawnEntry {
  time: number;
  enemy: EnemyId;
  path: number;
  wave: number;
  hpMult: number;
  goldMult: number;
}

export class Run {
  readonly map: LevelMap;
  readonly events = new Emitter<RunEvents>();
  readonly enemies: Enemy[] = [];
  readonly towers: Tower[] = [];
  readonly barricades: Barricade[] = [];
  readonly projectiles: Projectile[] = [];
  /** Heroes on the field: the main hero first, then the second hero if that slot is in use. */
  readonly heroes: Hero[] = [];
  /** Siege rocks in the air: they knock their tower out when they land. */
  readonly siegeShots: { towerId: number; t: number; duration: number }[] = [];
  get hero(): Hero | null {
    return this.heroes[0] ?? null;
  }
  readonly ally: Ally = { active: false, x: 0, z: 0, timer: 0, cooldown: 0, facing: 0, attackAnim: 0 };
  readonly stats: RunStats = { kills: 0, flyingKills: 0, bossKills: 0, goldEarned: 0, towersBuilt: 0, upgrades: 0, heroAbilityUses: 0, earlyCalls: 0, maxTowers: 0, leaks: 0 };

  state: RunState = 'prep';
  gold: number;
  castleHp: number;
  castleMaxHp: number;
  time = 0;
  /** Index of the next wave to start. */
  waveIndex = 0;
  readonly totalWaves = Infinity;
  /** Countdown until the next wave auto-starts (-1 when not counting). */
  nextWaveTimer = -1;
  /** Wave whose new-Age / new-road announcement is on screen (the siege holds), or -1. */
  holdingFor = -1;
  private announcedWave = -1;
  reviveUsed = false;
  reinforcementsUsed = false;
  goldRushUsed = false;
  /** Waves left (including the current one) with Gold Rush active. */
  goldRushWaves = 0;
  readonly unlockedSpots: Set<number>;
  padsCleared: number;
  /** Last checkpoint reached (number of waves cleared). */
  lastCheckpoint: number;
  /**
   * The siege's checkpoint break (off for the balance simulator and the Daily Challenge): no wave
   * past a checkpoint is sent until every enemy before it is defeated, the checkpoint is only
   * announced once the field is clear, and the next wave waits for resumeAfterCheckpoint().
   */
  holdAtCheckpoints = false;
  /** The checkpoint that has been earned but not yet announced (waiting for the field to clear), or 0. */
  private pendingCheckpoint = 0;
  /** The checkpoint screen is up: no wave starts until resumeAfterCheckpoint(). */
  private checkpointBreak = false;

  private spawnQueue: SpawnEntry[] = [];
  private waveRemaining = new Map<number, number>();
  private waveSpawnDone = new Map<number, boolean>();
  private nextId = 1;
  /** Index in `projectiles` of the most recent launch. */
  private lastLaunched = 0;
  private rng: Random;
  private tmp: PathPoint = { x: 0, z: 0, dx: 0, dz: 0 };

  constructor(public readonly config: RunConfig) {
    const snap = config.snapshot;
    this.map = kingdomMap();
    this.rng = new Random(config.seed ?? 12345 + snap.wave);
    this.waveIndex = snap.wave;
    this.gold = snap.gold;
    this.castleMaxHp = this.maxHpFor(config.meta);
    this.castleHp = snap.castleHp > 0 ? Math.min(snap.castleHp, this.castleMaxHp) : this.castleMaxHp;
    this.unlockedSpots = new Set(snap.spots);
    for (const b of snap.barricades ?? []) {
      this.barricades.push({ id: this.nextId++, col: b.col, row: b.row, x: tileToWorld(b.col), z: tileToWorld(b.row), hp: b.hp, maxHp: b.maxHp, hitT: 9 });
    }
    this.padsCleared = snap.padsCleared;
    this.lastCheckpoint = Math.min(snap.checkpoint ?? checkpointOf(snap.wave), snap.wave);
    this.reviveUsed = snap.reviveUsed;
    this.reinforcementsUsed = snap.reinforcementsUsed;
    this.goldRushUsed = snap.goldRushUsed;
    this.goldRushWaves = snap.goldRushWaves;
    for (const st of snap.towers) {
      const def = TOWERS[st.type];
      const s = this.map.buildSpots[st.spot];
      if (!def || !s || this.towerAt(st.spot)) continue;
      const tier = Math.max(1, Math.min(MAX_LEVEL, st.tier));
      const branch = tier > BRANCH_TIER ? Math.max(0, Math.min(1, st.branch)) : -1;
      this.unlockedSpots.add(st.spot);
      this.towers.push({
        id: this.nextId++, def, spot: st.spot, x: s.x, z: s.z, tier, branch, stats: this.computeStats(def, tier, branch),
        cooldown: 0.2, targetMode: st.mode ?? TOWER_RULES.defaultTargetMode, invested: totalInvested(def, tier), kills: st.kills ?? 0, aim: 0, lastFire: -10, frozen: 0, dazed: 0, synergies: [], partners: [], buffedBy: -1,
      });
    }
    this.refreshSynergies(true);

    if (!config.mods?.noHero) {
      const m = config.meta;
      const slots: { id: HeroId; level: number; perks: PerkId[]; post?: number; placed?: boolean }[] = [];
      if (m.heroId) slots.push({ id: m.heroId, level: m.heroLevel ?? 1, perks: m.heroPerks ?? [], post: snap.heroPost, placed: snap.heroPlaced });
      if (m.heroId && m.hero2 && m.hero2.id !== m.heroId) slots.push({ ...m.hero2, post: snap.hero2Post, placed: snap.hero2Placed });
      for (const sl of slots) {
        const def = HEROES[sl.id];
        const slot = this.heroes.length;
        const h: Hero = {
          def, slot, level: sl.level, perks: sl.perks, placed: !!sl.placed, x: 0, y: 0, z: 0, post: -1, tx: 0, tz: 0, hp: 1, maxHp: 1, damage: 0,
          cooldown: 0, abilityCd: 3 + slot * 2, dead: false, respawn: 0, facing: 0, moving: false, contactTimer: 0, attackAnim: 0,
        };
        this.heroes.push(h);
        const want = sl.post ?? -1;
        const ok = want >= 0 && this.unlockedSpots.has(want) && !this.towerAt(want) && !this.heroes.some((o) => o !== h && o.post === want);
        this.placeHero(h, this.heroPostPosition(ok ? want : -1, slot));
        this.rescaleHero(h);
      }
      if (this.heroes.length) this.refreshSynergies(true);
    }
  }

  private placeHero(h: Hero, p: { x: number; y: number; z: number; post: number; facing: number }): void {
    h.x = h.tx = p.x;
    h.y = p.y;
    h.z = h.tz = p.z;
    h.post = p.post;
    h.facing = p.facing;
  }

  private rescaleHero(h: Hero): void {
    const { hp, damage } = this.heroScale(this.config.meta, h);
    const frac = h.hp / h.maxHp;
    h.maxHp = h.def.hp * hp;
    h.hp = h.maxHp * frac;
    h.damage = h.def.damage * damage;
  }

  private maxHpFor(meta: MetaBonuses): number {
    if (this.config.mods?.castleHp) return this.config.mods.castleHp;
    return Math.max(1, Math.round(SIEGE.castleHp + meta.castleHpBonus));
  }

  /** Re-applies permanent upgrades bought mid-siege (tower levels, castle HP...). */
  applyMeta(meta: MetaBonuses): void {
    this.config.meta = meta;
    const newMax = this.maxHpFor(meta);
    this.castleHp = Math.min(newMax, this.castleHp + Math.max(0, newMax - this.castleMaxHp));
    this.castleMaxHp = newMax;
    // Fresh levels and perks for the heroes on the field.
    for (const h of this.heroes) {
      if (h.slot === 0) {
        h.level = meta.heroLevel ?? 1;
        h.perks = meta.heroPerks ?? [];
      } else if (meta.hero2) {
        h.level = meta.hero2.level;
        h.perks = meta.hero2.perks;
      }
      this.rescaleHero(h);
    }
    this.refreshSynergies(true);
  }

  /** Hero stat multipliers from Hero Training and the hero's level. */
  heroScale(meta: MetaBonuses = this.config.meta, h: Hero | null = this.hero): { hp: number; damage: number; ability: number; cooldown: number } {
    const power = 1 + meta.heroPower;
    const l = (h ? h.level : meta.heroLevel ?? 1) - 1;
    const perks = h ? h.perks : meta.heroPerks ?? [];
    const has = (p: PerkId) => perks.includes(p);
    const legend = has('legend') ? 1.3 : 1;
    return {
      hp: power * (1 + HERO_LEVELS.hpPerLevel * l),
      damage: power * (1 + HERO_LEVELS.damagePerLevel * l) * (has('brawler') ? 1.2 : 1) * legend,
      ability: power * (1 + HERO_LEVELS.abilityPerLevel * l) * (has('empower') ? 1.4 : 1),
      cooldown: Math.max(HERO_LEVELS.cooldownMin, 1 - HERO_LEVELS.cooldownPerLevel * l) * (has('focus') ? 0.75 : 1),
    };
  }

  heroHasPerk(p: PerkId, h: Hero | null = this.hero): boolean {
    return h?.perks.includes(p) ?? false;
  }

  /** A hero's attack range from their post (Eagle Eye adds a quarter). */
  heroRange(h: Hero | null = this.hero): number {
    return h ? h.def.postRange * (this.heroHasPerk('eagleEye', h) ? 1.25 : 1) : 0;
  }

  /** The hero standing on a pad, if any. */
  heroAt(post: number): Hero | undefined {
    return post < 0 ? undefined : this.heroes.find((h) => h.post === post);
  }

  /** Where a hero stands at a post: -1 is the wall walk above the castle gate, else a build pad. */
  heroPostPosition(post: number, slot = 0): { x: number; y: number; z: number; post: number; facing: number } {
    const c = this.map.castle;
    if (post >= 0) {
      const s = this.map.buildSpots[post];
      return { x: s.x, y: HERO_POST.padHeight, z: s.z, post, facing: Math.atan2(c.x - s.x, c.z - s.z) + Math.PI };
    }
    // Face down the main road, from the wall above the gate.
    const p = this.map.paths[0];
    const n = p.xs.length;
    const facing = Math.atan2(p.xs[n - 2] - p.xs[n - 1], p.zs[n - 2] - p.zs[n - 1]);
    // The second hero keeps watch from the side wall.
    const a = facing + (slot ? Math.PI / 2 : 0);
    return { x: c.x + Math.sin(a) * HERO_POST.wallOffset, y: HERO_POST.wallHeight, z: c.z + Math.cos(a) * HERO_POST.wallOffset, post: -1, facing: a };
  }

  /** Gold to move a hero once their free placement is used. */
  heroMoveCost(h: Hero | null = this.hero): number {
    return h?.placed ? Math.round(HERO_POST.moveCost * (1 + this.currentWave * HERO_POST.moveCostPerWave)) : 0;
  }

  /** Can the hero be stationed here (an unlocked, empty pad, or -1 for the castle)? */
  canStationHero(post: number, h: Hero | null = this.hero): boolean {
    if (!h || post === h.post) return false;
    if (post >= 0 && (!this.unlockedSpots.has(post) || this.towerAt(post) || this.heroAt(post))) return false;
    return this.gold >= this.heroMoveCost(h);
  }

  /** Moves a hero to a post. The first move is free; later ones cost gold. */
  stationHero(post: number, h: Hero | null = this.hero): boolean {
    if (!h || !this.canStationHero(post, h)) return false;
    const cost = this.heroMoveCost(h);
    if (cost > 0) this.addGold(-cost);
    h.placed = true;
    this.placeHero(h, this.heroPostPosition(post, h.slot));
    this.refreshSynergies(true);
    this.events.emit('heroMoved', { hero: h, cost });
    return true;
  }

  /** Damage dealt by a hero (credits kills to them for XP). */
  private heroDamage(h: Hero, e: Enemy, amount: number, type: DamageType): void {
    const was = e.alive;
    this.heroHit = h;
    this.damage(e, amount, type);
    this.heroHit = null;
    if (was && !e.alive) this.events.emit('heroKill', { enemy: e, hero: h });
  }

  /** The hero whose own blow is landing (for Bounty Hunter). */
  private heroHit: Hero | null = null;

  /** Hero shots carry -10 - slot as their tower id. */
  private heroOfShot(p: Projectile): Hero | null {
    if (p.towerId > -10 || (p.kind !== 'heroArrow' && p.kind !== 'heroBolt')) return null;
    return this.heroes[-10 - p.towerId] ?? null;
  }

  /** Persistable state. `wave` = the wave to start when resuming. */
  snapshot(wave = this.waveIndex): BaseSnapshot {
    return {
      wave,
      checkpoint: this.lastCheckpoint,
      gold: Math.floor(this.gold),
      castleHp: this.castleHp,
      towers: this.towers.map((t) => ({ spot: t.spot, type: t.def.id, tier: t.tier, branch: t.branch, mode: t.targetMode, kills: t.kills })),
      spots: [...this.unlockedSpots],
      padsCleared: this.padsCleared,
      reviveUsed: this.reviveUsed,
      reinforcementsUsed: this.reinforcementsUsed,
      goldRushUsed: this.goldRushUsed,
      goldRushWaves: this.goldRushWaves,
      barricades: this.barricades.map((b) => ({ col: b.col, row: b.row, hp: Math.round(b.hp), maxHp: Math.round(b.maxHp) })),
      heroPost: this.heroes[0]?.post ?? -1,
      heroPlaced: this.heroes[0]?.placed ?? false,
      hero2Post: this.heroes[1]?.post ?? -1,
      hero2Placed: this.heroes[1]?.placed ?? false,
    };
  }

  /** How close the last wave came to being cleared (for the "so close!" message on a loss). */
  nearMiss(): { wave: number; enemiesLeft: number; boss: { name: string; hpFrac: number } | null } {
    const wave = this.currentWave;
    let left = this.spawnQueue.filter((s) => s.wave === wave).length;
    let boss: { name: string; hpFrac: number } | null = null;
    for (const e of this.enemies) {
      if (!e.alive || e.wave !== wave) continue;
      left++;
      if (e.def.boss && (!boss || e.hp / e.maxHp > boss.hpFrac)) boss = { name: e.def.name, hpFrac: e.hp / e.maxHp };
    }
    return { wave, enemiesLeft: left, boss };
  }

  // --- Spells ----------------------------------------------------------------------

  /** Seconds until each spell can be cast again. */
  readonly spellCd: Partial<Record<SpellId, number>> = {};
  /** Seconds of Gold Blessing left. */
  blessingT = 0;

  spellReady(id: SpellId): boolean {
    return this.config.meta.spells?.[id] !== undefined && (this.spellCd[id] ?? 0) <= 0 && this.state === 'playing';
  }

  /** Casts a spell; false if it isn't ready or would do nothing. */
  castSpell(id: SpellId): boolean {
    if (!this.spellReady(id)) return false;
    const lvl = this.config.meta.spells![id] ?? 0;
    const power = spellPower(id, lvl).value;
    let x = this.map.castle.x, z = this.map.castle.z, radius = 0;
    if (id === 'meteor') {
      const r = SPELL_RULES.meteorRadius;
      let best = 0;
      for (const e of this.enemies) {
        if (!e.alive || e.hidden) continue;
        let n = 0;
        for (const o of this.enemies) if (o.alive && !o.hidden && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 <= r * r) n += o.def.boss ? 4 : 1;
        if (n > best) {
          best = n;
          x = e.x;
          z = e.z;
        }
      }
      if (!best) return false;
      radius = r;
      const dmg = SPELL_RULES.meteorDamage * Math.pow(hpMultFor(this.currentWave), SPELL_RULES.meteorExp) * power;
      for (const e of this.enemies) {
        if (!e.alive || e.hidden || (e.x - x) ** 2 + (e.z - z) ** 2 > r * r) continue;
        this.damage(e, dmg * (1 - 0.4 * Math.sqrt((e.x - x) ** 2 + (e.z - z) ** 2) / r), 'magic');
      }
    } else if (id === 'freeze') {
      if (!this.aliveCount()) return false;
      for (const e of this.enemies) if (e.alive) e.stunTimer = Math.max(e.stunTimer, e.def.boss ? power * 0.4 : power);
    } else if (id === 'blessing') {
      this.blessingT = power;
    } else {
      if (this.castleHp >= this.castleMaxHp) return false;
      this.castleHp = Math.min(this.castleMaxHp, this.castleHp + power);
    }
    this.spellCd[id] = spellCooldown(id, lvl);
    this.events.emit('spell', { id, x, z, radius, value: power });
    return true;
  }

  private updateSpells(dt: number): void {
    for (const k of Object.keys(this.spellCd) as SpellId[]) this.spellCd[k] = Math.max(0, (this.spellCd[k] ?? 0) - dt);
    if (this.blessingT > 0) this.blessingT = Math.max(0, this.blessingT - dt);
  }

  /** No enemies on the field or waiting to spawn. */
  isQuiet(): boolean {
    return this.spawnQueue.length === 0 && this.aliveCount() === 0;
  }

  /** Wave currently being fought (or the last one fought). */
  get currentWave(): number {
    return Math.max(0, this.waveIndex - 1);
  }

  // --- Queries ---------------------------------------------------------------

  waveDef(n: number): WaveDef | null {
    return siegeWave(n);
  }

  isSpotUnlocked(spot: number): boolean {
    return this.unlockedSpots.has(spot);
  }

  /** Gold to clear the next overgrown pad. */
  clearLandCost(): number {
    return clearLandCost(this.padsCleared);
  }

  /** Gold to open a spot: an overgrown pad, or Foundations on open ground (half price). */
  landCost(spot: number): number {
    const c = this.clearLandCost();
    return this.map.isClassic(spot) ? c : Math.ceil((c * FOUNDATION_PRICE) / 5) * 5;
  }

  towerAt(spot: number): Tower | undefined {
    return this.towers.find((t) => t.spot === spot);
  }

  canAfford(cost: number): boolean {
    return this.gold >= cost;
  }

  upgradeCost(t: Tower): number | null {
    if (t.tier >= MAX_LEVEL) return null;
    return upgradeCost(t.def, t.tier);
  }

  sellValue(t: Tower): number {
    return Math.floor(t.invested * TOWER_RULES.sellRefund);
  }

  isTowerAvailable(id: TowerId): boolean {
    return this.config.availableTowers.includes(id);
  }

  computeStats(def: TowerDef, tier: number, branch: number): TowerStats {
    const base = towerStats(def, tier, branch);
    const meta = this.config.meta;
    const lvl = meta.towerLevels[def.id] ?? 0;
    const mastery = meta.mastery?.[def.id] ?? 0;
    // Shop and mastery levels: damage for attack towers, gold for the mine, boost for the beacon.
    const bonus = towerBonus(def.id, lvl, mastery);
    const gain = bonus.mult * bonus.masteryMult;
    const dmg = (bonus.kind === 'damage' ? gain : 1) * (1 + (meta.towerDamage ?? 0)) * (this.config.mods?.towerDamage ?? 1);
    return {
      ...base,
      damage: base.damage * dmg,
      income: base.income * (bonus.kind === 'gold' ? gain : 1),
      buff: base.buff * (bonus.kind === 'boost' ? gain : 1),
      range: base.range * (1 + lvl * TOWER_META.rangePerLevel) * (mastery >= MASTERY.veteranLevel ? 1 + MASTERY.veteranRange : 1),
      cooldown: base.cooldown * (bonus.kind === 'damage' && mastery >= MASTERY.masterLevel ? MASTERY.masterCooldown : 1),
    };
  }

  aliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }

  /** Gold the player would get for calling the next wave now. */
  earlyCallBonus(): number {
    if (this.nextWaveTimer <= 0) return 0;
    return Math.min(SIEGE.earlyCallMaxGold, Math.round(this.nextWaveTimer * SIEGE.earlyCallGoldPerSecond));
  }

  // --- Commands --------------------------------------------------------------

  build(spot: number, id: TowerId): Tower | null {
    if (this.state !== 'prep' && this.state !== 'playing') return null;
    const s = this.map.buildSpots[spot];
    if (!s || this.towerAt(spot) || this.heroAt(spot) || !this.isTowerAvailable(id) || !this.unlockedSpots.has(spot)) return null;
    const def = TOWERS[id];
    if (this.gold < def.cost) return null;
    this.addGold(-def.cost);
    const t: Tower = {
      id: this.nextId++, def, spot, x: s.x, z: s.z, tier: 1, branch: -1, stats: this.computeStats(def, 1, -1),
      cooldown: 0.2, targetMode: TOWER_RULES.defaultTargetMode, invested: def.cost, kills: 0, aim: 0, lastFire: -10, frozen: 0, dazed: 0, synergies: [], partners: [], buffedBy: -1,
    };
    this.towers.push(t);
    this.stats.towersBuilt++;
    this.stats.maxTowers = Math.max(this.stats.maxTowers, this.towers.length);
    this.events.emit('towerBuilt', t);
    this.refreshSynergies();
    return t;
  }

  upgrade(t: Tower, branch = -1): boolean {
    const cost = this.upgradeCost(t);
    if (cost === null || this.gold < cost) return false;
    if (t.tier === BRANCH_TIER && branch < 0) return false;
    this.addGold(-cost);
    t.tier++;
    if (t.tier === BRANCH_TIER + 1) t.branch = branch;
    t.invested = totalInvested(t.def, t.tier);
    this.refreshSynergies();
    this.stats.upgrades++;
    this.events.emit('towerUpgraded', t);
    return true;
  }

  sell(t: Tower): void {
    const i = this.towers.indexOf(t);
    if (i < 0) return;
    const refund = this.sellValue(t);
    this.towers.splice(i, 1);
    this.refreshSynergies();
    this.addGold(refund, false);
    this.events.emit('towerSold', { tower: t, refund });
  }

  /**
   * Recomputes every tower's stats with the synergies it gets from different towers nearby.
   * Emits `synergy` for each newly formed link unless `silent`.
   */
  refreshSynergies(silent = false): void {
    const r2 = SYNERGY_RANGE * SYNERGY_RANGE;
    for (const t of this.towers) {
      const before = t.synergies;
      t.synergies = [];
      t.partners = [];
      for (const syn of SYNERGIES) {
        const [a, b] = syn.towers;
        if (t.def.id !== a && t.def.id !== b) continue;
        const want = t.def.id === a ? b : a;
        const partner = this.towers.find((o) => o !== t && o.def.id === want && (o.x - t.x) ** 2 + (o.z - t.z) ** 2 <= r2);
        if (!partner) continue;
        t.synergies.push(syn.id);
        t.partners.push(partner.id);
        if (!silent && !before.includes(syn.id) && t.def.id === a) this.events.emit('synergy', { synergy: syn.id, a: t, b: partner });
      }
      const st = this.computeStats(t.def, t.tier, t.branch);
      for (const id of t.synergies) {
        if (id === 'fumes') {
          if (st.dot > 0) {
            st.dot *= 1.3;
            st.dotDuration *= 1.5;
          }
        } else if (id === 'enchanted') {
          if (t.def.id === 'archer') st.damage *= 1.3;
          else st.range += 0.4;
        } else if (id === 'superconductor') {
          if (t.def.id === 'lightning') st.chains += 2;
          else if (st.slowFactor < 1) st.slowFactor = Math.max(0.2, st.slowFactor - 0.1);
        } else if (id === 'siege') {
          if (t.def.id === 'ballista') st.pierce += 2;
          else st.splash += 0.3;
        } else if (id === 'arcaneStorm') {
          st.damage *= 1.2;
        } else if (id === 'rockslide') {
          if (t.def.id === 'catapult') st.splash += 0.35;
          else st.knockback *= 1.3;
        } else if (id === 'firestorm') {
          if (t.def.id === 'flame') st.range += 0.6;
          else if (st.dot === 0) {
            st.dot = 0.5;
            st.dotDuration = 2;
          }
        }
      }
      t.stats = st;
    }
    // Beacons light up every attacking tower in range (the strongest beacon counts).
    for (const t of this.towers) {
      t.buffedBy = -1;
      if (isSupport(t.def.id)) continue;
      let best: Tower | null = null;
      for (const b of this.towers) {
        if (b.def.id !== 'beacon' || (b.x - t.x) ** 2 + (b.z - t.z) ** 2 > b.stats.range * b.stats.range) continue;
        if (!best || b.stats.buff > best.stats.buff) best = b;
      }
      if (!best) continue;
      t.buffedBy = best.id;
      t.stats.damage *= 1 + best.stats.buff;
      if (best.stats.haste > 0) t.stats.cooldown *= 1 - best.stats.haste;
    }
    // Rally: a hero inspires the towers around their post (one Rally per tower).
    const rallies = this.heroes.filter((h) => this.heroHasPerk('vigor', h));
    for (const t of this.towers) {
      if (isSupport(t.def.id)) continue;
      if (rallies.some((h) => (t.x - h.x) ** 2 + (t.z - h.z) ** 2 <= this.heroRange(h) ** 2)) t.stats.damage *= 1 + HERO_POST.rally;
    }
  }

  setTargetMode(t: Tower, mode: TargetMode): void {
    t.targetMode = mode;
  }

  /** Spend gold to clear land and unlock a build pad. */
  clearLand(spot: number): boolean {
    if (this.unlockedSpots.has(spot) || !this.map.buildSpots[spot]) return false;
    const cost = this.landCost(spot);
    if (this.gold < cost) return false;
    this.addGold(-cost);
    this.unlockedSpots.add(spot);
    this.padsCleared++;
    this.events.emit('landCleared', { spot, cost });
    return true;
  }

  /** Gold Rush (rewarded ad): kill gold multiplied for the next few waves. Once per checkpoint segment. */
  activateGoldRush(): boolean {
    if (this.goldRushUsed) return false;
    this.goldRushUsed = true;
    // If a wave is running it counts as the first of the rush.
    this.goldRushWaves = SIEGE.goldRushWaves + (this.state === 'playing' && !this.isQuiet() ? 0 : 1);
    this.events.emit('goldRush', { waves: SIEGE.goldRushWaves });
    return true;
  }

  /** The castle fell and no revive: fall back to the last checkpoint with towers and gold intact. */
  retreat(): number {
    const from = this.currentWave;
    const to = this.lastCheckpoint;
    for (const e of this.enemies) {
      e.alive = false;
      e.flash = -1;
    }
    for (const p of this.projectiles) p.active = false;
    this.spawnQueue.length = 0;
    this.waveRemaining.clear();
    this.waveSpawnDone.clear();
    this.pendingCheckpoint = 0;
    this.checkpointBreak = false;
    this.waveIndex = to;
    this.nextWaveTimer = -1;
    this.castleHp = this.castleMaxHp;
    this.reviveUsed = false;
    this.reinforcementsUsed = false;
    this.goldRushUsed = false;
    this.goldRushWaves = 0;
    this.siegeShots.length = 0;
    for (const t of this.towers) t.dazed = 0;
    this.ally.active = false;
    for (const h of this.heroes) h.abilityCd = 0;
    this.state = 'prep';
    this.events.emit('retreat', { fromWave: from, toWave: to });
    return to;
  }

  // --- Barricades ---------------------------------------------------------------------

  barricadeCost(): number {
    return Math.round((BARRICADE.baseCost + BARRICADE.costPerWave * this.waveIndex) / 5) * 5;
  }

  barricadeMaxHp(): number {
    return Math.round(BARRICADE.baseHp * Math.pow(hpMultFor(this.waveIndex), BARRICADE.hpExponent) * (this.config.meta.barricadeHp ?? 1));
  }

  /** How many may stand at once (one more per Age reached). */
  barricadeLimit(): number {
    return Math.min(BARRICADE.maxCount, BARRICADE.baseCount + ageOf(this.waveIndex));
  }

  barricadeAt(col: number, row: number): Barricade | undefined {
    return this.barricades.find((b) => b.col === col && b.row === row);
  }

  /** A tile of a road that enemies use right now (not the castle or a tunnel mouth). */
  isOpenRoadTile(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= this.map.size || row >= this.map.size) return false;
    if (col === this.map.castle.col && row === this.map.castle.row) return false;
    const x = tileToWorld(col), z = tileToWorld(row);
    for (const r of openRoads(this.waveIndex)) {
      if (r >= this.map.paths.length) continue;
      const p = this.map.paths[r];
      for (let i = 1; i < p.xs.length; i++) {
        const ax = p.xs[i - 1], az = p.zs[i - 1], bx = p.xs[i], bz = p.zs[i];
        const lx = bx - ax, lz = bz - az;
        const l2 = lx * lx + lz * lz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * lx + (z - az) * lz) / l2));
        if ((ax + lx * t - x) ** 2 + (az + lz * t - z) ** 2 < 0.05) return true;
      }
    }
    return false;
  }

  placeBarricade(col: number, row: number): Barricade | null {
    if (!this.isOpenRoadTile(col, row) || this.barricadeAt(col, row)) return null;
    if (this.barricades.length >= this.barricadeLimit()) return null;
    const cost = this.barricadeCost();
    if (this.gold < cost) return null;
    this.addGold(-cost);
    const hp = this.barricadeMaxHp();
    const b: Barricade = { id: this.nextId++, col, row, x: tileToWorld(col), z: tileToWorld(row), hp, maxHp: hp, hitT: 9 };
    this.barricades.push(b);
    this.events.emit('barricadeBuilt', b);
    return b;
  }

  /** Repairs to full strength (and up to the current wave's HP). */
  repairCost(b: Barricade): number {
    const target = Math.max(b.maxHp, this.barricadeMaxHp());
    const missing = (target - b.hp) / target;
    return Math.max(0, Math.round((this.barricadeCost() * missing * 0.8) / 5) * 5);
  }

  repairBarricade(b: Barricade): boolean {
    const cost = this.repairCost(b);
    if (cost <= 0 || this.gold < cost) return false;
    this.addGold(-cost);
    b.maxHp = Math.max(b.maxHp, this.barricadeMaxHp());
    b.hp = b.maxHp;
    this.events.emit('barricadeRepaired', b);
    return true;
  }

  removeBarricade(b: Barricade): number {
    const i = this.barricades.indexOf(b);
    if (i < 0) return 0;
    this.barricades.splice(i, 1);
    const refund = Math.floor(this.barricadeCost() * BARRICADE.refund * (b.hp / b.maxHp));
    this.addGold(refund);
    this.events.emit('barricadeRemoved', { barricade: b, refund });
    return refund;
  }

  /** The intact barricade a ground enemy is walking into, if any. */
  private blockingBarricade(e: Enemy): Barricade | null {
    if (e.def.flying || e.hidden || !this.barricades.length) return null;
    for (const b of this.barricades) {
      const dx = b.x - e.x, dz = b.z - e.z;
      const d2 = dx * dx + dz * dz;
      // In contact and still ahead of the enemy.
      if (d2 < 0.5 * 0.5 && dx * e.dirX + dz * e.dirZ > -0.05) return b;
    }
    return null;
  }

  /** The player has seen the new-Age / new-road announcement: start that wave. */
  continueFrontier(): void {
    if (this.holdingFor < 0) return;
    this.frontierDone.add(this.holdingFor);
    this.holdingFor = -1;
    if (this.state === 'prep') this.state = 'playing';
    this.startWave();
  }

  private frontierDone = new Set<number>();

  /** Starts the first wave or calls the next wave early. */
  callNextWave(): boolean {
    if (this.state === 'prep') {
      this.state = 'playing';
      this.startWave();
      return true;
    }
    if (this.state !== 'playing' || this.nextWaveTimer < 0) return false;
    const bonus = this.earlyCallBonus();
    if (bonus > 0) this.addGold(bonus);
    this.stats.earlyCalls++;
    this.events.emit('earlyCall', { gold: bonus });
    this.startWave();
    return true;
  }

  heroAbilityReady(h: Hero | null = this.hero): boolean {
    return !!h && h.abilityCd <= 0 && this.state === 'playing';
  }

  useHeroAbility(h: Hero | null = this.hero): boolean {
    if (!h || !this.heroAbilityReady(h)) return false;
    const ab = h.def.ability;
    const scale = this.heroScale(this.config.meta, h);
    const power = scale.ability;
    let cx = h.x;
    let cz = h.z;
    if (ab.kind === 'shadowStrike') {
      // Dash through the toughest enemies in reach, then reappear beside the last one.
      const targets = this.enemies
        .filter((e) => e.alive && !e.hidden && !e.def.flying && (e.x - h.x) ** 2 + (e.z - h.z) ** 2 <= ab.castRange ** 2)
        .sort((a, b) => b.hp - a.hp)
        .slice(0, ab.count ?? 6);
      if (!targets.length) return false;
      h.abilityCd = ab.cooldown * scale.cooldown;
      this.stats.heroAbilityUses++;
      const points: number[] = [h.x, h.z];
      for (const e of targets) {
        points.push(e.x, e.z);
        this.heroDamage(h, e, ab.damage * power, h.def.damageType);
      }
      // Kage strikes and is back at their post in a blink.
      points.push(h.x, h.z);
      h.attackAnim = 0.25;
      this.events.emit('heroAbility', { hero: h, x: h.x, z: h.z, radius: ab.radius, points });
      return true;
    }
    if (ab.castRange > 0) {
      // Aim at the densest cluster within cast range.
      let bestN = 0;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if ((e.x - h.x) ** 2 + (e.z - h.z) ** 2 > ab.castRange ** 2) continue;
        let n = 0;
        for (const o of this.enemies) if (o.alive && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 <= ab.radius ** 2) n += o.def.boss ? 4 : 1;
        if (n > bestN) {
          bestN = n;
          cx = e.x;
          cz = e.z;
        }
      }
      if (bestN === 0) return false;
    }
    h.abilityCd = ab.cooldown * scale.cooldown;
    this.stats.heroAbilityUses++;
    for (const e of this.enemies) {
      if (!e.alive || e.hidden) continue;
      if ((e.x - cx) ** 2 + (e.z - cz) ** 2 > ab.radius ** 2) continue;
      if (ab.kind === 'quake' && e.def.flying) continue;
      this.heroDamage(h, e, ab.damage * power, h.def.damageType);
      if (ab.kind === 'taunt' && e.alive) e.stunTimer = Math.max(e.stunTimer, e.def.boss ? ab.duration * 0.4 : ab.duration);
      if (ab.kind === 'quake' && e.alive) this.applySlow(e, 0.4, ab.duration);
    }
    if (ab.kind === 'holyLight') {
      this.castleHp = Math.min(this.castleMaxHp, this.castleHp + (ab.count ?? 3));
    }
    this.events.emit('heroAbility', { hero: h, x: cx, z: cz, radius: ab.radius });
    return true;
  }

  summonReinforcements(): boolean {
    if (this.reinforcementsUsed || this.state !== 'playing') return false;
    this.reinforcementsUsed = true;
    // Stand beside the road with the most enemies on it.
    const counts = this.map.paths.map(() => 0);
    for (const e of this.enemies) if (e.alive) counts[e.path]++;
    const road = counts.indexOf(Math.max(...counts));
    const p = this.map.pointAt(road, this.map.paths[road].length * 0.62, this.tmp);
    this.ally.active = true;
    this.ally.x = p.x + p.dz * 0.6;
    this.ally.z = p.z - p.dx * 0.6;
    this.ally.timer = AD_REWARDS.reinforcementDuration;
    this.ally.cooldown = 0;
    return true;
  }

  revive(): void {
    if (this.state !== 'reviveOffer') return;
    this.reviveUsed = true;
    this.castleHp = Math.max(1, Math.round(this.castleMaxHp * AD_REWARDS.reviveHpFraction));
    // Clear the enemies that are about to reach the castle so the revive is meaningful.
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (this.map.paths[e.path].length - e.dist < 3 && !e.def.boss) this.kill(e, false);
      else if (e.def.boss && this.map.paths[e.path].length - e.dist < 3) e.dist = Math.max(0, e.dist - 4);
    }
    this.state = 'playing';
    this.events.emit('revived', undefined);
  }

  declineRevive(): void {
    if (this.state !== 'reviveOffer') return;
    this.lose();
  }

  // --- Simulation ----------------------------------------------------------------

  update(dt: number): void {
    if (this.state !== 'playing' && this.state !== 'prep') return;
    if (this.state === 'prep') {
      this.updateHero(dt);
      return;
    }
    this.time += dt;
    this.updateSpells(dt);
    this.updateSpawns();
    this.updateWaveTimer(dt);
    this.updateEnemies(dt);
    if (this.state !== 'playing') return;
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateHero(dt);
    this.updateCastle(dt);
    this.updateAlly(dt);
    this.checkWaves();
  }

  /** No more waves until the checkpoint is reached and the player has moved on from it. */
  get waitingForCheckpoint(): boolean {
    if (!this.holdAtCheckpoints) return false;
    const n = this.waveIndex;
    return this.checkpointBreak || (n > 0 && n % SIEGE.checkpointEvery === 0 && n > this.lastCheckpoint);
  }

  /** The player tapped Onward on the checkpoint screen: the siege carries on. */
  resumeAfterCheckpoint(): void {
    if (!this.checkpointBreak) return;
    this.checkpointBreak = false;
    // Count down to the next wave as usual (it can still be called early).
    if (this.state === 'playing' && this.nextWaveTimer < 0 && this.holdingFor < 0) this.nextWaveTimer = SIEGE.waveGap;
  }

  private startWave(): void {
    const n = this.waveIndex;
    const wave = this.waveDef(n);
    if (!wave) return;
    if (this.holdingFor >= 0 || this.waitingForCheckpoint) return;
    for (const h of this.heroes) if (this.heroHasPerk('phoenix', h)) h.abilityCd = 0;
    const newAge = n > 0 && n % SIEGE.ageEvery === 0;
    const roads = activeRoads().map((r, i) => (r.openWave === n && n > 0 ? i : -1)).filter((i) => i >= 0);
    if (newAge && this.announcedWave !== n) {
      // The new Age arrives before its first wave, so the world changes while the player gets ready.
      this.announcedWave = n;
      this.events.emit('ageChange', { age: ageOf(n), wave: n });
    }
    if (this.config.announceFrontiers && (newAge || roads.length) && this.holdingFor !== n && !this.frontierDone.has(n)) {
      this.holdingFor = n;
      this.nextWaveTimer = -1;
      this.events.emit('frontier', { wave: n, age: ageOf(n), newAge, roads });
      return;
    }
    this.waveIndex++;
    this.nextWaveTimer = -1;
    if (n > 0 && this.goldRushWaves > 0) this.goldRushWaves--;
    for (const i of roads) this.events.emit('roadOpened', { road: i });
    let total = 0;
    for (const g of wave.groups) {
      for (let i = 0; i < g.count; i++) {
        const isBoss = !!ENEMIES[g.enemy].boss;
        this.spawnQueue.push({
          time: this.time + g.delay + i * g.spacing,
          enemy: g.enemy,
          path: g.path % this.map.paths.length,
          wave: n,
          hpMult: wave.hpMult * (isBoss ? wave.bossHp ?? 1 : 1),
          goldMult: wave.goldMult ?? 1,
        });
        total++;
      }
    }
    this.spawnQueue.sort((a, b) => a.time - b.time);
    this.waveRemaining.set(n, total);
    this.waveSpawnDone.set(n, false);
    this.events.emit('waveStart', { index: n, total: this.totalWaves });
  }

  private updateSpawns(): void {
    while (this.spawnQueue.length && this.spawnQueue[0].time <= this.time) {
      const s = this.spawnQueue.shift()!;
      const e = this.spawnEnemy(s.enemy, s.path, 0, s.wave, s.hpMult, s.goldMult);
      this.maybeElite(e);
      if (!this.spawnQueue.some((q) => q.wave === s.wave)) this.waveSpawnDone.set(s.wave, true);
    }
  }

  private updateWaveTimer(dt: number): void {
    if (this.holdingFor >= 0) return;
    if (this.waitingForCheckpoint) {
      this.nextWaveTimer = -1;
      return;
    }
    const lastWave = this.waveIndex - 1;
    if (this.nextWaveTimer < 0) {
      if (this.waveSpawnDone.get(lastWave)) this.nextWaveTimer = SIEGE.waveGap;
      return;
    }
    this.nextWaveTimer -= dt;
    // Accelerate when the field is empty so players never wait idle.
    if (this.aliveCount() === 0) this.nextWaveTimer -= dt * 2;
    if (this.nextWaveTimer <= 0) this.startWave();
  }

  /** `inherited`: hp and gold already include the challenge modifiers (summons and splits). */
  spawnEnemy(id: EnemyId, path: number, dist: number, wave: number, hpMult: number, goldMult = 1, inherited = false): Enemy {
    const def = ENEMIES[id];
    let e = this.enemies.find((o) => !o.alive && o.flash <= -1);
    if (!e) {
      e = {} as Enemy;
      this.enemies.push(e);
    }
    const mods = this.config.mods;
    const hp = def.hp * hpMult * (inherited || !mods ? 1 : mods.enemyHp * Math.pow(1 + mods.hpRamp, Math.max(0, wave - mods.rampFrom)));
    Object.assign(e, {
      id: this.nextId++, def, alive: true, hp, maxHp: hp, path, dist, lane: this.rng.range(-0.22, 0.22),
      x: 0, y: def.flying ? ENEMY_RULES.flyHeight : 0, z: 0, dirX: 1, dirZ: 0,
      slowFactor: 1, slowTimer: 0, stunTimer: 0, shred: 0, shredTimer: 0, flash: 0, shielded: 0,
      dotDps: 0, dotTimer: 0, dotTick: 0, dotType: 'magic', dotKind: 'burn', dotTowerId: -1,
      elite: null, hidden: !!def.tunnel, burrowTimer: def.burrow ? def.burrow.interval * this.rng.range(0.4, 1) : 0,
      freezeTimer: def.freezeTowers ? def.freezeTowers.interval * this.rng.range(0.5, 1) : def.siege ? def.siege.interval * this.rng.range(0.4, 0.8) : 0,
      abilityTimer: def.heal ? def.heal.interval * this.rng.range(0.5, 1) : 0,
      summonTimer: def.boss?.summonInterval ?? 0,
      chargeTimer: def.boss?.chargeInterval ?? 0,
      immuneTimer: 0, immuneIdx: 0, wave, bountyMult: goldMult * (inherited ? 1 : mods?.killGold ?? 1), armorBonus: 0, speedMult: mods?.enemySpeed ?? 1, frozen: false,
      phase: this.rng.next() * Math.PI * 2,
    } satisfies Partial<Enemy>);
    this.placeEnemy(e);
    this.events.emit('enemySpawn', e);
    return e;
  }

  /** Rarely promotes a fresh regular enemy to an elite with a random trait. */
  private maybeElite(e: Enemy): void {
    if (e.def.boss || e.def.id === 'minion' || e.wave < ELITE_RULES.firstWave) return;
    const chance = Math.min(ELITE_RULES.chanceMax, ELITE_RULES.chanceBase + ELITE_RULES.chancePerWave * e.wave) * (this.config.mods?.eliteMult ?? 1);
    if (this.rng.next() >= chance) return;
    this.makeElite(e, this.rng.pick(Object.keys(ELITES) as EliteTrait[]));
  }

  makeElite(e: Enemy, trait: EliteTrait): void {
    e.elite = trait;
    e.maxHp *= ELITE_RULES.hpMult;
    e.hp = e.maxHp;
    e.bountyMult *= ELITE_RULES.bountyMult;
    if (trait === 'armored') e.armorBonus += ELITE_RULES.armorBonus;
    if (trait === 'swift') e.speedMult *= ELITE_RULES.swiftMult;
    this.events.emit('eliteSpawn', e);
  }

  private placeEnemy(e: Enemy): void {
    const p = this.map.pointAt(e.path, e.dist, this.tmp);
    e.x = p.x - p.dz * e.lane;
    e.z = p.z + p.dx * e.lane;
    e.dirX = p.dx;
    e.dirZ = p.dz;
  }

  private updateEnemies(dt: number): void {
    for (const b of this.barricades) b.hitT += dt;
    // Shield-bearer protection.
    for (const e of this.enemies) if (e.alive) e.shielded = 0;
    for (const sb of this.enemies) {
      if (!sb.alive || !sb.def.shield) continue;
      const r = sb.def.shield.range;
      for (const o of this.enemies) {
        if (!o.alive || o === sb || o.path !== sb.path || o.def.flying) continue;
        const d = sb.dist - o.dist;
        if (d > 0 && d <= r) o.shielded = Math.max(o.shielded, sb.def.shield.reduction);
      }
    }

    for (const e of this.enemies) {
      if (!e.alive) {
        if (e.flash > -1) e.flash -= dt;
        continue;
      }
      if (e.flash > 0) e.flash -= dt;
      if (e.shredTimer > 0 && (e.shredTimer -= dt) <= 0) e.shred = 0;
      if (e.slowTimer > 0 && (e.slowTimer -= dt) <= 0) e.slowFactor = 1;
      if (e.immuneTimer > 0) e.immuneTimer -= dt;
      if (e.dotTimer > 0) {
        e.dotTimer -= dt;
        e.dotTick += dt;
        if (e.dotTick >= DOT_TICK || e.dotTimer <= 0) {
          const amount = e.dotDps * Math.min(e.dotTick, DOT_TICK);
          e.dotTick = 0;
          this.damage(e, amount, e.dotType);
          if (!e.alive) {
            const tw = this.towers.find((t) => t.id === e.dotTowerId);
            if (tw) tw.kills++;
            continue;
          }
        }
        if (e.dotTimer <= 0) e.dotDps = 0;
      }
      const def = e.def;
      if (e.elite === 'regen' && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * ELITE_RULES.regenPerSecond * dt);

      // Sand Wraith: dives under the sand, then resurfaces.
      if (def.burrow) {
        e.burrowTimer -= dt;
        if (e.burrowTimer <= 0) {
          e.hidden = !e.hidden;
          e.burrowTimer = e.hidden ? def.burrow.duration : def.burrow.interval;
          this.events.emit('burrow', { enemy: e, hidden: e.hidden });
        }
      }
      // Ice Golem: freezes the nearest working tower.
      if (def.freezeTowers) {
        e.freezeTimer -= dt;
        if (e.freezeTimer <= 0) {
          e.freezeTimer = def.freezeTowers.interval;
          let best: Tower | null = null;
          let bd = def.freezeTowers.radius ** 2;
          for (const t of this.towers) {
            const d2 = (t.x - e.x) ** 2 + (t.z - e.z) ** 2;
            if (d2 <= bd && t.frozen <= 0) {
              bd = d2;
              best = t;
            }
          }
          if (best) {
            best.frozen = def.freezeTowers.duration;
            this.events.emit('towerFrozen', { tower: best, enemy: e });
          }
        }
      }

      // Siege Engine: lobs a rock at the nearest working tower.
      if (def.siege && !e.hidden) {
        e.freezeTimer -= dt;
        if (e.freezeTimer <= 0) {
          e.freezeTimer = def.siege.interval;
          let best: Tower | null = null;
          let bd = def.siege.radius ** 2;
          for (const t of this.towers) {
            const d2 = (t.x - e.x) ** 2 + (t.z - e.z) ** 2;
            if (d2 <= bd && t.dazed <= 0 && !this.siegeShots.some((s) => s.towerId === t.id)) {
              bd = d2;
              best = t;
            }
          }
          if (best) {
            this.siegeShots.push({ towerId: best.id, t: def.siege.flight, duration: def.siege.duration });
            this.events.emit('siegeThrow', { enemy: e, tower: best, flight: def.siege.flight });
          }
        }
      }
      // Tunneller: digs up halfway along its road.
      if (def.tunnel && e.hidden && e.dist >= this.map.paths[e.path].length * def.tunnel.surfaceAt) {
        e.hidden = false;
        this.events.emit('burrow', { enemy: e, hidden: false });
      }

      // Healer.
      if (def.heal) {
        e.abilityTimer -= dt;
        if (e.abilityTimer <= 0) {
          e.abilityTimer = def.heal.interval;
          const targets: Enemy[] = [];
          const amt = def.heal.amount * (e.maxHp / def.hp);
          for (const o of this.enemies) {
            if (!o.alive || o.hp >= o.maxHp) continue;
            if ((o.x - e.x) ** 2 + (o.z - e.z) ** 2 > def.heal.radius ** 2) continue;
            o.hp = Math.min(o.maxHp, o.hp + amt);
            targets.push(o);
          }
          if (targets.length) this.events.emit('heal', { enemy: e, targets });
        }
      }

      // Boss mechanics.
      let chargeMult = 1;
      if (def.boss) {
        const b = def.boss;
        if (b.mechanics.includes('summon') && b.summonId) {
          e.summonTimer -= dt;
          if (e.summonTimer <= 0) {
            e.summonTimer = b.summonInterval ?? 8;
            for (let i = 0; i < (b.summonCount ?? 2); i++) {
              const m = this.spawnEnemy(b.summonId, e.path, Math.max(0, e.dist - 0.4 - i * 0.35), e.wave, e.maxHp / def.hp * 0.25 + 0.5, e.bountyMult, true);
              this.waveRemaining.set(e.wave, (this.waveRemaining.get(e.wave) ?? 0) + 1);
              m.lane = this.rng.range(-0.3, 0.3);
            }
            this.events.emit('bossMechanic', { enemy: e, kind: 'summon' });
          }
        }
        if (b.mechanics.includes('charge')) {
          e.chargeTimer -= dt;
          if (e.chargeTimer <= 0) {
            if (e.chargeTimer > -dt * 1.5) this.events.emit('bossMechanic', { enemy: e, kind: 'charge' });
            if (e.chargeTimer < -(b.chargeDuration ?? 1.5)) e.chargeTimer = b.chargeInterval ?? 8;
            else chargeMult = b.chargeSpeedMult ?? 2.5;
          }
        }
      }

      e.frozen = false;
      if (e.elite === 'unstoppable') e.stunTimer = 0;
      if (e.stunTimer > 0) {
        e.stunTimer -= dt;
        e.frozen = true;
      } else {
        const wall = this.blockingBarricade(e);
        if (wall) {
          // Stopped at a barricade: batter it down.
          e.frozen = true;
          const scale = Math.pow(e.maxHp / def.hp, BARRICADE.hpExponent);
          wall.hp -= BARRICADE.attackDps * def.leakDamage * scale * (def.boss ? BARRICADE.bossMult : 1) * chargeMult * dt;
          wall.hitT = 0;
          if (wall.hp <= 0) {
            this.barricades.splice(this.barricades.indexOf(wall), 1);
            this.events.emit('barricadeBroken', wall);
          }
        } else {
          const speed = def.speed * e.speedMult * e.slowFactor * chargeMult * (def.tunnel && e.hidden ? def.tunnel.speedMult : 1);
          e.dist += speed * dt;
        }
      }
      const len = this.map.paths[e.path].length;
      if (e.dist >= len) {
        this.leak(e);
        if (this.state !== 'playing') return;
        continue;
      }
      this.placeEnemy(e);
    }
  }

  private leak(e: Enemy): void {
    e.alive = false;
    e.flash = -1;
    if (e.def.steal) {
      // A thief slips through and makes off with gold instead of hurting the castle.
      const amount = Math.min(Math.floor(this.gold), Math.round(e.def.bounty * e.def.steal.bountyMult * e.bountyMult * goldScaleAt(e.wave)));
      this.addGold(-amount, false);
      this.events.emit('goldStolen', { enemy: e, amount });
      this.decWave(e.wave);
      return;
    }
    this.stats.leaks++;
    const dmg = e.def.leakDamage;
    this.castleHp = Math.max(0, this.castleHp - dmg);
    this.events.emit('enemyLeak', { enemy: e, damage: dmg });
    this.events.emit('castleHit', { damage: dmg, hp: this.castleHp });
    this.decWave(e.wave);
    if (this.castleHp <= 0) {
      if (this.config.reviveAvailable && !this.reviveUsed) {
        this.state = 'reviveOffer';
        this.events.emit('reviveOffer', undefined);
      } else {
        this.lose();
      }
    }
  }

  private lose(): void {
    this.state = 'lost';
    this.events.emit('defeat', undefined);
  }

  private decWave(w: number): void {
    this.waveRemaining.set(w, (this.waveRemaining.get(w) ?? 1) - 1);
  }

  private checkWaves(): void {
    for (const [w, n] of this.waveRemaining) {
      if (n <= 0 && this.waveSpawnDone.get(w)) {
        this.waveRemaining.delete(w);
        const gold = Math.round((SIEGE.waveClearBase + SIEGE.waveClearPerWave * w) * goldScaleAt(w));
        this.addGold(gold);
        for (const t of this.towers) {
          if (t.stats.income <= 0) continue;
          const g = Math.round(t.stats.income * goldScaleAt(w));
          this.addGold(g);
          this.events.emit('mineGold', { tower: t, gold: g });
        }
        for (const h of this.heroes) if (this.heroHasPerk('guardian', h)) this.castleHp = Math.min(this.castleMaxHp, this.castleHp + HERO_POST.guardianHp);
        this.events.emit('waveCleared', { index: w, gold });
        if ((w + 1) % SIEGE.checkpointEvery === 0 && w + 1 > this.lastCheckpoint) this.pendingCheckpoint = Math.max(this.pendingCheckpoint, w + 1);
      }
    }
    // A save restored right at a checkpoint it never announced (nothing left to clear): award it now
    // rather than holding the siege for a checkpoint that can no longer be earned.
    const n = this.waveIndex;
    if (this.holdAtCheckpoints && !this.pendingCheckpoint && !this.checkpointBreak && n > 0 && n % SIEGE.checkpointEvery === 0 && n > this.lastCheckpoint
      && this.waveRemaining.size === 0 && this.spawnQueue.length === 0 && this.aliveCount() === 0) this.pendingCheckpoint = n;
    // With the checkpoint break, wait until the last enemy is down (stragglers from earlier waves too).
    const cp = this.pendingCheckpoint;
    if (cp && (!this.holdAtCheckpoints || (this.waveRemaining.size === 0 && this.spawnQueue.length === 0 && this.aliveCount() === 0))) {
      this.pendingCheckpoint = 0;
      this.lastCheckpoint = cp;
      this.checkpointBreak = this.holdAtCheckpoints;
      // A new checkpoint segment: once-per-segment ad rewards are available again.
      this.reviveUsed = false;
      this.reinforcementsUsed = false;
      this.goldRushUsed = false;
      this.events.emit('checkpoint', { wave: cp });
    }
  }

  addGold(amount: number, earned = true): void {
    this.gold += amount;
    if (amount > 0 && earned) this.stats.goldEarned += amount;
    this.events.emit('gold', { amount, total: this.gold });
  }

  /** Applies damage with resistances; returns damage dealt. */
  damage(e: Enemy, raw: number, type: DamageType): number {
    if (!e.alive) return 0;
    if (e.immuneTimer > 0) {
      this.events.emit('enemyHit', { enemy: e, amount: 0, immune: true, type });
      return 0;
    }
    let resist = type === 'physical' ? e.def.armor + e.armorBonus - e.shred : e.def.magicResist + (e.elite === 'armored' ? ELITE_RULES.armorBonus : 0);
    resist = Math.max(0, Math.min(0.85, resist));
    let dmg = raw * (1 - resist);
    if (e.shielded > 0) dmg *= 1 - e.shielded;
    e.hp -= dmg;
    e.flash = 0.12;
    this.events.emit('enemyHit', { enemy: e, amount: dmg, immune: false, type });
    // Immunity thresholds.
    const b = e.def.boss;
    if (b?.immuneAt && e.immuneIdx < b.immuneAt.length && e.hp > 0 && e.hp / e.maxHp <= b.immuneAt[e.immuneIdx]) {
      e.immuneIdx++;
      e.immuneTimer = b.immuneDuration ?? 3;
      this.events.emit('bossMechanic', { enemy: e, kind: 'immune' });
    }
    if (e.hp <= 0) this.kill(e, true);
    return dmg;
  }

  private kill(e: Enemy, reward: boolean): void {
    e.alive = false;
    e.hp = 0;
    e.hidden = false;
    if (reward && e.elite === 'splitter') {
      for (let i = 0; i < 2; i++) {
        const m = this.spawnEnemy(e.def.id, e.path, Math.max(0, e.dist - i * 0.3), e.wave, (e.maxHp / ELITE_RULES.hpMult / e.def.hp) * 0.5, e.bountyMult / ELITE_RULES.bountyMult, true);
        m.lane = e.lane + (i - 0.5) * 0.3;
        this.placeEnemy(m);
        this.waveRemaining.set(e.wave, (this.waveRemaining.get(e.wave) ?? 0) + 1);
      }
    }
    if (reward && e.elite) this.events.emit('eliteKill', e);
    if (reward && e.def.split) {
      // Lava Slug: bursts into smaller slugs where it died.
      for (let i = 0; i < e.def.split.count; i++) {
        const m = this.spawnEnemy(e.def.split.id, e.path, Math.max(0, e.dist - i * 0.25), e.wave, e.maxHp / e.def.hp, e.bountyMult, true);
        m.lane = e.lane + (i - (e.def.split.count - 1) / 2) * 0.25;
        this.placeEnemy(m);
        this.waveRemaining.set(e.wave, (this.waveRemaining.get(e.wave) ?? 0) + 1);
      }
    }
    e.flash = 0.6; // death animation timer (counts down to -1 before reuse)
    const rush = this.goldRushWaves > 0 ? SIEGE.goldRushMult : 1;
    let prospect = 0;
    if (reward) {
      for (const t of this.towers) {
        if (t.stats.goldAura > 0 && (t.x - e.x) ** 2 + (t.z - e.z) ** 2 <= t.stats.range * t.stats.range) prospect = Math.max(prospect, t.stats.goldAura);
      }
    }
    const night = (nightOf(e.wave) >= 1 ? 1 + SIEGE.nightGold : 1) * (this.blessingT > 0 ? 2 : 1) * (this.heroHit && this.heroHasPerk('bounty', this.heroHit) ? 1.5 : 1);
    const bounty = reward ? Math.round(e.def.bounty * e.bountyMult * rush * night * goldScaleAt(e.wave) * (1 + this.config.meta.goldBonus) * (1 + prospect)) : 0;
    if (reward) {
      this.stats.kills++;
      if (e.def.flying) this.stats.flyingKills++;
      if (e.def.boss) this.stats.bossKills++;
      this.addGold(bounty);
    }
    this.decWave(e.wave);
    this.events.emit('enemyDeath', { enemy: e, bounty });
  }

  private remaining(e: Enemy): number {
    return this.map.paths[e.path].length - e.dist;
  }

  findTarget(x: number, z: number, range: number, air: boolean, ground: boolean, mode: TargetMode, exclude?: Set<number>): Enemy | null {
    let best: Enemy | null = null;
    let bestScore = Infinity;
    const r2 = range * range;
    for (const e of this.enemies) {
      if (!e.alive || e.hidden) continue;
      if (e.def.flying ? !air : !ground) continue;
      if (exclude?.has(e.id)) continue;
      const d2 = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d2 > r2) continue;
      const score = mode === 'first' ? this.remaining(e) : mode === 'strongest' ? -e.hp : d2;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private updateTowers(dt: number): void {
    // Siege rocks land.
    for (let i = this.siegeShots.length - 1; i >= 0; i--) {
      const sh = this.siegeShots[i];
      if ((sh.t -= dt) > 0) continue;
      this.siegeShots.splice(i, 1);
      const t = this.towers.find((o) => o.id === sh.towerId);
      if (!t) continue;
      t.dazed = Math.max(t.dazed, sh.duration);
      this.events.emit('siegeHit', { tower: t });
    }
    for (const t of this.towers) {
      if (t.dazed > 0) {
        t.dazed -= dt;
        continue;
      }
      if (t.frozen > 0) {
        t.frozen -= dt;
        continue;
      }
      if (isSupport(t.def.id)) continue;
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const st = t.stats;
      const air = t.def.hitsAir;
      const ground = t.def.hitsGround;
      if (st.aura) {
        let hit = false;
        for (const e of this.enemies) {
          if (!e.alive || e.hidden || (e.x - t.x) ** 2 + (e.z - t.z) ** 2 > st.range * st.range) continue;
          this.applySlow(e, st.slowFactor, st.slowDuration);
          this.damage(e, st.damage, t.def.damageType);
          hit = true;
        }
        if (hit) {
          t.cooldown = st.cooldown;
          t.lastFire = this.time;
          this.events.emit('splash', { x: t.x, z: t.z, radius: st.range, kind: 'aura' });
          this.events.emit('towerFire', { tower: t, target: null });
        }
        continue;
      }
      const target = this.findTarget(t.x, t.z, st.range, air, ground, t.targetMode);
      if (!target) continue;
      t.cooldown = st.cooldown;
      t.lastFire = this.time;
      t.aim = Math.atan2(target.x - t.x, target.z - t.z);
      this.events.emit('towerFire', { tower: t, target });

      if (st.chains > 0) {
        this.fireLightning(t, target);
        continue;
      }
      const targets = [target];
      if (st.multishot > 1) {
        const ex = new Set([target.id]);
        for (let i = 1; i < st.multishot; i++) {
          const o = this.findTarget(t.x, t.z, st.range, air, ground, t.targetMode, ex);
          if (!o) break;
          ex.add(o.id);
          targets.push(o);
        }
      }
      for (const tg of targets) this.fireProjectile(t, tg);
    }
  }

  private fireLightning(t: Tower, first: Enemy): void {
    const st = t.stats;
    const hit = new Set<number>();
    const points: number[] = [t.x, 1.6, t.z];
    let cur: Enemy | null = first;
    let dmg = st.damage;
    for (let i = 0; i < st.chains && cur; i++) {
      hit.add(cur.id);
      points.push(cur.x, cur.y + 0.35 * cur.def.scale, cur.z);
      const tgt: Enemy = cur;
      this.damage(tgt, dmg, 'magic');
      if (st.stun > 0 && tgt.alive) tgt.stunTimer = Math.max(tgt.stunTimer, tgt.def.boss ? st.stun * 0.3 : st.stun);
      if (!tgt.alive && i === 0) t.kills++;
      dmg *= TOWER_RULES.chainFalloff;
      cur = this.findTarget(tgt.x, tgt.z, st.chainRange, true, true, 'closest', hit);
    }
    this.events.emit('lightning', { tower: t, points });
  }

  private allocProjectile(): Projectile {
    let p = this.projectiles.find((o) => !o.active);
    if (!p) {
      p = { id: 0 } as Projectile;
      this.projectiles.push(p);
    }
    return p;
  }

  private fireProjectile(t: Tower, target: Enemy): void {
    const st = t.stats;
    const kind = PROJECTILE_OF[t.def.id] ?? 'arrow';
    const y = t.def.id === 'ballista' ? 0.8 + t.tier * 0.05 : t.def.id === 'flame' ? 0.9 + t.tier * 0.06 : 1.25 + t.tier * 0.12;
    this.launch(kind, t.x, y, t.z, target, st.projectileSpeed, st.damage, t.def.damageType, st.splash, t.id, {
      slowFactor: st.slowFactor, slowDuration: st.slowDuration, stun: st.stun, freezeChance: st.freezeChance, shred: st.shred,
      hitsAir: t.def.hitsAir, hitsGround: t.def.hitsGround, pierce: st.pierce, dot: st.dot, dotDuration: st.dotDuration, knockback: st.knockback,
    });
    if (st.pierce > 0) {
      // Bolts fly in a straight line through the target and on to the edge of the range.
      const p = this.projectiles[this.lastLaunched];
      const dx = target.x - t.x, dz = target.z - t.z;
      const d = Math.hypot(dx, dz) || 1;
      const reach = st.range + 1.2;
      p.tx = t.x + (dx / d) * reach;
      p.tz = t.z + (dz / d) * reach;
    }
  }

  private launch(
    kind: ProjectileKind, x: number, y: number, z: number, target: Enemy, speed: number, damage: number, type: DamageType, splash: number, towerId: number,
    extra: Partial<Projectile>,
  ): void {
    const p = this.allocProjectile();
    this.lastLaunched = this.projectiles.indexOf(p);
    const arc = kind === 'cannon' || kind === 'poison' || kind === 'boulder';
    // Lead the target for arcing shots.
    let tx = target.x;
    let tz = target.z;
    const d0 = Math.hypot(tx - x, tz - z);
    let duration = d0 / speed;
    if (arc) {
      const sp = target.def.speed * target.speedMult * target.slowFactor * (target.stunTimer > 0 ? 0 : 1);
      const lead = this.map.pointAt(target.path, target.dist + sp * duration, this.tmp);
      tx = lead.x - lead.dz * target.lane;
      tz = lead.z + lead.dx * target.lane;
      duration = Math.max(0.35, Math.hypot(tx - x, tz - z) / speed);
    }
    Object.assign(p, {
      id: this.nextId++, active: true, kind, x, y, z, sx: x, sy: y, sz: z, tx, tz, targetId: target.id, speed, t: 0, duration,
      damage, damageType: type, splash, slowFactor: 1, slowDuration: 0, stun: 0, freezeChance: 0, shred: 0, hitsAir: true, hitsGround: true,
      towerId, arc, pierce: 0, pierced: [], dot: 0, dotDuration: 0, knockback: 0, ...extra,
    } satisfies Partial<Projectile>);
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      if (p.arc) {
        p.t += dt;
        const k = Math.min(1, p.t / p.duration);
        p.x = p.sx + (p.tx - p.sx) * k;
        p.z = p.sz + (p.tz - p.sz) * k;
        p.y = p.sy * (1 - k) + Math.sin(k * Math.PI) * (1.2 + p.duration * 1.2);
        if (k >= 1) this.impact(p, null);
        continue;
      }
      if (p.pierce > 0) {
        this.updateBolt(p, dt);
        continue;
      }
      const target = this.enemies.find((e) => e.id === p.targetId && e.alive);
      if (target) {
        p.tx = target.x;
        p.tz = target.z;
      }
      const ty = target ? target.y + 0.35 * target.def.scale : 0.3;
      const dx = p.tx - p.x, dy = ty - p.y, dz = p.tz - p.z;
      const d = Math.hypot(dx, dy, dz);
      const step = p.speed * dt;
      if (d <= Math.max(step, TOWER_RULES.projectileHitRadius)) {
        this.impact(p, target ?? null);
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
        p.z += (dz / d) * step;
      }
    }
  }

  private impact(p: Projectile, target: Enemy | null): void {
    p.active = false;
    this.events.emit('projectileHit', { p, x: p.x, z: p.z });
    const tower = this.towers.find((t) => t.id === p.towerId);
    const apply = (e: Enemy, dmg: number) => {
      if (p.slowFactor < 1) this.applySlow(e, p.slowFactor, p.slowDuration);
      if (p.shred > 0) {
        e.shred = Math.max(e.shred, p.shred);
        e.shredTimer = TOWER_RULES.shredDuration;
      }
      if (p.freezeChance > 0 && this.rng.next() < p.freezeChance && !e.def.boss) e.stunTimer = Math.max(e.stunTimer, p.stun);
      if (p.dot > 0) this.applyDot(e, dmg * p.dot, p.dotDuration, p.damageType, p.kind === 'poison' ? 'poison' : 'burn', p.towerId);
      const wasAlive = e.alive;
      const shooter = this.heroOfShot(p);
      this.heroHit = shooter;
      // Shatter: frozen or slowed enemies take extra cannon damage.
      if (tower?.synergies.includes('shatter') && tower.def.id === 'cannon' && (e.slowFactor < 1 || e.stunTimer > 0)) dmg *= 1.4;
      this.damage(e, dmg, p.damageType);
      if (p.knockback > 0 && e.alive) this.knockBack(e, p.knockback);
      if (wasAlive && !e.alive && tower) tower.kills++;
      this.heroHit = null;
      if (wasAlive && !e.alive && shooter) this.events.emit('heroKill', { enemy: e, hero: shooter });
    };
    if (p.splash > 0) {
      this.events.emit('splash', { x: p.x, z: p.z, radius: p.splash, kind: p.kind });
      const r2 = p.splash * p.splash;
      for (const e of this.enemies) {
        if (!e.alive || e.hidden) continue;
        if (e.def.flying ? !p.hitsAir : !p.hitsGround) continue;
        const d2 = (e.x - p.x) ** 2 + (e.z - p.z) ** 2;
        if (d2 > r2) continue;
        // Full damage near the centre, 50% at the edge.
        apply(e, p.damage * (1 - 0.5 * Math.sqrt(d2) / p.splash));
      }
    } else if (target && target.alive) {
      apply(target, p.damage);
    }
  }

  /** Moves a piercing bolt in a straight line, hitting each enemy it passes once. */
  private updateBolt(p: Projectile, dt: number): void {
    const dx = p.tx - p.x, dz = p.tz - p.z;
    const d = Math.hypot(dx, dz);
    const step = Math.min(d, p.speed * dt);
    const tower = this.towers.find((t) => t.id === p.towerId);
    if (d > 1e-4) {
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
    }
    // Sink gently towards body height.
    p.y += (0.35 - p.y) * Math.min(1, dt * 3);
    const r2 = BOLT_HIT_RADIUS * BOLT_HIT_RADIUS;
    for (const e of this.enemies) {
      if (!e.alive || e.hidden || p.pierced.includes(e.id)) continue;
      if (e.def.flying ? !p.hitsAir : !p.hitsGround) continue;
      if ((e.x - p.x) ** 2 + (e.z - p.z) ** 2 > r2) continue;
      p.pierced.push(e.id);
      if (p.shred > 0) {
        e.shred = Math.max(e.shred, p.shred);
        e.shredTimer = TOWER_RULES.shredDuration;
      }
      // Each enemy pierced takes a little less.
      this.damage(e, p.damage * Math.pow(0.9, p.pierced.length - 1), p.damageType);
      this.events.emit('projectileHit', { p, x: e.x, z: e.z });
      if (!e.alive && tower) tower.kills++;
      if (--p.pierce <= 0) break;
    }
    if (p.pierce <= 0 || d <= step + 1e-4) p.active = false;
  }

  /** Blows an enemy back along its road (bosses barely budge; unstoppable elites not at all). */
  private knockBack(e: Enemy, tiles: number): void {
    if (e.elite === 'unstoppable') return;
    const k = tiles * (e.def.boss ? 0.25 : 1);
    e.dist = Math.max(0, e.dist - k);
    this.placeEnemy(e);
  }

  private applyDot(e: Enemy, dps: number, duration: number, type: DamageType, kind: 'burn' | 'poison', towerId: number): void {
    if (e.def.dotImmune) return;
    // The strongest effect wins; re-applying refreshes the timer.
    if (dps >= e.dotDps || e.dotTimer <= 0) {
      e.dotDps = dps;
      e.dotType = type;
      e.dotKind = kind;
      e.dotTowerId = towerId;
    }
    e.dotTimer = Math.max(e.dotTimer, duration);
  }

  private applySlow(e: Enemy, factor: number, duration: number): void {
    if (e.elite === 'unstoppable') return;
    const f = e.def.boss ? 1 - (1 - factor) * 0.5 : factor;
    if (f <= e.slowFactor || e.slowTimer <= 0) {
      e.slowFactor = Math.min(e.slowTimer > 0 ? e.slowFactor : 1, f);
      e.slowTimer = Math.max(e.slowTimer, duration);
    }
  }

  private castleCd = 0;

  /** Archers on the castle walls (Battlements upgrade). */
  private updateCastle(dt: number): void {
    const lvl = this.config.meta.battlements ?? 0;
    if (lvl <= 0) return;
    this.castleCd -= dt;
    if (this.castleCd > 0) return;
    const c = this.map.castle;
    const shots = lvl >= BATTLEMENTS.secondArcherLevel ? 2 : 1;
    const ex = new Set<number>();
    const dmg = BATTLEMENTS.damagePerLevel * lvl * Math.pow(hpMultFor(this.currentWave), BATTLEMENTS.waveExp);
    let fired = false;
    for (let i = 0; i < shots; i++) {
      const target = this.findTarget(c.x, c.z, BATTLEMENTS.range, true, true, 'first', ex);
      if (!target) break;
      ex.add(target.id);
      this.launch('arrow', c.x + (i ? 0.35 : -0.35), 1.3, c.z, target, 15, dmg, 'physical', 0, -2, {});
      fired = true;
    }
    if (fired) {
      this.castleCd = BATTLEMENTS.cooldown;
      this.events.emit('castleFire', undefined);
    }
  }

  /** Heroes stand at their posts like towers: they never walk or fall. */
  private updateHero(dt: number): void {
    for (const h of this.heroes) {
      h.attackAnim = Math.max(0, h.attackAnim - dt);
      if (this.state !== 'playing') continue;
      if (h.abilityCd > 0) h.abilityCd -= dt;
      h.cooldown -= dt;
      if (h.cooldown > 0) continue;
      const target = this.findTarget(h.x, h.z, this.heroRange(h), h.def.hitsAir, true, 'closest');
      if (!target) continue;
      h.cooldown = h.def.cooldown * (this.heroHasPerk('swift', h) ? 0.8 : 1);
      h.attackAnim = 0.25;
      h.facing = Math.atan2(target.x - h.x, target.z - h.z);
      this.events.emit('heroAttack', { hero: h, target });
      this.launch(h.def.damageType === 'magic' ? 'heroBolt' : 'heroArrow', h.x, h.y + 0.8, h.z, target, 14, h.damage, h.def.damageType, 0, -10 - h.slot, {});
    }
  }

  private updateAlly(dt: number): void {
    const a = this.ally;
    if (!a.active) return;
    a.timer -= dt;
    a.attackAnim = Math.max(0, a.attackAnim - dt);
    if (a.timer <= 0) {
      a.active = false;
      return;
    }
    a.cooldown -= dt;
    if (a.cooldown > 0) return;
    const target = this.findTarget(a.x, a.z, REINFORCEMENT.range, REINFORCEMENT.hitsAir, true, 'first');
    if (!target) return;
    a.cooldown = REINFORCEMENT.cooldown;
    a.attackAnim = 0.3;
    a.facing = Math.atan2(target.x - a.x, target.z - a.z);
    this.events.emit('allyAttack', { ally: a, target });
    const scale = Math.max(1, hpMultFor(this.currentWave) * 0.6);
    this.launch('champion', a.x, 1.0, a.z, target, 16, REINFORCEMENT.damage * scale, 'magic', REINFORCEMENT.splash, -2, {});
  }
}
