// Builds playable level definitions (campaign, endless, weekly) from data config.

import {
  CHAPTERS, LEVELS_PER_CHAPTER, BOSS_EVERY, LEVEL_OVERRIDES, WAVE_COMPOSER, ENDLESS_LAYOUT, WEEKLY_MODIFIERS, WEEKLY, TOTAL_LEVELS,
  type Layout, type ChapterDef, type WeeklyModifier,
} from '../data/levels';
import { ENEMY_RULES, BOSS_BY_CHAPTER, type EnemyId } from '../data/enemies';
import { ENDLESS } from '../data/economy';
import { Random, hashString } from '../core/Random';
import { composeWave, type WaveDef } from './WaveComposer';
import { transformLayout, type LayoutTransform } from './LevelMap';

export type LevelKind = 'campaign' | 'endless' | 'weekly';

export interface LevelDef {
  id: string;
  kind: LevelKind;
  name: string;
  globalIndex: number;
  chapter: number;
  indexInChapter: number;
  layout: Layout;
  buildSpots: number;
  seed: number;
  waves: WaveDef[];
  isBoss: boolean;
  modifier?: WeeklyModifier;
  /** Endless only: generates wave n on demand. */
  endlessWave?: (n: number) => WaveDef;
}

const LEVEL_NAMES = [
  ['Greenford Road', 'Willow Bend', 'Miller\'s Crossing', 'Bramble Hollow', 'Ogre\'s Approach', 'Sunny Fields', 'Old Oak Path', 'Foxglove Lane', 'Riverside', 'Shepherd\'s Rest', 'Thistle Ridge', 'Copperwood', 'Daisy Downs', 'Hilltop Watch', 'Warchief\'s End'],
  ['Dusty Trail', 'Oasis Gate', 'Mirage Fork', 'Scorpion Pass', 'Colossus Rising', 'Sandstone Steps', 'Twin Dunes', 'Sunken Temple', 'Caravan Road', 'Shifting Sands', 'Vulture Rock', 'Bone Canyon', 'Pharaoh\'s Way', 'Dune Sea', 'Heart of the Storm'],
  ['Icicle Gate', 'Frozen Lake', 'Pine Hollow', 'Avalanche Run', 'Yeti Tracks', 'Glacier Steps', 'Snowdrift', 'Crystal Caves', 'Howling Ridge', 'Frostbite Pass', 'Polar Keep', 'Blizzard Crossing', 'Winter\'s Teeth', 'The Long Night', 'Yeti King'],
  ['Ashen Road', 'Ember Fields', 'Obsidian Fork', 'Magma Falls', 'Drake\'s Nest', 'Cinder Steps', 'Smoke Hollow', 'Brimstone Gate', 'Lava Lake', 'Scorched Spire', 'Molten Maze', 'Fire Gardens', 'Caldera Rim', 'Crown of Flame', 'The Magma Drake'],
];

/** Mean path length relative to the reference, clamped. Shorter roads get smaller waves. */
export function pathLengthFactor(layout: Layout): number {
  const lens = layout.paths.map((p) => {
    let len = 0;
    for (let i = 1; i < p.length; i++) len += Math.abs(p[i][0] - p[i - 1][0]) + Math.abs(p[i][1] - p[i - 1][1]);
    return len;
  });
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  // Blend in the shortest road: enemies sent down it have the least exposure.
  const effective = (mean + Math.min(...lens)) / 2;
  return Math.max(WAVE_COMPOSER.pathFactorMin, Math.min(WAVE_COMPOSER.pathFactorMax, effective / WAVE_COMPOSER.referencePathLength));
}

export function levelId(globalIndex: number): string {
  return `L${globalIndex + 1}`;
}

/** Layout variant for a level index in chapter: 6 layouts x transforms. */
function layoutFor(chapter: ChapterDef, idx: number): Layout {
  const n = chapter.layouts.length;
  const t = Math.floor(idx / n) as LayoutTransform;
  return transformLayout(chapter.layouts[idx % n], (t % 4) as LayoutTransform);
}

