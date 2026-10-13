// The in-run simulation. Pure logic with no rendering dependencies so it can be
// driven both by the 3D game and by the headless balance simulator.

import { ENEMIES, ENEMY_RULES, type EnemyDef, type EnemyId } from '../data/enemies';
import { TOWERS, TOWER_RULES, towerStats, totalInvested, type TowerDef, type TowerId, type TowerStats, type TargetMode, type DamageType } from '../data/towers';
import { HEROES, REINFORCEMENT, type HeroDef, type HeroId } from '../data/heroes';
import { RUN_ECONOMY, TOWER_META, AD_REWARDS, ENDLESS } from '../data/economy';
import { CHAPTERS } from '../data/levels';
import { Emitter } from '../core/Emitter';
import { Random } from '../core/Random';
import { LevelMap, type PathPoint } from './LevelMap';
import type { LevelDef } from './Levels';
import type { WaveDef } from './WaveComposer';

export interface MetaBonuses {
  towerLevels: Record<TowerId, number>;
  castleHpBonus: number;
  startGoldBonus: number;
  heroPower: number;
  heroId: HeroId | null;
}

export interface RunConfig {
  level: LevelDef;
  meta: MetaBonuses;
  availableTowers: TowerId[];
  allowSpecialisation: boolean;
  startGoldMult?: number;
  /** Whether the revive offer is possible (ads available, not headless). */
  reviveAvailable?: boolean;
  seed?: number;
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
}

export type ProjectileKind = 'arrow' | 'cannon' | 'frost' | 'heroArrow' | 'heroBolt' | 'champion';

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
}

export interface Hero {
  def: HeroDef;
  x: number; z: number;
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

export type RunState = 'prep' | 'playing' | 'reviveOffer' | 'won' | 'lost';

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
  heroAbility: { hero: Hero; x: number; z: number; radius: number };
  heroDeath: Hero;
  heroRespawn: Hero;
  allyAttack: { ally: Ally; target: Enemy };
  bossMechanic: { enemy: Enemy; kind: 'summon' | 'charge' | 'immune' };
  heal: { enemy: Enemy; targets: Enemy[] };
  towerBuilt: Tower;
  towerUpgraded: Tower;
  towerSold: { tower: Tower; refund: number };
  reviveOffer: void;
  revived: void;
  victory: { stars: number };
  defeat: void;
  milestone: { wave: number };
  earlyCall: { gold: number };
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
  readonly projectiles: Projectile[] = [];
  readonly hero: Hero | null;
  readonly ally: Ally = { active: false, x: 0, z: 0, timer: 0, cooldown: 0, facing: 0, attackAnim: 0 };
  readonly stats: RunStats = { kills: 0, flyingKills: 0, bossKills: 0, goldEarned: 0, towersBuilt: 0, upgrades: 0, heroAbilityUses: 0, earlyCalls: 0, maxTowers: 0, leaks: 0 };

  state: RunState = 'prep';
  gold: number;
  castleHp: number;
  readonly castleMaxHp: number;
  time = 0;
  /** Index of the next wave to start. */
  waveIndex = 0;
  readonly totalWaves: number;
  /** Countdown until the next wave auto-starts (-1 when not counting). */
  nextWaveTimer = -1;
  reviveUsed = false;
  reinforcementsUsed = false;

  private spawnQueue: SpawnEntry[] = [];
  private waveRemaining = new Map<number, number>();
  private waveSpawnDone = new Map<number, boolean>();
  private nextId = 1;
  private rng: Random;
  private tmp: PathPoint = { x: 0, z: 0, dx: 0, dz: 0 };
  private readonly endless: boolean;
  private readonly speedMult: number;
  private readonly extraArmor: number;
  private readonly waveGoldMult: number;

