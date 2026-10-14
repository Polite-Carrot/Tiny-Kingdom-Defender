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
    return {
      towerLevels: { ...this.d.towerLevels },
      castleHpBonus: this.d.meta.castleHp * META_UPGRADES.castleHp.perLevel,
      goldBonus: this.d.meta.warChest * META_UPGRADES.warChest.perLevel,
      heroPower: this.d.meta.heroPower * META_UPGRADES.heroPower.perLevel,
      battlements: this.d.meta.battlements ?? 0,
      heroId: this.d.selectedHero,
      heroLevel: this.heroLevel(this.d.selectedHero),
    };
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
    const coins = waveCoins(waveIndex);
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
    return TREASURY.coinsPerHour + TREASURY.coinsPerHourPerWave * this.bestWave();
  }

  treasuryAmount(now = Date.now()): number {
    const hours = Math.min(TREASURY.capHours, Math.max(0, (now - this.d.treasury.lastCollect) / 3600000));
    return Math.floor(this.treasuryRate() * hours);
  }

  treasuryFull(now = Date.now()): boolean {
    return (now - this.d.treasury.lastCollect) / 3600000 >= TREASURY.capHours;
  }

  collectTreasury(doubled: boolean): number {
    const amt = this.treasuryAmount() * (doubled ? 2 : 1);
    this.d.treasury.lastCollect = Date.now();
    this.earn(amt, doubled ? 'treasury_doubled' : 'treasury');
    return amt;
  }

  // --- Chests ---------------------------------------------------------------------

  freeChestReady(now = Date.now()): boolean {
    return now >= this.d.chest.nextFree;
  }

  freeChestRemaining(now = Date.now()): number {
    return Math.max(0, this.d.chest.nextFree - now);
  }

  private rollChest(kind: ChestReward['kind']): ChestReward {
    const c = CHESTS[kind];
    const rng = new Random(Date.now() & 0xffffffff);
    return { kind, coins: rng.int(c.coinsMin, c.coinsMax), shards: rng.int(c.shardsMin, c.shardsMax) };
  }

  private grantChest(r: ChestReward): ChestReward {
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

  notifications(): { treasury: boolean; chest: boolean; missions: boolean; upgrades: boolean; daily: boolean } {
    return {
      treasury: this.featureUnlocked('treasury') && this.treasuryAmount() >= TREASURY.minCollect,
      chest: this.featureUnlocked('chests') && (this.freeChestReady() || this.d.chest.pendingMilestone > 0),
      missions: this.featureUnlocked('missions') && this.missions().some((m) => m.done && !m.claimed),
      upgrades: this.featureUnlocked('shop') && this.hasAffordableUpgrade(),
      daily: this.featureUnlocked('dailyLogin') && this.dailyStatus().available,
    };
  }
}