export function buildCampaignLevel(globalIndex: number): LevelDef {
  const chapterIdx = Math.floor(globalIndex / LEVELS_PER_CHAPTER);
  const idx = globalIndex % LEVELS_PER_CHAPTER;
  const chapter = CHAPTERS[chapterIdx];
  const seed = hashString(`level-${globalIndex}`);
  const rng = new Random(seed);
  const isBoss = (idx + 1) % BOSS_EVERY === 0;
  const layout = layoutFor(chapter, idx);
  const ov = LEVEL_OVERRIDES[globalIndex + 1] ?? {};
  const pathFactor = pathLengthFactor(layout) * (ov.budgetMult ?? 1);
  const waveCount = Math.round(chapter.waveCountMin + ((chapter.waveCountMax - chapter.waveCountMin) * idx) / (LEVELS_PER_CHAPTER - 1));
  const hpLevel = chapter.hpMult * (1 + ENEMY_RULES.hpGrowthPerLevel * idx) * (ov.hpMult ?? 1);
  const waves: WaveDef[] = [];
  for (let w = 0; w < waveCount; w++) {
    const last = w === waveCount - 1;
    const budget = (chapter.budgetBase + chapter.budgetPerLevel * idx + chapter.budgetPerWave * w) * pathFactor;
    let boss: EnemyId | undefined;
    if (isBoss && last) boss = BOSS_BY_CHAPTER[chapterIdx];
    const wave = composeWave(rng, {
      budget: boss ? budget * WAVE_COMPOSER.bossBudgetMult : budget,
      waveIndex: w,
      unlockIndex: globalIndex,
      weights: chapter.theme.enemyWeights,
      pathCount: layout.paths.length,
      hpMult: hpLevel * (1 + WAVE_COMPOSER.hpPerWave * w),
      goldMult: Math.pow(hpLevel, ENEMY_RULES.bountyHpExponent) * (1 + WAVE_COMPOSER.multiPathGoldBonus * (layout.paths.length - 1)),
      boss,
      mix: globalIndex >= WAVE_COMPOSER.mixFromLevel && w > 0,
    });
    if (boss) {
      const tier = Math.floor(idx / BOSS_EVERY);
      wave.bossHp = (ENEMY_RULES.bossTierHp[tier] ?? 1) * pathFactor;
    }
    waves.push(wave);
  }
  return {
    id: levelId(globalIndex),
    kind: 'campaign',
    name: LEVEL_NAMES[chapterIdx][idx],
    globalIndex,
    chapter: chapterIdx,
    indexInChapter: idx,
    layout,
    buildSpots: chapter.buildSpots,
    seed,
    waves,
    isBoss,
  };
}

export function buildEndlessLevel(): LevelDef {
  const seed = hashString('endless');
  const rng = new Random(seed);
  const weights: Partial<Record<EnemyId, number>> = { grunt: 3, runner: 3, knight: 3, bat: 2.5, shaman: 2, shield: 2 };
  const level: LevelDef = {
    id: 'endless', kind: 'endless', name: 'Endless Siege', globalIndex: TOTAL_LEVELS, chapter: 0, indexInChapter: 0,
    layout: ENDLESS_LAYOUT, buildSpots: 14, seed, waves: [], isBoss: false,
  };
  level.endlessWave = (n: number) => {
    const boss = n > 0 && (n + 1) % ENDLESS.bossEvery === 0 ? BOSS_BY_CHAPTER[Math.floor(n / ENDLESS.bossEvery) % BOSS_BY_CHAPTER.length] : undefined;
    const budget = ENDLESS.budgetBase + ENDLESS.budgetPerWave * Math.pow(n, ENDLESS.budgetExp);
    const wave = composeWave(rng, {
      budget: boss ? budget * 1.5 : budget,
      waveIndex: n,
      unlockIndex: Math.min(4 + n * 2, 60),
      weights,
      pathCount: ENDLESS_LAYOUT.paths.length,
      hpMult: 1 + ENDLESS.hpGrowthPerWave * n,
      goldMult: Math.pow(1 + ENDLESS.hpGrowthPerWave * n, ENEMY_RULES.bountyHpExponent),
      boss,
      mix: n > 0,
    });
    if (boss) wave.bossHp = 0.6 + n * 0.03;
    return wave;
  };
  return level;
}

/** ISO-like week key, e.g. 2026-W41. Deterministic from the date. */
export function weekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function buildWeeklyLevel(date: Date): LevelDef {
  const key = weekKey(date);
  const seed = hashString(`weekly-${key}`);
  const rng = new Random(seed);
  const modifier = rng.pick(WEEKLY_MODIFIERS);
  const chapterIdx = rng.int(0, CHAPTERS.length - 1);
  const chapter = CHAPTERS[chapterIdx];
  const layout = transformLayout(rng.pick(chapter.layouts), rng.int(0, 3) as LayoutTransform);
  const base = buildCampaignLevel(WEEKLY.difficultyLevel);
  const weights = { ...CHAPTERS[1].theme.enemyWeights, ...(modifier.weightOverrides ?? {}) };
  const waves: WaveDef[] = [];
  const count = 10;
  const ref = CHAPTERS[1];
  for (let w = 0; w < count; w++) {
    const boss = w === count - 1 ? BOSS_BY_CHAPTER[chapterIdx] : undefined;
    const budget = ref.budgetBase + ref.budgetPerLevel * 2 + ref.budgetPerWave * w;
    const wave = composeWave(rng, {
      budget: boss ? budget * 2 : budget, waveIndex: w, unlockIndex: 20, weights, pathCount: layout.paths.length,
      hpMult: ref.hpMult * (1 + WAVE_COMPOSER.hpPerWave * w) * (modifier.enemyHpMult ?? 1), goldMult: Math.pow(ref.hpMult, ENEMY_RULES.bountyHpExponent), boss, mix: true,
    });
    if (boss) wave.bossHp = 0.6;
    waves.push(wave);
  }
  return {
    ...base,
    id: `weekly-${key}`,
    kind: 'weekly',
    name: `Weekly: ${modifier.name}`,
    chapter: chapterIdx,
    layout,
    seed,
    waves,
    isBoss: true,
    modifier,
    buildSpots: chapter.buildSpots,
  };
}

let cache: LevelDef[] | null = null;
export function allCampaignLevels(): LevelDef[] {
  if (!cache) cache = Array.from({ length: TOTAL_LEVELS }, (_, i) => buildCampaignLevel(i));
  return cache;
}
