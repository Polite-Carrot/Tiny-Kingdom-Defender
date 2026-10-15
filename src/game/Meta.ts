// Meta progression: coins, upgrades, unlocks, treasury, chests, daily login, missions.
// All mutations go through here so analytics and saving stay consistent.

import type { SaveSystem, SaveData } from '../core/Save';
import type { Analytics } from '../analytics/Analytics';
import {
  metaCost, TOWER_META, META_UPGRADES, CASTLE_GROWTH, UNLOCKS, TREASURY, CHESTS, DAILY_LOGIN, AD_REWARDS, HERO_UNLOCK_COST, COSMETICS,
} from '../data/economy';
import { MISSION_POOL, MISSIONS_PER_DAY, type MissionDef, type MissionStat } from '../data/missions';
import { TOWER_UNLOCK_WAVE, UNLOCK_WAVE } from '../data/base';
import { HEROES, heroLevelFor, gearTierFor, type HeroId } from '../data/heroes';
import { ACHIEVEMENTS, type AchievementDef } from '../data/achievements';
import type { EnemyId } from '../data/enemies';
import { TOWER_ORDER, type TowerId } from '../data/towers';
import { Random, hashString } from '../core/Random';
import { checkpointCoins, waveCoins } from './Siege';
import type { MetaBonuses } from './Run';
import { MASTERY, masteryLevelFor, masteryXpFor } from '../data/mastery';
import { BUILDINGS, BUILDING_BY_ID, KINGDOM_BONUS, type BuildingId } from '../data/kingdom';
import { CHALLENGE, TWISTS, TWIST_CLASH, type ChallengeDef, type TwistId } from '../data/challenge';
import { MAP_BY_ID, type MapId } from '../data/maps';

export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(new Date(y, m - 1, d).getTime() / 86400000);
}

export interface ChestReward {
  coins: number;
  shards: number;
  kind: 'free' | 'milestone' | 'daily';
}

export type MetaUpgradeKey = keyof typeof META_UPGRADES;

export class Meta {
  constructor(private save: SaveSystem, private analytics: Analytics) {}

  get d(): SaveData {
    return this.save.data;
  }

  commit(): void {
    this.save.save();
  }

  // --- Coins --------------------------------------------------------------------

  earn(amount: number, source: string): void {
    if (amount <= 0) return;
    this.d.coins += amount;
    this.d.stats.coinsEarned += amount;
    this.analytics.track('coins_earned', { amount, source, balance: this.d.coins });
    this.commit();
  }

  spend(amount: number, sink: string): boolean {
    if (amount > this.d.coins) return false;
    this.d.coins -= amount;
    this.analytics.track('coins_spent', { amount, sink, balance: this.d.coins });
    this.commit();
    return true;
  }

  // --- Progress -------------------------------------------------------------------

  /** Highest number of waves ever cleared. */
  bestWave(): number {
    return this.d.progress.bestWave;
  }

  featureUnlocked(f: keyof typeof UNLOCK_WAVE): boolean {
    return this.bestWave() >= UNLOCK_WAVE[f];
  }

  /** Tower types usable now (unlock waves + Lightning purchase). */
  towersAvailable(): TowerId[] {
    return TOWER_ORDER.filter((t) => {
      if (t === 'lightning' && !this.d.unlocks.lightning) return false;
      return TOWER_UNLOCK_WAVE[t] <= this.bestWave();
    });
  }

  metaBonuses(): MetaBonuses {
    const has = (b: BuildingId) => this.hasBuilding(b);
    const mastery: Partial<Record<TowerId, number>> = {};
    for (const t of TOWER_ORDER) mastery[t] = this.masteryLevel(t);
    return {
      towerLevels: { ...this.d.towerLevels },
      castleHpBonus: this.d.meta.castleHp * META_UPGRADES.castleHp.perLevel + (has('chapel') ? KINGDOM_BONUS.chapelHp : 0),
      goldBonus: this.d.meta.warChest * META_UPGRADES.warChest.perLevel + (has('market') ? KINGDOM_BONUS.marketGold : 0),
      heroPower: this.d.meta.heroPower * META_UPGRADES.heroPower.perLevel + (has('wizard') ? KINGDOM_BONUS.wizardHero : 0),
      battlements: this.d.meta.battlements ?? 0,
      heroId: this.d.selectedHero,
      heroLevel: this.heroLevel(this.d.selectedHero),
      mastery,
      towerDamage: has('blacksmith') ? KINGDOM_BONUS.blacksmithDamage : 0,
      barricadeHp: has('barracks') ? 1 + KINGDOM_BONUS.barracksHp : 1,
    };
  }

