// The endless siege on your persistent kingdom: map, Ages, roads, waves, checkpoints, land.

import { LAND, SIEGE, SIEGE_COINS, WAVE_COMPOSER, type Road } from '../data/base';
import { MAP_BY_ID, type MapDef, type MapId } from '../data/maps';
import { THEMES, ageName, type Theme } from '../data/themes';
import { BOSS_BY_CHAPTER } from '../data/enemies';
import { Random, hashString } from '../core/Random';
import { LevelMap } from './LevelMap';
import { composeWave, type WaveDef } from './WaveComposer';

let active: MapDef = MAP_BY_ID.vale;
const mapCache = new Map<MapId, LevelMap>();

/** Chooses the realm the siege functions below work on. */
export function setActiveMap(id: MapId): void {
  active = MAP_BY_ID[id] ?? MAP_BY_ID.vale;
}

export function activeMap(): MapDef {
  return active;
}

export function activeRoads(): Road[] {
  return active.roads;
}

/** The active realm's map (deterministic). Kingdom Vale keeps its original seed. */
export function kingdomMap(id: MapId = active.id): LevelMap {
  let m = mapCache.get(id);
  if (!m) {
    const def = MAP_BY_ID[id];
    m = new LevelMap(def.roads.map((r) => r.points), LAND.totalSpots, hashString(id === 'vale' ? 'tiny-kingdom' : `tiny-kingdom-${id}`));
    mapCache.set(id, m);
  }
  return m;
}

export const ageOf = (wave: number) => Math.floor(wave / SIEGE.ageEvery);
export const themeOf = (wave: number): Theme => THEMES[ageOf(wave) % THEMES.length];
export const ageTitle = (wave: number) => ageName(ageOf(wave));
export const checkpointOf = (wave: number) => Math.floor(wave / SIEGE.checkpointEvery) * SIEGE.checkpointEvery;

/** Roads open to enemies at a wave. */
export function openRoads(wave: number): number[] {
  return active.roads.map((r, i) => (r.openWave <= wave ? i : -1)).filter((i) => i >= 0);
}

/**
 * Time of day for a wave: each 10-wave stretch starts at dawn, dusk falls on its 7th wave and
 * its last three waves (boss included) are fought at night. 0 = day, 0.5 = dusk, 1 = night.
 */
export function nightOf(wave: number): number {
  const m = ((wave % SIEGE.checkpointEvery) + SIEGE.checkpointEvery) % SIEGE.checkpointEvery;
  return m >= SIEGE.nightFrom ? 1 : m === SIEGE.nightFrom - 1 ? 0.5 : 0;
}

export function isBossWave(wave: number): boolean {
  return (wave + 1) % SIEGE.bossEvery === 0;
}

/** Battle gold multiplier for a wave (early waves are generous so a new kingdom gets going). */
export function goldScaleAt(wave: number): number {
  const k = Math.min(1, wave / SIEGE.goldTaperWave);
  return SIEGE.goldScaleEarly + (SIEGE.goldScale - SIEGE.goldScaleEarly) * k;
}

export function hpMultFor(wave: number): number {
  return (1 + SIEGE.hpLinear * wave) * Math.pow(SIEGE.hpExp, wave);
}

const waveCache = new Map<string, WaveDef>();
/** Wave n (0-based). Deterministic, so a replayed wave is the same wave. */
export function siegeWave(n: number): WaveDef {
  const key = `${active.id}-${n}`;
  const cached = waveCache.get(key);
  if (cached) return cached;
  const rng = new Random(hashString(active.id === 'vale' ? `wave-${n}` : `wave-${active.id}-${n}`));
  const roads = openRoads(n);
  const hp = hpMultFor(n);
  const boss = isBossWave(n) ? BOSS_BY_CHAPTER[Math.floor(n / SIEGE.bossEvery) % BOSS_BY_CHAPTER.length] : undefined;
  const bossNumber = Math.floor(n / SIEGE.bossEvery);
  let budget = (SIEGE.budgetBase + SIEGE.budgetPerWave * Math.pow(n, SIEGE.budgetExp)) * (1 + SIEGE.roadBudgetBonus * (roads.length - 1));
  if (boss) budget *= WAVE_COMPOSER.bossBudgetMult;
  const wave = composeWave(rng, {
    budget,
    waveIndex: n,
    weights: themeOf(n).enemyWeights,
    roads,
    hpMult: hp,
    goldMult: Math.pow(hp, SIEGE.bountyHpExponent),
    boss,
    bossHp: boss ? SIEGE.bossHpBase * (1 + SIEGE.bossGrowth * bossNumber) : undefined,
  });
  // Keep enemy counts phone-friendly: convert excess numbers into toughness.
  const total = wave.groups.reduce((a, g) => a + (g.enemy.startsWith('boss') ? 0 : g.count), 0);
  if (total > WAVE_COMPOSER.maxEnemiesPerWave) {
    const f = total / WAVE_COMPOSER.maxEnemiesPerWave;
    for (const g of wave.groups) if (!g.enemy.startsWith('boss')) g.count = Math.max(1, Math.round(g.count / f));
    wave.hpMult *= f;
    wave.goldMult *= f;
    if (wave.bossHp) wave.bossHp /= f; // the boss itself was not multiplied
  }
  if (waveCache.size > 400) waveCache.clear();
  waveCache.set(key, wave);
  return wave;
}

/** Gold to clear land for one more build pad. */
export function clearLandCost(padsCleared: number): number {
  const steep = Math.min(padsCleared, LAND.clearSoftCap);
  const gentle = 1 + LAND.clearAfterCap * Math.max(0, padsCleared - LAND.clearSoftCap);
  return Math.round((LAND.clearBase * Math.pow(LAND.clearGrowth, steep) * gentle) / 5) * 5;
}

/** Pads usable when a new kingdom is founded: the best-covering pads of the first road. */
export function initialSpots(map = kingdomMap()): number[] {
  return map.buildSpots
    .filter((s) => map.isClassic(s.index))
    .map((s) => ({ i: s.index, v: map.spotCoverage(s, 0) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, LAND.initialSpots)
    .map((x) => x.i);
}

/** Coins paid for clearing wave n. */
export function waveCoins(n: number): number {
  return Math.round(SIEGE_COINS.perWaveBase + SIEGE_COINS.perWaveGrowth * n);
}

/** Coins for reaching checkpoint wave `wave` (a multiple of checkpointEvery). */
export function checkpointCoins(wave: number, firstTime: boolean): number {
  const k = wave / SIEGE.checkpointEvery;
  const full = SIEGE_COINS.checkpointBase + SIEGE_COINS.checkpointGrowth * k;
  return Math.round(firstTime ? full : full * SIEGE_COINS.checkpointRepeatFraction);
}

export { ageName };
