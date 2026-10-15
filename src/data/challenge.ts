// Daily Challenge: everyone gets the same siege each day (start wave, Age, gold and twists),
// decided from the date. One scored attempt a day; the score is the number of waves survived.

import type { TowerId } from './towers';

export type TwistId = 'swift' | 'tough' | 'goldRush' | 'arsenal' | 'noHero' | 'glass' | 'elites' | 'thrifty';

export interface TwistDef {
  id: TwistId;
  name: string;
  description: string;
  icon: string;
}

export const TWISTS: Record<TwistId, TwistDef> = {
  swift: { id: 'swift', name: 'Swift Foes', description: 'Enemies move 30% faster', icon: '💨' },
  tough: { id: 'tough', name: 'Iron Hide', description: 'Enemies have 40% more HP but drop 25% more gold', icon: '🛡️' },
  goldRush: { id: 'goldRush', name: 'Gold Rush', description: 'Double gold from enemies, but they have 25% more HP', icon: '💰' },
  arsenal: { id: 'arsenal', name: 'Limited Arsenal', description: 'Only three tower types may be built', icon: '🏹' },
  noHero: { id: 'noHero', name: 'Heroes Away', description: 'No hero, but towers deal 20% more damage', icon: '🚫' },
  glass: { id: 'glass', name: 'Glass Castle', description: 'The castle has only 8 HP', icon: '🏰' },
  elites: { id: 'elites', name: 'Elite Horde', description: 'Elite enemies appear four times as often', icon: '⭐' },
  thrifty: { id: 'thrifty', name: 'Lean Times', description: 'Start with 35% less gold', icon: '🪙' },
};

/** Twists that must not appear together. */
export const TWIST_CLASH: [TwistId, TwistId][] = [['tough', 'goldRush'], ['glass', 'swift']];

export const CHALLENGE = {
  /** Possible starting waves (each the 6th wave of an Age, so every Age gets a turn). */
  startWaves: [5, 25, 45, 65],
  /** Starting gold for each start wave. */
  gold: { 5: 1200, 25: 3200, 45: 8500, 65: 7000 } as Record<number, number>,
  /**
   * Enemies are as tough as at this wave whichever Age the challenge starts in (later Ages
   * bring more enemies and roads instead), then grow hpRamp tougher each wave.
   */
  hpLikeWave: 6,
  hpRamp: 0.07,
  twistsPerDay: 2,
  /** Coins for each wave survived; a chest for beating your best. */
  coinsPerWave: 15,
  /** Towers Limited Arsenal picks from. */
  arsenalPool: ['archer', 'cannon', 'frost', 'mage', 'ballista', 'flame', 'alchemist', 'lightning'] as TowerId[],
};

export interface ChallengeDef {
  day: string;
  seed: number;
  startWave: number;
  gold: number;
  twists: TwistId[];
  /** Towers allowed (null = all you have unlocked). */
  towers: TowerId[] | null;
}

/** Simulation modifiers a challenge applies. */
export interface ChallengeMods {
  enemyHp: number;
  /** Extra enemy HP per wave into the challenge (compounding), so every attempt ends in time. */
  hpRamp: number;
  /** Wave the ramp counts from. */
  rampFrom: number;
  enemySpeed: number;
  killGold: number;
  eliteMult: number;
  towerDamage: number;
  castleHp: number | null;
  noHero: boolean;
}

export function challengeMods(twists: TwistId[], startWave = 0, hpScale = 1): ChallengeMods {
  const m: ChallengeMods = { enemyHp: hpScale, hpRamp: CHALLENGE.hpRamp, rampFrom: startWave, enemySpeed: 1, killGold: 1, eliteMult: 1, towerDamage: 1, castleHp: null, noHero: false };
  for (const t of twists) {
    if (t === 'swift') m.enemySpeed *= 1.3;
    if (t === 'tough') { m.enemyHp *= 1.4; m.killGold *= 1.25; }
    if (t === 'goldRush') { m.killGold *= 2; m.enemyHp *= 1.25; }
    if (t === 'noHero') { m.noHero = true; m.towerDamage *= 1.2; }
    if (t === 'glass') m.castleHp = 8;
    if (t === 'elites') m.eliteMult *= 4;
  }
  return m;
}