  // --- Realms (maps) ---------------------------------------------------------------

  mapId(): MapId {
    return this.d.realms.current;
  }

  mapUnlocked(id: MapId): boolean {
    return this.bestWave() >= MAP_BY_ID[id].unlockWave;
  }

  /** Best wave reached in a realm. */
  mapBest(id: MapId): number {
    // Saves from before realms existed: Kingdom Vale's best is the overall best.
    return this.d.realms.best[id] ?? (id === 'vale' ? this.bestWave() : 0);
  }

  /** The saved siege of a realm (null if never founded). */
  mapBase(id: MapId): SaveData['base'] {
    return id === this.mapId() ? this.d.base : this.d.realms.saved[id]?.base ?? null;
  }

  /** Moves to another realm: the current one's siege is set aside, the other's comes back. */
  switchMap(id: MapId): boolean {
    if (!MAP_BY_ID[id] || !this.mapUnlocked(id)) return false;
    const r = this.d.realms;
    if (r.current === id) return true;
    r.best.vale ??= this.bestWave();
    const p = this.d.progress;
    r.saved[r.current] = { base: this.d.base, checkpointsPaid: p.checkpointsPaid, frontierSeen: p.frontierSeen };
    const next = r.saved[id] ?? { base: null, checkpointsPaid: 0, frontierSeen: 0 };
    delete r.saved[id];
    this.d.base = next.base;
    p.checkpointsPaid = next.checkpointsPaid;
    p.frontierSeen = next.frontierSeen;
    r.current = id;
    this.analytics.track('map_selected', { map: id });
    this.commit();
    return true;
  }

  // --- Tower mastery --------------------------------------------------------------

  masteryXp(t: TowerId): number {
    return this.d.mastery[t] ?? 0;
  }

  masteryLevel(t: TowerId): number {
    return masteryLevelFor(this.masteryXp(t));
  }

  /** Progress towards the next mastery level: [xp into this level, xp the level needs]. */
  masteryProgress(t: TowerId): [number, number] {
    const l = this.masteryLevel(t);
    if (l >= MASTERY.maxLevel) return [1, 1];
    const a = masteryXpFor(l), b = masteryXpFor(l + 1);
    return [this.masteryXp(t) - a, b - a];
  }

  /** Adds mastery XP; returns the new level if it went up. */
  addMasteryXp(t: TowerId, xp: number): number | null {
    if (xp <= 0) return null;
    const before = this.masteryLevel(t);
    this.d.mastery[t] = this.masteryXp(t) + xp;
    const after = this.masteryLevel(t);
    return after > before ? after : null;
  }

  // --- Kingdom buildings -----------------------------------------------------------

  hasBuilding(id: BuildingId): boolean {
    return this.d.buildings.includes(id);
  }

  buildingUnlocked(id: BuildingId): boolean {
    return this.bestWave() >= BUILDING_BY_ID[id].unlockWave;
  }

  buyBuilding(id: BuildingId): boolean {
    const def = BUILDING_BY_ID[id];
    if (!def || this.hasBuilding(id) || !this.buildingUnlocked(id) || !this.spend(def.cost, `building_${id}`)) return false;
    this.d.buildings.push(id);
    this.analytics.track('upgrade_purchased', { upgrade: `building_${id}`, level: 1, cost: def.cost });
    this.commit();
    return true;
  }

  /** A building that can be bought right now. */
  affordableBuilding(): BuildingId | null {
    return BUILDINGS.find((b) => !this.hasBuilding(b.id) && this.buildingUnlocked(b.id) && this.d.coins >= b.cost)?.id ?? null;
  }

  // --- Daily Challenge -------------------------------------------------------------