  constructor(public readonly config: RunConfig) {
    const lvl = config.level;
    const chapter = CHAPTERS[lvl.chapter];
    this.map = new LevelMap(lvl.layout, lvl.buildSpots, lvl.seed, chapter.theme.props);
    this.rng = new Random(config.seed ?? lvl.seed);
    this.endless = lvl.kind === 'endless';
    this.totalWaves = this.endless ? Infinity : lvl.waves.length;
    const mod = lvl.modifier;
    this.speedMult = mod?.enemySpeedMult ?? 1;
    this.extraArmor = mod?.extraArmor ?? 0;
    this.waveGoldMult = mod?.waveGoldMult ?? 1;
    const chapterBonus = lvl.kind === 'endless' ? 0 : chapter.startGoldBonus;
    this.gold = Math.round((RUN_ECONOMY.startingGold + chapterBonus + config.meta.startGoldBonus) * (mod?.startGoldMult ?? 1) * (config.startGoldMult ?? 1));
    this.castleMaxHp = Math.max(1, Math.round((RUN_ECONOMY.castleHp + config.meta.castleHpBonus) * (mod?.castleHpMult ?? 1)));
    this.castleHp = this.castleMaxHp;

    const heroId = mod?.noHero ? null : config.meta.heroId;
    if (heroId) {
      const def = HEROES[heroId];
      const p = this.defaultHeroPosition();
      const power = 1 + config.meta.heroPower;
      this.hero = {
        def, x: p.x, z: p.z, tx: p.x, tz: p.z, hp: def.hp * power, maxHp: def.hp * power, damage: def.damage * power,
        cooldown: 0, abilityCd: 3, dead: false, respawn: 0, facing: 0, moving: false, contactTimer: 0, attackAnim: 0,
      };
    } else {
      this.hero = null;
    }
  }

  // --- Queries ---------------------------------------------------------------

  waveDef(n: number): WaveDef | null {
    const lvl = this.config.level;
    if (lvl.endlessWave) return lvl.endlessWave(n);
    return lvl.waves[n] ?? null;
  }

  towerAt(spot: number): Tower | undefined {
    return this.towers.find((t) => t.spot === spot);
  }

  canAfford(cost: number): boolean {
    return this.gold >= cost;
  }

  upgradeCost(t: Tower): number | null {
    if (t.tier >= 4) return null;
    if (t.tier === 3 && !this.config.allowSpecialisation) return null;
    return t.def.upgradeCosts[t.tier - 1];
  }

  sellValue(t: Tower): number {
    return Math.floor(t.invested * TOWER_RULES.sellRefund);
  }

  isTowerAvailable(id: TowerId): boolean {
    const allowed = this.config.level.modifier?.allowedTowers;
    if (allowed && !allowed.includes(id)) return false;
    return this.config.availableTowers.includes(id);
  }

  computeStats(def: TowerDef, tier: number, branch: number): TowerStats {
    const base = towerStats(def, tier, branch);
    const lvl = this.config.meta.towerLevels[def.id] ?? 0;
    return {
      ...base,
      damage: base.damage * (1 + lvl * TOWER_META.damagePerLevel),
      range: base.range * (1 + lvl * TOWER_META.rangePerLevel),
    };
  }

  stars(): number {
    const f = this.castleHp / this.castleMaxHp;
    const th = RUN_ECONOMY.starThresholds;
    return f >= th[2] ? 3 : f >= th[1] ? 2 : 1;
  }

  aliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }

  /** Gold the player would get for calling the next wave now. */
  earlyCallBonus(): number {
    if (this.nextWaveTimer <= 0) return 0;
    return Math.min(RUN_ECONOMY.earlyCallMaxGold, Math.round(this.nextWaveTimer * RUN_ECONOMY.earlyCallGoldPerSecond));
  }

  // --- Commands --------------------------------------------------------------

  build(spot: number, id: TowerId): Tower | null {
    if (this.state !== 'prep' && this.state !== 'playing') return null;
    const s = this.map.buildSpots[spot];
    if (!s || this.towerAt(spot) || !this.isTowerAvailable(id)) return null;
    const def = TOWERS[id];
    if (this.gold < def.cost) return null;
    this.addGold(-def.cost);
    const t: Tower = {
      id: this.nextId++, def, spot, x: s.x, z: s.z, tier: 1, branch: -1, stats: this.computeStats(def, 1, -1),
      cooldown: 0.2, targetMode: TOWER_RULES.defaultTargetMode, invested: def.cost, kills: 0, aim: 0, lastFire: -10,
    };
    this.towers.push(t);
    this.stats.towersBuilt++;
    this.stats.maxTowers = Math.max(this.stats.maxTowers, this.towers.length);
    this.events.emit('towerBuilt', t);
    return t;
  }

  upgrade(t: Tower, branch = -1): boolean {
    const cost = this.upgradeCost(t);
    if (cost === null || this.gold < cost) return false;
    if (t.tier === 3 && branch < 0) return false;
    this.addGold(-cost);
    t.tier++;
    if (t.tier === 4) t.branch = branch;
    t.invested = totalInvested(t.def, t.tier);
    t.stats = this.computeStats(t.def, t.tier, t.branch);
    this.stats.upgrades++;
    this.events.emit('towerUpgraded', t);
    return true;
  }

  sell(t: Tower): void {
    const i = this.towers.indexOf(t);
    if (i < 0) return;
    const refund = this.sellValue(t);
    this.towers.splice(i, 1);
    this.addGold(refund, false);
    this.events.emit('towerSold', { tower: t, refund });
  }

  setTargetMode(t: Tower, mode: TargetMode): void {
    t.targetMode = mode;
  }

  /** Starts the first wave or calls the next wave early. */
  callNextWave(): boolean {
    if (this.state === 'prep') {
      this.state = 'playing';
      this.startWave();
      return true;
    }
    if (this.state !== 'playing' || this.nextWaveTimer < 0 || this.waveIndex >= this.totalWaves) return false;
    const bonus = this.earlyCallBonus();
    if (bonus > 0) this.addGold(bonus);
    this.stats.earlyCalls++;
    this.events.emit('earlyCall', { gold: bonus });
    this.startWave();
    return true;
  }

  moveHero(x: number, z: number): void {
    const h = this.hero;
    if (!h || h.dead) return;
    const lim = 6.4;
    h.tx = Math.max(-lim, Math.min(lim, x));
    h.tz = Math.max(-lim, Math.min(lim, z));
  }

  heroAbilityReady(): boolean {
    return !!this.hero && !this.hero.dead && this.hero.abilityCd <= 0 && this.state === 'playing';
  }

  useHeroAbility(): boolean {
    const h = this.hero;
    if (!h || !this.heroAbilityReady()) return false;
    const ab = h.def.ability;
    const power = 1 + this.config.meta.heroPower;
    let cx = h.x;
    let cz = h.z;
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
    h.abilityCd = ab.cooldown;
    this.stats.heroAbilityUses++;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if ((e.x - cx) ** 2 + (e.z - cz) ** 2 > ab.radius ** 2) continue;
      this.damage(e, ab.damage * power, h.def.damageType);
      if (ab.kind === 'taunt' && e.alive) e.stunTimer = Math.max(e.stunTimer, e.def.boss ? ab.duration * 0.4 : ab.duration);
    }
    this.events.emit('heroAbility', { hero: h, x: cx, z: cz, radius: ab.radius });
    return true;
  }

  summonReinforcements(): boolean {
    if (this.reinforcementsUsed || this.state !== 'playing') return false;
    this.reinforcementsUsed = true;
    // Stand on the path halfway between spawn and castle of the busiest path.
    const p = this.map.pointAt(0, this.map.paths[0].length * 0.62, this.tmp);
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
    this.reviveUsed = true;
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
    this.updateSpawns();
    this.updateWaveTimer(dt);
    this.updateEnemies(dt);
    if (this.state !== 'playing') return;
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateHero(dt);
    this.updateAlly(dt);
    this.checkWaves();
  }

  private defaultHeroPosition(): { x: number; z: number } {
    const p = this.map.paths[0];
    const pt = this.map.pointAt(0, p.length * 0.55, this.tmp);
    return { x: pt.x + pt.dz * 0.9, z: pt.z - pt.dx * 0.9 };
  }

  private startWave(): void {
    const n = this.waveIndex;
    const wave = this.waveDef(n);
    if (!wave) return;
    this.waveIndex++;
    this.nextWaveTimer = -1;
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
      this.spawnEnemy(s.enemy, s.path, 0, s.wave, s.hpMult, s.goldMult);
      if (!this.spawnQueue.some((q) => q.wave === s.wave)) this.waveSpawnDone.set(s.wave, true);
    }
  }

  private updateWaveTimer(dt: number): void {
    if (this.waveIndex >= this.totalWaves) return;
    const lastWave = this.waveIndex - 1;
    if (this.nextWaveTimer < 0) {
      if (this.waveSpawnDone.get(lastWave)) this.nextWaveTimer = RUN_ECONOMY.waveGap;
      return;
    }
    this.nextWaveTimer -= dt;
    // Accelerate when the field is empty so players never wait idle.
    if (this.aliveCount() === 0) this.nextWaveTimer -= dt * 2;
    if (this.nextWaveTimer <= 0) this.startWave();
  }

  spawnEnemy(id: EnemyId, path: number, dist: number, wave: number, hpMult: number, goldMult = 1): Enemy {
    const def = ENEMIES[id];
    let e = this.enemies.find((o) => !o.alive && o.flash <= -1);
    if (!e) {
      e = {} as Enemy;
      this.enemies.push(e);
    }
    const hp = def.hp * hpMult;
    Object.assign(e, {
      id: this.nextId++, def, alive: true, hp, maxHp: hp, path, dist, lane: this.rng.range(-0.22, 0.22),
      x: 0, y: def.flying ? ENEMY_RULES.flyHeight : 0, z: 0, dirX: 1, dirZ: 0,
      slowFactor: 1, slowTimer: 0, stunTimer: 0, shred: 0, shredTimer: 0, flash: 0, shielded: 0,
      abilityTimer: def.heal ? def.heal.interval * this.rng.range(0.5, 1) : 0,
      summonTimer: def.boss?.summonInterval ?? 0,
      chargeTimer: def.boss?.chargeInterval ?? 0,
      immuneTimer: 0, immuneIdx: 0, wave, bountyMult: goldMult, armorBonus: this.extraArmor, speedMult: this.speedMult, frozen: false,
      phase: this.rng.next() * Math.PI * 2,
    } satisfies Partial<Enemy>);
    this.placeEnemy(e);
    this.events.emit('enemySpawn', e);
    return e;
  }

  private placeEnemy(e: Enemy): void {
    const p = this.map.pointAt(e.path, e.dist, this.tmp);
    e.x = p.x - p.dz * e.lane;
    e.z = p.z + p.dx * e.lane;
    e.dirX = p.dx;
    e.dirZ = p.dz;
  }

  private updateEnemies(dt: number): void {
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
      const def = e.def;

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
              const m = this.spawnEnemy(b.summonId, e.path, Math.max(0, e.dist - 0.4 - i * 0.35), e.wave, e.maxHp / def.hp * 0.25 + 0.5, e.bountyMult);
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
      if (e.stunTimer > 0) {
        e.stunTimer -= dt;
        e.frozen = true;
      } else {
        const speed = def.speed * e.speedMult * e.slowFactor * chargeMult;
        e.dist += speed * dt;
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
    this.stats.leaks++;
    const dmg = e.def.leakDamage;
    this.castleHp = Math.max(0, this.castleHp - dmg);
    this.events.emit('enemyLeak', { enemy: e, damage: dmg });
    this.events.emit('castleHit', { damage: dmg, hp: this.castleHp });
    this.decWave(e.wave);
    if (this.castleHp <= 0) {
      if (this.config.reviveAvailable && !this.reviveUsed && !this.endless) {
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
        const gold = Math.round((RUN_ECONOMY.waveClearBase + RUN_ECONOMY.waveClearPerWave * w) * this.waveGoldMult);
        this.addGold(gold);
        this.events.emit('waveCleared', { index: w, gold });
        if (this.endless && (w + 1) % ENDLESS.milestoneEvery === 0) this.events.emit('milestone', { wave: w + 1 });
      }
    }
    if (!this.endless && this.waveIndex >= this.totalWaves && this.spawnQueue.length === 0 && this.aliveCount() === 0 && this.castleHp > 0) {
      this.state = 'won';
      this.events.emit('victory', { stars: this.stars() });
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
    let resist = type === 'physical' ? e.def.armor + e.armorBonus - e.shred : e.def.magicResist;
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
    e.flash = 0.6; // death animation timer (counts down to -1 before reuse)
    const bounty = reward ? Math.round(e.def.bounty * e.bountyMult) : 0;
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
      if (!e.alive) continue;
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
    for (const t of this.towers) {
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const st = t.stats;
      const air = t.def.hitsAir;
      const ground = t.def.hitsGround;
      if (st.aura) {
        let hit = false;
        for (const e of this.enemies) {
          if (!e.alive || (e.x - t.x) ** 2 + (e.z - t.z) ** 2 > st.range * st.range) continue;
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
    const kind: ProjectileKind = t.def.id === 'cannon' ? 'cannon' : t.def.id === 'frost' ? 'frost' : 'arrow';
    this.launch(kind, t.x, 1.25 + t.tier * 0.12, t.z, target, st.projectileSpeed, st.damage, t.def.damageType, st.splash, t.id, {
      slowFactor: st.slowFactor, slowDuration: st.slowDuration, stun: st.stun, freezeChance: st.freezeChance, shred: st.shred,
      hitsAir: t.def.hitsAir, hitsGround: t.def.hitsGround,
    });
  }

  private launch(
    kind: ProjectileKind, x: number, y: number, z: number, target: Enemy, speed: number, damage: number, type: DamageType, splash: number, towerId: number,
    extra: Partial<Projectile>,
  ): void {
    const p = this.allocProjectile();
    const arc = kind === 'cannon';
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
      towerId, arc, ...extra,
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
      const wasAlive = e.alive;
      this.damage(e, dmg, p.damageType);
      if (wasAlive && !e.alive && tower) tower.kills++;
    };
    if (p.splash > 0) {
      this.events.emit('splash', { x: p.x, z: p.z, radius: p.splash, kind: p.kind });
      const r2 = p.splash * p.splash;
      for (const e of this.enemies) {
        if (!e.alive) continue;
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

  private applySlow(e: Enemy, factor: number, duration: number): void {
    const f = e.def.boss ? 1 - (1 - factor) * 0.5 : factor;
    if (f <= e.slowFactor || e.slowTimer <= 0) {
      e.slowFactor = Math.min(e.slowTimer > 0 ? e.slowFactor : 1, f);
      e.slowTimer = Math.max(e.slowTimer, duration);
    }
  }

  private updateHero(dt: number): void {
    const h = this.hero;
    if (!h) return;
    h.attackAnim = Math.max(0, h.attackAnim - dt);
    if (h.dead) {
      h.respawn -= dt;
      if (h.respawn <= 0) {
        h.dead = false;
        h.hp = h.maxHp;
        const p = this.defaultHeroPosition();
        h.x = h.tx = p.x;
        h.z = h.tz = p.z;
        this.events.emit('heroRespawn', h);
      }
      return;
    }
    if (h.abilityCd > 0 && this.state === 'playing') h.abilityCd -= dt;
    const dx = h.tx - h.x, dz = h.tz - h.z;
    const d = Math.hypot(dx, dz);
    h.moving = d > 0.05;
    if (h.moving) {
      const step = Math.min(d, h.def.speed * dt);
      h.x += (dx / d) * step;
      h.z += (dz / d) * step;
      h.facing = Math.atan2(dx, dz);
    }
    if (this.state !== 'playing') return;

    // Contact damage from adjacent ground enemies.
    let contact = false;
    for (const e of this.enemies) {
      if (!e.alive || e.def.flying) continue;
      if ((e.x - h.x) ** 2 + (e.z - h.z) ** 2 < 0.55 * 0.55) {
        contact = true;
        h.hp -= (e.def.boss ? ENEMY_RULES.bossContactDps : ENEMY_RULES.contactDps) * dt;
      }
    }
    if (contact) h.contactTimer = 2;
    else if ((h.contactTimer -= dt) <= 0) h.hp = Math.min(h.maxHp, h.hp + h.def.regen * dt);
    if (h.hp <= 0) {
      h.dead = true;
      h.respawn = h.def.respawnTime;
      this.events.emit('heroDeath', h);
      return;
    }

    h.cooldown -= dt;
    if (h.cooldown > 0) return;
    const target = this.findTarget(h.x, h.z, h.def.range, h.def.hitsAir, true, 'closest');
    if (!target) return;
    h.cooldown = h.def.cooldown;
    h.attackAnim = 0.25;
    if (!h.moving) h.facing = Math.atan2(target.x - h.x, target.z - h.z);
    this.events.emit('heroAttack', { hero: h, target });
    if (h.def.range <= 1.5) {
      this.damage(target, h.damage, h.def.damageType);
    } else {
      this.launch(h.def.damageType === 'magic' ? 'heroBolt' : 'heroArrow', h.x, 0.8, h.z, target, 14, h.damage, h.def.damageType, 0, -1, {});
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
    const scale = this.config.level.kind === 'campaign' ? CHAPTERS[this.config.level.chapter].hpMult : 1.5;
    this.launch('champion', a.x, 1.0, a.z, target, 16, REINFORCEMENT.damage * scale, 'magic', REINFORCEMENT.splash, -2, {});
  }
}
