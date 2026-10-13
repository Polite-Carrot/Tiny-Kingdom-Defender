// Data-driven wave composer: each wave has a point budget that is spent on enemies
// according to the current Age's weights and each enemy's introduction wave.

import { ENEMIES, REGULAR_ENEMIES, ENEMY_RULES, type EnemyId } from '../data/enemies';
import { WAVE_COMPOSER, ENEMY_FIRST_WAVE } from '../data/base';
import { Random } from '../core/Random';

export interface WaveGroup {
  enemy: EnemyId;
  count: number;
  /** Road index. */
  path: number;
  /** Seconds after wave start before the first spawn. */
  delay: number;
  spacing: number;
}

export interface WaveDef {
  groups: WaveGroup[];
  hpMult: number;
  /** Bounty multiplier for every enemy in the wave. */
  goldMult: number;
  boss: boolean;
  /** Boss HP multiplier (boss waves only). */
  bossHp?: number;
}

export interface ComposeOptions {
  budget: number;
  waveIndex: number;
  weights: Partial<Record<EnemyId, number>>;
  /** Indices of roads open to enemies. */
  roads: number[];
  hpMult: number;
  goldMult: number;
  boss?: EnemyId;
  bossHp?: number;
}

export function availableEnemies(waveIndex: number, weights: Partial<Record<EnemyId, number>>): Partial<Record<EnemyId, number>> {
  const out: Partial<Record<EnemyId, number>> = {};
  for (const id of REGULAR_ENEMIES) {
    const w = weights[id] ?? 0;
    const first = ENEMY_FIRST_WAVE[id];
    if (w > 0 && first !== undefined && first <= waveIndex) out[id] = w;
  }
  if (Object.keys(out).length === 0) out.grunt = 1;
  return out;
}

export function composeWave(rng: Random, o: ComposeOptions): WaveDef {
  const pool = availableEnemies(o.waveIndex, o.weights);
  const groups: WaveGroup[] = [];
  let budget = o.budget;
  let delay = 0;

  if (o.boss) {
    groups.push({ enemy: o.boss, count: 1, path: o.roads[o.waveIndex % o.roads.length], delay: 0, spacing: 1 });
    budget *= WAVE_COMPOSER.bossEscortFraction;
    delay = 3;
  }

  const mix = o.waveIndex >= WAVE_COMPOSER.mixFromWave;
  const maxGroups = mix ? Math.min(WAVE_COMPOSER.maxGroups + o.roads.length - 1, 1 + Math.floor(budget / 8)) : 1;
  const groupCount = Math.max(1, rng.int(Math.min(2, maxGroups), maxGroups));
  const shares: number[] = [];
  let shareTotal = 0;
  for (let i = 0; i < groupCount; i++) {
    const v = rng.range(0.6, 1.4);
    shares.push(v);
    shareTotal += v;
  }

  const used = new Set<EnemyId>();
  for (let i = 0; i < groupCount; i++) {
    let enemy: EnemyId = rng.weighted(pool);
    for (let tries = 0; tries < 4 && used.has(enemy); tries++) enemy = rng.weighted(pool);
    used.add(enemy);
    const def = ENEMIES[enemy];
    const groupBudget = (budget * shares[i]) / shareTotal;
    const count = Math.max(1, Math.round(groupBudget / def.cost));
    const path = o.roads[(i + o.waveIndex) % o.roads.length];
    const spacing = ENEMY_RULES.spawnSpacing * (def.speed > 1.5 ? 0.6 : def.cost >= 3 ? 1.5 : 1);
    groups.push({ enemy, count, path, delay, spacing });
    // Groups on different roads arrive together; on the same road they follow each other.
    if (o.roads.length === 1 || (i + 1) % o.roads.length === 0) delay += Math.min(count * spacing * 0.6, 6) + WAVE_COMPOSER.groupGap;
  }

  return { groups, hpMult: o.hpMult, goldMult: o.goldMult, boss: !!o.boss, bossHp: o.bossHp };
}

/** Summarises a wave for the preview UI. */
export function waveSummary(w: WaveDef): { enemy: EnemyId; count: number }[] {
  const map = new Map<EnemyId, number>();
  for (const g of w.groups) map.set(g.enemy, (map.get(g.enemy) ?? 0) + g.count);
  return [...map.entries()].map(([enemy, count]) => ({ enemy, count }));
}