  /** Today's challenge: the same for everyone, picked from the date. */
  challengeFor(now = new Date()): ChallengeDef {
    const day = dayKey(now);
    const seed = hashString(`challenge-${day}`);
    const rng = new Random(seed);
    const startWave = rng.pick(CHALLENGE.startWaves);
    const ids = Object.keys(TWISTS) as TwistId[];
    const twists: TwistId[] = [];
    for (let guard = 0; twists.length < CHALLENGE.twistsPerDay && guard < 50; guard++) {
      const t = rng.pick(ids);
      if (twists.includes(t)) continue;
      if (TWIST_CLASH.some(([a, b]) => (a === t && twists.includes(b)) || (b === t && twists.includes(a)))) continue;
      twists.push(t);
    }
    let towers: TowerId[] | null = null;
    if (twists.includes('arsenal')) {
      const pool = [...CHALLENGE.arsenalPool];
      towers = [];
      while (towers.length < 3) towers.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
      towers.sort((a, b) => TOWER_ORDER.indexOf(a) - TOWER_ORDER.indexOf(b));
    }
    let gold = CHALLENGE.gold[startWave] ?? 2000;
    if (twists.includes('thrifty')) gold *= 0.65;
    return { day, seed, startWave, gold: Math.round(gold / 10) * 10, twists, towers };
  }

  /** Today's challenge state (resets each day). */
  challengeState(now = new Date()): SaveData['challenge'] {
    const day = dayKey(now);
    if (this.d.challenge.day !== day) this.d.challenge = { ...this.d.challenge, day, attempted: false, done: false, score: 0 };
    return this.d.challenge;
  }

  startChallenge(): void {
    const st = this.challengeState();
    st.attempted = true;
    st.done = false;
    st.score = 0;
    this.analytics.track('level_start', { level: 'daily_challenge', wave: this.challengeFor().startWave + 1 });
    this.commit();
  }

  /** Waves survived so far in today's attempt (saved as it goes, in case the game is closed). */
  challengeProgress(score: number): void {
    const st = this.challengeState();
    st.score = Math.max(st.score, score);
    this.commit();
  }

  /** Ends today's attempt: pays coins, and a chest for a new personal best. */
  finishChallenge(score: number): { coins: number; newBest: boolean; prevBest: number; chest: ChestReward | null } {
    return this.settleChallenge(this.challengeState(), score);
  }

  private settleChallenge(st: SaveData['challenge'], score: number): { coins: number; newBest: boolean; prevBest: number; chest: ChestReward | null } {
    if (st.done) return { coins: 0, newBest: false, prevBest: st.best, chest: null };
    st.done = true;
    st.score = Math.max(st.score, score);
    const prevBest = st.best;
    const newBest = st.score > prevBest;
    if (newBest) st.best = st.score;
    st.history = [...st.history.filter((h) => h.day !== st.day), { day: st.day, score: st.score }].slice(-14);
    const coins = st.score * CHALLENGE.coinsPerWave;
    this.earn(coins, 'daily_challenge');
    const chest = newBest && st.score > 0 ? this.grantChest(this.rollChest('daily')) : null;
    this.analytics.track('level_end', { level: 'daily_challenge', result: 'end', wave_reached: st.score, duration: 0, castle_hp: 0, new_best: newBest });
    this.commit();
    return { coins, newBest, prevBest, chest };
  }

  /** The attempt was started but never finished (the game was closed mid-challenge). */
  settleAbandonedChallenge(): ReturnType<Meta['finishChallenge']> | null {
    // Read the stored state directly: it may be from an earlier day.
    const st = this.d.challenge;
    if (!st.attempted || st.done) return null;
    return this.settleChallenge(st, st.score);
  }

  // --- Welcome back ----------------------------------------------------------------

  /** What happened while the player was away, and what to do next (null if barely away). */
  welcomeBack(now = Date.now()): { awayMs: number; treasury: number; chestReady: boolean; daily: boolean; challenge: boolean; towerUpgrades: number; building: string | null; goal: string } | null {
    const awayMs = now - (this.d.lastSeen || now);
    if (awayMs < 30 * 60000 || !this.d.base || !this.featureUnlocked('treasury')) return null;
    const towerUpgrades = this.towersAvailable().filter((t) => {
      const c = this.towerUpgradeCost(t);
      return c !== null && c <= this.d.coins;
    }).length;
    const b = this.featureUnlocked('kingdom') ? this.affordableBuilding() : null;
    return {
      awayMs,
      treasury: this.treasuryAmount(now),
      chestReady: this.featureUnlocked('chests') && (this.freeChestReady(now) || this.d.chest.pendingMilestone > 0),
      daily: this.featureUnlocked('dailyLogin') && this.dailyStatus().available,
      challenge: this.featureUnlocked('challenge') && !this.challengeState().attempted,
      towerUpgrades,
      building: b ? BUILDING_BY_ID[b].name : null,
      goal: this.nextGoal(),
    };
  }

