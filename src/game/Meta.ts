// Meta progression: coins, upgrades, unlocks, treasury, chests, daily login, missions.
// All mutations go through here so analytics and saving stay consistent.

import type { SaveSystem, SaveData } from '../core/Save';
import type { Analytics } from '../analytics/Analytics';
import {
  metaCost, TOWER_META, META_UPGRADES, UNLOCKS, LEVEL_REWARDS, TREASURY, CHESTS, DAILY_LOGIN, AD_REWARDS, HERO_UNLOCK_COST,
  COSMETICS, ENDLESS,
} from '../data/economy';
import { MISSION_POOL, MISSIONS_PER_DAY, type MissionDef, type MissionStat } from '../data/missions';
import { TOTAL_LEVELS, TOWER_UNLOCK_LEVEL, FEATURE_UNLOCK_LEVEL, WEEKLY } from '../data/levels';
import { HEROES, type HeroId } from '../data/heroes';
import type { TowerId } from '../data/towers';
import { Random, hashString } from '../core/Random';
import { levelId } from './Levels';
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

  /** Number of campaign levels won (contiguous from the start). */
  levelsCompleted(): number {
    let n = 0;
    while (n < TOTAL_LEVELS && (this.d.levels[levelId(n)]?.wins ?? 0) > 0) n++;
    return n;
  }

  isLevelUnlocked(i: number): boolean {
    return i === 0 || (this.d.levels[levelId(i - 1)]?.wins ?? 0) > 0;
  }

  stars(i: number): number {
    return this.d.levels[levelId(i)]?.stars ?? 0;
  }

  totalStars(): number {
    return Object.values(this.d.levels).reduce((a, l) => a + l.stars, 0);
  }

  featureUnlocked(f: keyof typeof FEATURE_UNLOCK_LEVEL): boolean {
    return this.levelsCompleted() >= FEATURE_UNLOCK_LEVEL[f];
  }

  /** Towers usable in a given campaign level (onboarding gating + purchases). */
  towersFor(globalIndex: number): TowerId[] {
    return (['archer', 'cannon', 'frost', 'lightning'] as TowerId[]).filter((t) => {
      if (t === 'lightning' && !this.d.unlocks.lightning) return false;
      return TOWER_UNLOCK_LEVEL[t] <= globalIndex;
    });
  }

  metaBonuses(): MetaBonuses {
    return {
      towerLevels: { ...this.d.towerLevels },
      castleHpBonus: this.d.meta.castleHp * META_UPGRADES.castleHp.perLevel,
      startGoldBonus: this.d.meta.startGold * META_UPGRADES.startGold.perLevel,
      heroPower: this.d.meta.heroPower * META_UPGRADES.heroPower.perLevel,
      heroId: this.featureUnlocked('hero') ? this.d.selectedHero : null,
    };
  }

  /** Coins for finishing a campaign level. Star bonus only for new stars. */
  levelReward(globalIndex: number, won: boolean, stars: number): { base: number; starBonus: number; total: number } {
    const winAmount = Math.round(LEVEL_REWARDS.winBase + LEVEL_REWARDS.winPerLevel * globalIndex);
    if (!won) {
      const base = Math.round(winAmount * LEVEL_REWARDS.lossFraction);
      return { base, starBonus: 0, total: base };
    }
    const prev = this.stars(globalIndex);
    const starBonus = Math.max(0, stars - prev) * LEVEL_REWARDS.perStar;
    return { base: winAmount, starBonus, total: winAmount + starBonus };
  }

  /** Records a campaign result. Returns whether a milestone chest was earned. */
  recordLevel(globalIndex: number, won: boolean, stars: number, hpFrac: number): { milestoneChest: boolean; firstClear: boolean } {
    const id = levelId(globalIndex);
    const rec = (this.d.levels[id] ??= { stars: 0, wins: 0, plays: 0, bestHp: 0 });
    const firstClear = won && rec.wins === 0;
    rec.plays++;
    if (won) {
      rec.wins++;
      rec.stars = Math.max(rec.stars, stars);
      rec.bestHp = Math.max(rec.bestHp, hpFrac);
      this.d.stats.wins++;
    } else this.d.stats.losses++;
    let milestoneChest = false;
    if (firstClear && (globalIndex + 1) % LEVEL_REWARDS.chapterChestLevelInterval === 0) {
      this.d.chest.pendingMilestone++;
      milestoneChest = true;
    }
    this.commit();
    return { milestoneChest, firstClear };
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
    return !this.d.unlocks.lightning && this.levelsCompleted() >= UNLOCKS.lightning.requiresLevel;
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
    for (const t of ['archer', 'cannon', 'frost', 'lightning'] as TowerId[]) {
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
    return TREASURY.coinsPerHour + TREASURY.coinsPerHourPerLevel * this.levelsCompleted();
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

  // --- Endless / weekly -----------------------------------------------------------

  endlessMilestoneCoins(milestone: number): number {
    return ENDLESS.milestoneBase + milestone * ENDLESS.milestoneGrowth;
  }

  recordEndless(wave: number): boolean {
    const best = wave > this.d.endless.bestWave;
    if (best) this.d.endless.bestWave = wave;
    this.commit();
    return best;
  }

  weeklyReward(week: string, won: boolean, stars: number): { coins: number; shards: number } {
    if (this.d.weekly.week !== week) this.d.weekly = { week, cleared: false, bestStars: 0 };
    let coins = 0;
    let shards = 0;
    if (won && !this.d.weekly.cleared) {
      coins = WEEKLY.rewardCoins;
      shards = WEEKLY.rewardShards;
      this.d.weekly.cleared = true;
      this.d.shards += shards;
    } else if (!won) {
      coins = Math.round(WEEKLY.rewardCoins * LEVEL_REWARDS.lossFraction * 0.5);
    }
    this.d.weekly.bestStars = Math.max(this.d.weekly.bestStars, won ? stars : 0);
    this.earn(coins, 'weekly');
    this.commit();
    return { coins, shards };
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
