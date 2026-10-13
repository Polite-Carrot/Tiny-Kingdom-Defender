// The endless siege on your persistent kingdom: map, Ages, roads, waves, checkpoints, land.

import { ROADS, LAND, SIEGE, SIEGE_COINS, WAVE_COMPOSER } from '../data/base';
import { THEMES, ageName, type Theme } from '../data/themes';
import { BOSS_BY_CHAPTER } from '../data/enemies';
import { Random, hashString } from '../core/Random';
import { LevelMap } from './LevelMap';
import { composeWave, type WaveDef } from './WaveComposer';

const MAP_SEED = hashString('tiny-kingdom');

let mapCache: LevelMap | null = null;
/** The single kingdom map (deterministic). */
export function kingdomMap(): LevelMap {
  if (!mapCache) mapCache = new LevelMap(ROADS.map((r) => r.points), LAND.totalSpots, MAP_SEED);
  return mapCache;
}

export const ageOf = (wave: number) => Math.floor(wave / SIEGE.ageEvery);
export const themeOf = (wave: number): Theme => THEMES[ageOf(wave) % THEMES.length];
export const ageTitle = (wave: number) => ageName(ageOf(wave));
export const checkpointOf = (wave: number) => Math.floor(wave / SIEGE.checkpointEvery) * SIEGE.checkpointEvery;

/** Roads open to enemies at a wave. */
export function openRoads(wave: number): number[] {
  return ROADS.map((r, i) => (r.openWave <= wave ? i : -1)).filter((i) => i >= 0);
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

const waveCache = new Map<number, WaveDef>();
/** Wave n (0-based). Deterministic, so a replayed wave is the same wave. */
export function siegeWave(n: number): WaveDef {
  const cached = waveCache.get(n);
  if (cached) return cached;
  const rng = new Random(hashString(`wave-${n}`));
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
  waveCache.set(n, wave);
  return wave;
}

/** Gold to clear land for one more build pad. */
export function clearLandCost(padsCleared: number): number {
  return Math.round((LAND.clearBase * Math.pow(LAND.clearGrowth, padsCleared)) / 5) * 5;
}

/** Pads usable when a new kingdom is founded: the best-covering pads of the first road. */
export function initialSpots(map = kingdomMap()): number[] {
  return map.buildSpots
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