  /** One concrete thing to aim for next. */
  nextGoal(): string {
    const best = this.bestWave();
    const nextCp = (Math.floor(best / 10) + 1) * 10;
    const nextBuilding = BUILDINGS.find((b) => !this.hasBuilding(b.id));
    if (nextBuilding && !this.buildingUnlocked(nextBuilding.id)) return `Reach wave ${nextBuilding.unlockWave} to build the ${nextBuilding.name} (${nextBuilding.description.toLowerCase()})`;
    if (nextBuilding && this.d.coins < nextBuilding.cost) return `Save ${nextBuilding.cost - this.d.coins} more coins to build the ${nextBuilding.name}`;
    // The tower type closest to its next mastery level.
    let bestT: TowerId | null = null;
    let bestLeft = Infinity;
    for (const t of this.towersAvailable()) {
      if (this.masteryLevel(t) >= MASTERY.maxLevel) continue;
      const [have, need] = this.masteryProgress(t);
      if (need - have < bestLeft) {
        bestLeft = need - have;
        bestT = t;
      }
    }
    if (bestT && bestLeft < 150) return `${bestLeft} more kills with ${bestT[0].toUpperCase() + bestT.slice(1)} towers for mastery ${this.masteryLevel(bestT) + 1}`;
    return `Reach checkpoint wave ${nextCp} for a milestone chest`;
  }

  markSeen(now = Date.now()): void {
    this.d.lastSeen = now;
  }

  /** Unlocks and pays every achievement whose target is now met. Returns the new ones. */
  checkAchievements(): AchievementDef[] {
    const fresh = ACHIEVEMENTS.filter((a) => !this.d.achievements.includes(a.id) && a.progress(this.d) >= a.target);
    for (const a of fresh) {
      this.d.achievements.push(a.id);
      this.earn(a.reward.coins, `achievement_${a.id}`);
      if (a.reward.gems) this.d.shards += a.reward.gems;
      this.analytics.track('achievement_unlocked', { id: a.id });
    }
    if (fresh.length) this.commit();
    return fresh;
  }

  /** Bestiary bookkeeping; returns true the first time an enemy is seen. */
  sawEnemy(id: EnemyId): boolean {
    const e = (this.d.bestiary[id] ??= { seen: 0, killed: 0 });
    e.seen++;
    return e.seen === 1;
  }

  killedEnemy(id: EnemyId): void {
    (this.d.bestiary[id] ??= { seen: 1, killed: 0 }).killed++;
  }

  /** How grand the castle looks (from castle wall and battlement upgrades). */
  castleTier(): number {
    const total = (this.d.meta.castleHp ?? 0) + (this.d.meta.battlements ?? 0);
    return Math.min(CASTLE_GROWTH.maxTier, Math.floor(total / CASTLE_GROWTH.levelsPerTier));
  }

  heroXp(id: HeroId): number {
    return this.d.heroXp[id] ?? 0;
  }

  heroLevel(id: HeroId): number {
    return heroLevelFor(this.heroXp(id));
  }

  /** Adds XP to a hero; reports a level-up and whether new gear arrived. */
  addHeroXp(id: HeroId, xp: number): { level: number; levelUp: boolean; newGear: boolean } {
    const before = this.heroLevel(id);
    this.d.heroXp[id] = this.heroXp(id) + Math.max(0, Math.round(xp));
    const level = this.heroLevel(id);
    return { level, levelUp: level > before, newGear: gearTierFor(level) > gearTierFor(before) };
  }

  /** A wave was cleared: pays coins, tracks the best wave. Returns coins paid. */
  recordWaveCleared(waveIndex: number): number {
    const cleared = waveIndex + 1;
    this.d.stats.wavesCleared++;
    if (cleared > this.d.progress.bestWave) this.d.progress.bestWave = cleared;
    const r = this.d.realms;
    r.best[r.current] = Math.max(r.best[r.current] ?? 0, cleared);
    const coins = Math.round(waveCoins(waveIndex) * (this.hasBuilding('windmill') ? 1 + KINGDOM_BONUS.windmillCoins : 1));
    this.d.coins += coins;
    this.d.stats.coinsEarned += coins;
    // Batched analytics: one coins_earned event per wave keeps the log readable.
    this.analytics.track('coins_earned', { amount: coins, source: 'wave_clear', balance: this.d.coins });
    return coins;
  }

