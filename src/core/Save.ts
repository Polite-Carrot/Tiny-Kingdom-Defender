// Versioned save system with migrations and a corrupt-save fallback.

import type { TowerId } from '../data/towers';
import type { HeroId } from '../data/heroes';
import type { BaseSnapshot } from '../game/Run';

export const SAVE_VERSION = 4;
export const SAVE_KEY = 'tkd_save';
export const BACKUP_KEY = 'tkd_save_backup';
export const CORRUPT_KEY = 'tkd_save_corrupt';

export interface LevelRecord {
  stars: number;
  wins: number;
  plays: number;
  bestHp: number;
}

export interface MissionState {
  id: string;
  progress: number;
  claimed: boolean;
}

export type AdOutcomeSetting = 'completed' | 'skipped' | 'failed' | 'random';

export interface Settings {
  music: number;
  sfx: number;
  quality: 'low' | 'high';
  showFps: boolean;
  debugAdOutcome: AdOutcomeSetting;
  /** Debug: mock ads report "not ready". */
  debugAdsUnavailable: boolean;
}

export interface SaveData {
  version: number;
  coins: number;
  shards: number;
  /** The persistent kingdom (null until founded). */
  base: BaseSnapshot | null;
  progress: { bestWave: number; bestCheckpoint: number; retreats: number; checkpointsPaid: number };
  towerLevels: Record<TowerId, number>;
  meta: { castleHp: number; warChest: number; heroPower: number };
  unlocks: { lightning: boolean; heroes: HeroId[] };
  selectedHero: HeroId;
  cosmetics: { owned: string[]; castle: string; trail: string };
  settings: Settings;
  treasury: { lastCollect: number };
  chest: { nextFree: number; pendingMilestone: number };
  daily: { lastClaimDay: string | null; streak: number };
  missions: { day: string; list: MissionState[] };
  ads: { removeAds: boolean; shopBundleDay: string; shopBundleCount: number; winsSinceInterstitial: number };
  stats: { kills: number; wavesCleared: number; coinsEarned: number; playTime: number };
  tutorial: { done: boolean; hintsSeen: string[] };
  firstLaunch: number;
}

export function defaultSave(now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    coins: 0,
    shards: 0,
    base: null,
    progress: { bestWave: 0, bestCheckpoint: 0, retreats: 0, checkpointsPaid: 0 },
    towerLevels: { archer: 0, cannon: 0, frost: 0, lightning: 0, mage: 0, ballista: 0, flame: 0, alchemist: 0 },
    meta: { castleHp: 0, warChest: 0, heroPower: 0 },
    unlocks: { lightning: false, heroes: ['ranger'] },
    selectedHero: 'ranger',
    cosmetics: { owned: ['castle_default', 'trail_none'], castle: 'castle_default', trail: 'trail_none' },
    settings: { music: 0.6, sfx: 0.8, quality: 'high', showFps: false, debugAdOutcome: 'completed', debugAdsUnavailable: false },
    treasury: { lastCollect: now },
    chest: { nextFree: now, pendingMilestone: 0 },
    daily: { lastClaimDay: null, streak: 0 },
    missions: { day: '', list: [] },
    ads: { removeAds: false, shopBundleDay: '', shopBundleCount: 0, winsSinceInterstitial: 0 },
    stats: { kills: 0, wavesCleared: 0, coinsEarned: 0, playTime: 0 },
    tutorial: { done: false, hintsSeen: [] },
    firstLaunch: now,
  };
}

type AnyObj = Record<string, any>;

