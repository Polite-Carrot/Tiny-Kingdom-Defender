// Versioned save system with migrations and a corrupt-save fallback.

import type { TowerId } from '../data/towers';
import type { HeroId } from '../data/heroes';
import type { EnemyId } from '../data/enemies';
import type { BaseSnapshot } from '../game/Run';
import type { BuildingId } from '../data/kingdom';
import type { MapId } from '../data/maps';
import { migrateLayouts } from '../game/RoadMigration';
import type { SpellId } from '../data/spells';

export const SAVE_VERSION = 8;
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
  /** Game speed the siege opens at (1, 2 or 3). */
  speed: number;
  /** Start the next wave as soon as the field is clear. */
  autoWave: boolean;
  /** Vibrate the phone on big moments. */
  vibration: boolean;
}

export interface LifeStats {
  bossKills: number;
  eliteKills: number;
  flyingKills: number;
  towersBuilt: number;
  celestialTowers: number;
  barricades: number;
  synergies: number;
  synergyTypes: string[];
  abilityUses: number;
  /** Checkpoints reached with the castle at full health. */
  perfectCheckpoints: number;
  heroKills: number;
  /** Spells cast (optional in older saves). */
  spellsCast?: number;
  /** Waves cleared at night, and in weather. */
  nightWaves?: number;
  weatherWaves?: number;
}

export interface SaveData {
  version: number;
  coins: number;
  shards: number;
  /** The persistent kingdom (null until founded). */
  base: BaseSnapshot | null;
  progress: { bestWave: number; bestCheckpoint: number; retreats: number; checkpointsPaid: number; /** Highest wave whose new-Age/road announcement was shown. */ frontierSeen: number };
  towerLevels: Record<TowerId, number>;
  meta: { castleHp: number; battlements: number; warChest: number; heroPower: number };
  unlocks: { lightning: boolean; heroes: HeroId[]; heroSlot2: boolean };
  selectedHero: HeroId;
  /** The second hero ('' = none). */
  secondHero: HeroId | '';
  /** Experience earned by each hero. */
  heroXp: Partial<Record<HeroId, number>>;
  cosmetics: { owned: string[]; castle: string; trail: string; hero: string; tower: string; flag: string; /** Season skin worn by each hero ('' or absent = none). */ heroSkins: Partial<Record<HeroId, string>> };
  /** The monthly Reward Track. */
  pass: {
    month: string;
    stars: number;
    /** Tier numbers (1..30) already collected. */
    claimed: number[];
    /** Bonus chests collected after completing the track. */
    bonusPaid: number;
    /** Today's capped sources. */
    day: string;
    waveStars: number;
    challenge: boolean;
    login: boolean;
    /** Rewards collected for you when last month ended (shown once, then 0). */
    carried: number;
  };
  settings: Settings;
  treasury: { lastCollect: number };
  chest: { nextFree: number; pendingMilestone: number };
  daily: { lastClaimDay: string | null; streak: number };
  missions: { day: string; list: MissionState[] };
  ads: { removeAds: boolean; shopBundleDay: string; shopBundleCount: number; winsSinceInterstitial: number };
  stats: { kills: number; wavesCleared: number; coinsEarned: number; playTime: number };
  /** Lifetime counters for achievements. */
  life: LifeStats;
  /** Achievement ids already unlocked (and paid). */
  achievements: string[];
  /** Enemies met and defeated, by enemy id. */
  bestiary: Partial<Record<EnemyId, { seen: number; killed: number }>>;
  tutorial: { done: boolean; hintsSeen: string[] };
  firstLaunch: number;
  /** Tower mastery XP by tower type. */
  mastery: Partial<Record<TowerId, number>>;
  /** Kingdom buildings built beyond the moat. */
  buildings: BuildingId[];
  /** Daily Challenge: today's attempt and the all-time best. */
  challenge: { day: string; attempted: boolean; done: boolean; score: number; best: number; history: { day: string; score: number }[] };
  /** When the player was last here (for the "while you were away" summary). */
  lastSeen: number;
  /**
   * Realms (maps). `base` and the progress checkpoint/frontier fields always belong to the
   * current realm; the others wait in `saved` until you switch back. `best` is per realm.
   */
  /** Spell upgrade levels. */
  spellLevels: Partial<Record<SpellId, number>>;
  /** Hero skill choices: for each hero, the perk picked at each skill tier (0 or 1). */
  heroPerks: Partial<Record<HeroId, number[]>>;
  realms: { current: MapId; saved: Partial<Record<MapId, { base: BaseSnapshot | null; checkpointsPaid: number; frontierSeen: number }>>; best: Partial<Record<MapId, number>> };
}