  /** Reached checkpoint `wave` (a multiple of 10). First visit pays full coins and a milestone chest. */
  recordCheckpoint(wave: number): { coins: number; firstTime: boolean } {
    const firstTime = wave > this.d.progress.checkpointsPaid;
    const coins = checkpointCoins(wave, firstTime);
    if (firstTime) {
      this.d.progress.checkpointsPaid = wave;
      this.d.chest.pendingMilestone++;
    }
    this.d.progress.bestCheckpoint = Math.max(this.d.progress.bestCheckpoint, wave);
    this.earn(coins, firstTime ? 'checkpoint' : 'checkpoint_repeat');
    return { coins, firstTime };
  }

  // --- Upgrades -------------------------------------------------------------------

  towerUpgradeCost(t: TowerId): number | null {
    const lvl = this.d.towerLevels[t];
    return lvl >= TOWER_META.maxLevel ? null : metaCost(TOWER_META.baseCost, lvl);
  }

  buyTowerUpgrade(t: TowerId): boolean {
    const cost = this.towerUpgradeCost(t);
    if (cost === null || !this.spend(cost, `tower_${t}`)) return false;
    this.d.towerLevels[t]++;
    this.analytics.track('upgrade_purchased', { upgrade: `tower_${t}`, level: this.d.towerLevels[t], cost });
    this.commit();
    return true;
  }

  metaUpgradeCost(k: MetaUpgradeKey): number | null {
    const def = META_UPGRADES[k];
    const lvl = this.d.meta[k];
    return lvl >= def.maxLevel ? null : metaCost(def.baseCost, lvl);
  }

  buyMetaUpgrade(k: MetaUpgradeKey): boolean {
    const cost = this.metaUpgradeCost(k);
    if (cost === null || !this.spend(cost, `meta_${k}`)) return false;
    this.d.meta[k]++;
    this.analytics.track('upgrade_purchased', { upgrade: k, level: this.d.meta[k], cost });
    this.commit();
    return true;
  }

  canUnlockLightning(): boolean {
    return !this.d.unlocks.lightning && this.bestWave() >= UNLOCKS.lightning.requiresWave;
  }

  unlockLightning(): boolean {
    if (!this.canUnlockLightning() || !this.spend(UNLOCKS.lightning.cost, 'unlock_lightning')) return false;
    this.d.unlocks.lightning = true;
    this.analytics.track('upgrade_purchased', { upgrade: 'unlock_lightning', level: 1, cost: UNLOCKS.lightning.cost });
    this.commit();
    return true;
  }

  unlockHero(id: HeroId): boolean {
    if (this.d.unlocks.heroes.includes(id)) return false;
    const cost = HERO_UNLOCK_COST[id] ?? 0;
    if (!this.spend(cost, `hero_${id}`)) return false;
    this.d.unlocks.heroes.push(id);
    this.d.selectedHero = id;
    this.analytics.track('upgrade_purchased', { upgrade: `hero_${id}`, level: 1, cost });
    this.commit();
    return true;
  }

  selectHero(id: HeroId): void {
    if (!this.d.unlocks.heroes.includes(id) || !HEROES[id]) return;
    this.d.selectedHero = id;
    this.commit();
  }

  buyCosmetic(id: string): boolean {
    const c = COSMETICS.find((x) => x.id === id);
    if (!c || this.d.cosmetics.owned.includes(id)) return false;
    if (c.shardCost > 0) {
      if (this.d.shards < c.shardCost) return false;
      this.d.shards -= c.shardCost;
    }
    if (c.cost > 0 && !this.spend(c.cost, `cosmetic_${id}`)) {
      if (c.shardCost > 0) this.d.shards += c.shardCost;
      return false;
    }
    this.d.cosmetics.owned.push(id);
    this.equipCosmetic(id);
    this.analytics.track('upgrade_purchased', { upgrade: `cosmetic_${id}`, level: 1, cost: c.cost });
    return true;
  }

  equipCosmetic(id: string): void {
    const c = COSMETICS.find((x) => x.id === id);
    if (!c || !this.d.cosmetics.owned.includes(id)) return;
    if (c.kind === 'castle') this.d.cosmetics.castle = id;
    else this.d.cosmetics.trail = id;
    this.commit();
  }