/** Ordered migrations: MIGRATIONS[n] upgrades a version-n save to version n+1. */
export const MIGRATIONS: Record<number, (d: AnyObj) => AnyObj> = {
  // v1 stored coins as "gold" and stars as a flat map { L1: 3 }.
  1: (d) => {
    const levels: Record<string, LevelRecord> = {};
    for (const [id, stars] of Object.entries((d.stars ?? {}) as Record<string, number>)) {
      levels[id] = { stars: Number(stars) || 0, wins: stars ? 1 : 0, plays: 1, bestHp: 0 };
    }
    const { gold, stars, ...rest } = d;
    void stars;
    return { ...rest, coins: Number(gold) || 0, levels, version: 2 };
  },
  // v2 lacked cosmetics, weekly and endless records.
  2: (d) => ({
    ...d,
    cosmetics: d.cosmetics ?? { owned: ['castle_default', 'trail_none'], castle: 'castle_default', trail: 'trail_none' },
    endless: d.endless ?? { bestWave: 0, milestonesPaid: 0 },
    weekly: d.weekly ?? { week: '', cleared: false, bestStars: 0 },
    version: 3,
  }),
  // v3 was the 60-level campaign. v4 is one persistent kingdom: campaign records are dropped
  // (players are compensated with coins per level won), "startGold" became "warChest".
  3: (d) => {
    const levels = (d.levels ?? {}) as Record<string, LevelRecord>;
    const won = Object.values(levels).filter((l) => l && l.wins > 0).length;
    const { levels: _l, endless: _e, weekly: _w, ...rest } = d;
    void _l; void _e; void _w;
    const meta = { castleHp: d.meta?.castleHp ?? 0, warChest: d.meta?.startGold ?? 0, heroPower: d.meta?.heroPower ?? 0 };
    return {
      ...rest,
      meta,
      coins: (Number(d.coins) || 0) + won * 25,
      base: null,
      progress: { bestWave: 0, bestCheckpoint: 0, retreats: 0, checkpointsPaid: 0 },
      stats: { kills: d.stats?.kills ?? 0, wavesCleared: 0, coinsEarned: d.stats?.coinsEarned ?? 0, playTime: d.stats?.playTime ?? 0 },
      tutorial: { done: false, hintsSeen: [] },
      version: 4,
    };
  },
};

/** Fills in any missing keys from defaults (shallow per top-level section). */
function withDefaults(d: AnyObj): SaveData {
  const def = defaultSave() as unknown as AnyObj;
  const out: AnyObj = { ...def };
  for (const k of Object.keys(def)) {
    const v = d[k];
    if (v === undefined || v === null) continue;
    if (typeof def[k] === 'object' && !Array.isArray(def[k]) && def[k] !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = { ...def[k], ...v };
    } else if (typeof def[k] === typeof v || (def[k] === null && typeof v === 'object')) {
      out[k] = v;
    }
  }
  out.version = SAVE_VERSION;
  return out as SaveData;
}

export function migrate(raw: AnyObj): SaveData {
  let d = raw;
  let v = typeof d.version === 'number' ? d.version : 1;
  if (v > SAVE_VERSION) throw new Error(`Save version ${v} is newer than supported ${SAVE_VERSION}`);
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`No migration from v${v}`);
    d = m(d);
    v = d.version;
  }
  return withDefaults(d);
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function memoryStorage(): StorageLike {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

export class SaveSystem {
  data: SaveData;
  /** Set when a corrupt save was detected and recovered. */
  recovered: 'none' | 'backup' | 'reset' = 'none';
  private storage: StorageLike;
  private dirty = false;

  constructor(storage?: StorageLike) {
    try {
      this.storage = storage ?? window.localStorage;
      this.storage.getItem('__probe');
    } catch {
      this.storage = memoryStorage();
    }
    this.data = this.load();
  }

  private parse(text: string | null): SaveData | null {
    if (!text) return null;
    try {
      const obj = JSON.parse(text);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
      return migrate(obj);
    } catch {
      return null;
    }
  }

  private load(): SaveData {
    const main = this.storage.getItem(SAVE_KEY);
    const parsed = this.parse(main);
    if (parsed) return parsed;
    if (main) {
      // Main save exists but is corrupt: keep a copy for debugging and try the backup.
      try {
        this.storage.setItem(CORRUPT_KEY, main);
      } catch {
        /* ignore */
      }
      const backup = this.parse(this.storage.getItem(BACKUP_KEY));
      if (backup) {
        this.recovered = 'backup';
        return backup;
      }
      this.recovered = 'reset';
    }
    return defaultSave();
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Writes the save, keeping the previous good save as a backup. */
  save(): void {
    try {
      const prev = this.storage.getItem(SAVE_KEY);
      if (prev && this.parse(prev)) this.storage.setItem(BACKUP_KEY, prev);
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.data));
      this.dirty = false;
    } catch (e) {
      console.warn('[save] failed', e);
    }
  }

  flush(): void {
    if (this.dirty) this.save();
  }

  reset(): void {
    const settings = this.data.settings;
    this.data = defaultSave();
    this.data.settings = settings;
    this.save();
  }
}