export function defaultSave(now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    coins: 0,
    shards: 0,
    base: null,
    progress: { bestWave: 0, bestCheckpoint: 0, retreats: 0, checkpointsPaid: 0, frontierSeen: 0 },
    towerLevels: { archer: 0, cannon: 0, frost: 0, lightning: 0, mage: 0, ballista: 0, flame: 0, alchemist: 0, catapult: 0, gale: 0, mine: 0, beacon: 0 },
    meta: { castleHp: 0, battlements: 0, warChest: 0, heroPower: 0 },
    unlocks: { lightning: false, heroes: ['ranger'], heroSlot2: false },
    selectedHero: 'ranger',
    secondHero: '',
    heroXp: {},
    cosmetics: { owned: ['castle_default', 'trail_none'], castle: 'castle_default', trail: 'trail_none', hero: 'hero_none', tower: 'tower_none', flag: 'flag_none', heroSkins: {} },
    pass: { month: '', stars: 0, claimed: [], bonusPaid: 0, day: '', waveStars: 0, challenge: false, login: false, carried: 0 },
    settings: { music: 0.6, sfx: 0.8, quality: 'high', showFps: false, debugAdOutcome: 'completed', debugAdsUnavailable: false, speed: 1, autoWave: false, vibration: true },
    treasury: { lastCollect: now },
    chest: { nextFree: now, pendingMilestone: 0 },
    daily: { lastClaimDay: null, streak: 0 },
    missions: { day: '', list: [] },
    ads: { removeAds: false, shopBundleDay: '', shopBundleCount: 0, winsSinceInterstitial: 0 },
    stats: { kills: 0, wavesCleared: 0, coinsEarned: 0, playTime: 0 },
    life: { bossKills: 0, eliteKills: 0, flyingKills: 0, towersBuilt: 0, celestialTowers: 0, barricades: 0, synergies: 0, synergyTypes: [], abilityUses: 0, perfectCheckpoints: 0, heroKills: 0 },
    achievements: [],
    bestiary: {},
    tutorial: { done: false, hintsSeen: [] },
    firstLaunch: now,
    mastery: {},
    buildings: [],
    challenge: { day: '', attempted: false, done: false, score: 0, best: 0, history: [] },
    lastSeen: now,
    spellLevels: {},
    heroPerks: {},
    realms: { current: 'coil', saved: {}, best: {} },
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
      progress: { bestWave: 0, bestCheckpoint: 0, retreats: 0, checkpointsPaid: 0, frontierSeen: 0 },
      stats: { kills: d.stats?.kills ?? 0, wavesCleared: 0, coinsEarned: d.stats?.coinsEarned ?? 0, playTime: d.stats?.playTime ?? 0 },
      tutorial: { done: false, hintsSeen: [] },
      version: 4,
    };
  },
  // v5: Kingdom Vale, Serpent Pass and Four Winds lost roads. v6: Coil Keep and The Gauntlet
  // lost theirs (and The Gauntlet's keep moved to the corner), Serpent Pass's east gate grew.
  // Roads shape where the pads go, so saved kingdoms move onto each new layout square by square.
  4: (d) => relayout(d, 4),
  5: (d) => relayout(d, 5),
  // v7: Kingdom Vale gained a mirror-image East Road.
  6: (d) => relayout(d, 6),
  // v8: Serpent Pass's keep moved to the south-west corner.
  7: (d) => relayout(d, 7),
};

function relayout(d: AnyObj, v: number): AnyObj {
  const realms = d.realms ?? { current: 'vale', saved: {}, best: {} };
  const saved: AnyObj = { ...(realms.saved ?? {}) };
  for (const id of Object.keys(saved)) if (saved[id]?.base) saved[id] = { ...saved[id], base: migrateLayouts(v, saved[id].base, id as MapId) };
  const base = d.base ? migrateLayouts(v, d.base, (realms.current ?? 'vale') as MapId) : d.base;
  return { ...d, base, realms: { ...realms, saved }, version: v + 1 };
}

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