  castleColor(): string {
    return COSMETICS.find((c) => c.id === this.d.cosmetics.castle)?.color ?? '#d9cbb0';
  }

  trailColor(): string | null {
    return this.d.cosmetics.trail === 'trail_none' ? null : COSMETICS.find((c) => c.id === this.d.cosmetics.trail)?.color ?? null;
  }

  /** Cheapest affordable meta purchase exists (for red dots). */
  hasAffordableUpgrade(): boolean {
    const c = this.d.coins;
    for (const t of TOWER_ORDER) {
      if (t === 'lightning' && !this.d.unlocks.lightning) continue;
      const cost = this.towerUpgradeCost(t);
      if (cost !== null && cost <= c) return true;
    }
    for (const k of Object.keys(META_UPGRADES) as MetaUpgradeKey[]) {
      const cost = this.metaUpgradeCost(k);
      if (cost !== null && cost <= c) return true;
    }
    return this.canUnlockLightning() && UNLOCKS.lightning.cost <= c;
  }

  // --- Treasury -------------------------------------------------------------------

  treasuryRate(): number {
    return (TREASURY.coinsPerHour + TREASURY.coinsPerHourPerWave * this.bestWave()) * (this.hasBuilding('farm') ? 1 + KINGDOM_BONUS.farmTreasury : 1);
  }

  treasuryAmount(now = Date.now()): number {
    const hours = Math.min(TREASURY.capHours, Math.max(0, (now - this.d.treasury.lastCollect) / 3600000));
    return Math.floor(this.treasuryRate() * hours);
  }

  treasuryFull(now = Date.now()): boolean {
    return (now - this.d.treasury.lastCollect) / 3600000 >= TREASURY.capHours;
  }

  /** Collects the treasury; `mult` 2 or 3 from a rewarded ad. */
  collectTreasury(mult: boolean | number): number {
    const m = typeof mult === 'number' ? mult : mult ? 2 : 1;
    const amt = this.treasuryAmount() * m;
    this.d.treasury.lastCollect = Date.now();
    this.earn(amt, m > 1 ? `treasury_x${m}` : 'treasury');
    return amt;
  }

  // --- Chests ---------------------------------------------------------------------

  freeChestReady(now = Date.now()): boolean {
    return now >= this.d.chest.nextFree;
  }

  freeChestRemaining(now = Date.now()): number {
    return Math.max(0, this.d.chest.nextFree - now);
  }

  rollChest(kind: ChestReward['kind']): ChestReward {
    const c = CHESTS[kind];
    const rng = new Random(Date.now() & 0xffffffff);
    return { kind, coins: rng.int(c.coinsMin, c.coinsMax), shards: rng.int(c.shardsMin, c.shardsMax) };
  }

  grantChest(r: ChestReward): ChestReward {
    this.d.shards += r.shards;
    this.earn(r.coins, `chest_${r.kind}`);
    return r;
  }

  openFreeChest(skipTimer = false): ChestReward | null {
    if (!skipTimer && !this.freeChestReady()) return null;
    this.d.chest.nextFree = Date.now() + CHESTS.freeChestHours * 3600000;
    return this.grantChest(this.rollChest('free'));
  }

  openMilestoneChest(): ChestReward | null {
    if (this.d.chest.pendingMilestone <= 0) return null;
    this.d.chest.pendingMilestone--;
    return this.grantChest(this.rollChest('milestone'));
  }

  // --- Daily login ----------------------------------------------------------------

  /** Day index (0..6) of the reward available today, or null if already claimed. */
  dailyStatus(now = new Date()): { available: boolean; dayIndex: number; streak: number } {
    const today = dayKey(now);
    const last = this.d.daily.lastClaimDay;
    if (last === today) return { available: false, dayIndex: (this.d.daily.streak - 1) % 7, streak: this.d.daily.streak };
    const continues = last !== null && dayNumber(today) - dayNumber(last) === 1;
    const streak = continues ? this.d.daily.streak : 0;
    return { available: true, dayIndex: streak % 7, streak };
  }

  claimDaily(now = new Date()): { dayIndex: number; coins: number; chest: ChestReward | null } | null {
    const st = this.dailyStatus(now);
    if (!st.available) return null;
    this.d.daily.streak = st.streak + 1;
    this.d.daily.lastClaimDay = dayKey(now);
    const reward = DAILY_LOGIN[st.dayIndex];
    let coins = 0;
    let chest: ChestReward | null = null;
    if (reward.kind === 'coins') {
      coins = reward.amount;
      this.earn(coins, 'daily_login');
    } else {
      chest = this.grantChest(this.rollChest('daily'));
      coins = chest.coins;
    }
    this.analytics.track('daily_reward_claimed', { day: st.dayIndex + 1, coins, chest: !!chest });
    this.commit();
    return { dayIndex: st.dayIndex, coins, chest };
  }

  // --- Missions -------------------------------------------------------------------

  refreshMissions(now = new Date()): void {
    const today = dayKey(now);
    if (this.d.missions.day === today && this.d.missions.list.length) return;
    const rng = new Random(hashString(`missions-${today}`));
    const pool = [...MISSION_POOL];
    const picked: MissionDef[] = [];
    const usedStats = new Set<MissionStat>();
    while (picked.length < MISSIONS_PER_DAY && pool.length) {
      const i = Math.floor(rng.next() * pool.length);
      const m = pool.splice(i, 1)[0];
      if (usedStats.has(m.stat)) continue;
      usedStats.add(m.stat);
      picked.push(m);
    }
    this.d.missions = { day: today, list: picked.map((m) => ({ id: m.id, progress: 0, claimed: false })) };
    this.commit();
  }

  missions(): { def: MissionDef; progress: number; claimed: boolean; done: boolean }[] {
    return this.d.missions.list
      .map((s) => {
        const def = MISSION_POOL.find((m) => m.id === s.id);
        return def ? { def, progress: s.progress, claimed: s.claimed, done: s.progress >= def.target } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }

  addMissionProgress(stat: MissionStat, amount: number): string[] {
    if (amount <= 0) return [];
    const completed: string[] = [];
    for (const s of this.d.missions.list) {
      const def = MISSION_POOL.find((m) => m.id === s.id);
      if (!def || def.stat !== stat || s.claimed) continue;
      const before = s.progress;
      s.progress = Math.min(def.target, s.progress + amount);
      if (before < def.target && s.progress >= def.target) completed.push(def.text);
    }
    return completed;
  }

  claimMission(id: string): number {
    const s = this.d.missions.list.find((m) => m.id === id);
    const def = MISSION_POOL.find((m) => m.id === id);
    if (!s || !def || s.claimed || s.progress < def.target) return 0;
    s.claimed = true;
    this.analytics.track('mission_complete', { mission: id, reward: def.reward });
    this.earn(def.reward, 'mission');
    return def.reward;
  }

  // --- Ads-related counters -----------------------------------------------------------

  shopBundlesLeft(now = new Date()): number {
    const today = dayKey(now);
    if (this.d.ads.shopBundleDay !== today) return AD_REWARDS.shopBundlePerDay;
    return Math.max(0, AD_REWARDS.shopBundlePerDay - this.d.ads.shopBundleCount);
  }

  grantShopBundle(now = new Date()): number {
    const today = dayKey(now);
    if (this.d.ads.shopBundleDay !== today) {
      this.d.ads.shopBundleDay = today;
      this.d.ads.shopBundleCount = 0;
    }
    if (this.d.ads.shopBundleCount >= AD_REWARDS.shopBundlePerDay) return 0;
    this.d.ads.shopBundleCount++;
    this.earn(AD_REWARDS.shopBundleCoins, 'ad_shop_bundle');
    return AD_REWARDS.shopBundleCoins;
  }

  // --- Notifications (red dots) --------------------------------------------------------

  notifications(): { treasury: boolean; chest: boolean; missions: boolean; upgrades: boolean; daily: boolean; town: boolean; challenge: boolean } {
    return {
      treasury: this.featureUnlocked('treasury') && this.treasuryAmount() >= TREASURY.minCollect,
      chest: this.featureUnlocked('chests') && (this.freeChestReady() || this.d.chest.pendingMilestone > 0),
      missions: this.featureUnlocked('missions') && this.missions().some((m) => m.done && !m.claimed),
      upgrades: this.featureUnlocked('shop') && this.hasAffordableUpgrade(),
      town: this.featureUnlocked('kingdom') && !!this.affordableBuilding(),
      challenge: this.featureUnlocked('challenge') && !this.challengeState().attempted,
      daily: this.featureUnlocked('dailyLogin') && this.dailyStatus().available,
    };
  }
}
