// Tower mastery: every tower type earns experience from the enemies it defeats, forever.
// Each mastery level adds a little damage (gold for the Gold Mine, boost for the Beacon);
// Veteran (5) and Master (10) add a perk and a new look.

import { TOWER_META } from './economy';
import type { TowerId } from './towers';

export const MASTERY = {
  maxLevel: 10,
  /** XP per kill. */
  killXp: 1,
  /** Gold Mines and Beacons earn this per wave they stand through. */
  supportXpPerWave: 4,
  damagePerLevel: 0.02,
  /** Veteran: a silver banner and +8% range. */
  veteranLevel: 5,
  veteranRange: 0.08,
  /** Master: a golden crown and 12% faster firing. */
  masterLevel: 10,
  masterCooldown: 0.88,
  /** Support towers never fire, so Master gives them more of what they do instead (gold or boost). */
  masterSupport: 1.12,
};

/** Total XP needed to reach mastery level `l` (level 0 needs none). */
export function masteryXpFor(l: number): number {
  return l <= 0 ? 0 : Math.round(60 * Math.pow(l, 1.7));
}

export function masteryLevelFor(xp: number): number {
  let l = 0;
  while (l < MASTERY.maxLevel && xp >= masteryXpFor(l + 1)) l++;
  return l;
}

export function masteryTitle(level: number): string {
  return level >= MASTERY.masterLevel ? 'Master' : level >= MASTERY.veteranLevel ? 'Veteran' : level > 0 ? 'Adept' : 'Novice';
}

/**
 * What a tower type gets from its shop level and mastery level, as numbers. Attack towers get
 * damage; the Gold Mine gets the same share as gold; the Beacon a smaller share as boost.
 */
export function towerBonus(id: TowerId, shopLevel: number, mastery: number): { kind: 'damage' | 'gold' | 'boost'; mult: number; masteryMult: number } {
  const kind = id === 'mine' ? 'gold' : id === 'beacon' ? 'boost' : 'damage';
  const share = kind === 'boost' ? TOWER_META.beaconShare : 1;
  const master = kind !== 'damage' && mastery >= MASTERY.masterLevel ? MASTERY.masterSupport : 1;
  return {
    kind,
    mult: 1 + shopLevel * TOWER_META.damagePerLevel * share,
    masteryMult: (1 + mastery * MASTERY.damagePerLevel * share) * master,
  };
}

const KIND_WORD = { damage: 'damage', gold: 'gold', boost: 'stronger boost' } as const;

/** Shop line, e.g. "+30% gold · +8% range · mastery +6% gold" or "+15% stronger boost · …". */
export function towerBonusText(id: TowerId, shopLevel: number, mastery: number): string {
  const b = towerBonus(id, shopLevel, mastery);
  const word = KIND_WORD[b.kind];
  const pct = (m: number) => Math.round((m - 1) * 100);
  return `+${pct(b.mult)}% ${word} · +${Math.round(shopLevel * TOWER_META.rangePerLevel * 100)}% range${mastery ? ` · mastery +${pct(b.masteryMult)}% ${word}` : ''}`;
}

/** The banner when a tower type reaches a new mastery level. */
export function masteryPerkText(id: TowerId, name: string, level: number): string {
  const b = towerBonus(id, 0, level);
  if (level === MASTERY.veteranLevel) return `Veteran: +${Math.round(MASTERY.veteranRange * 100)}% range and a silver banner`;
  if (level === MASTERY.masterLevel) {
    return b.kind === 'damage'
      ? `Master: ${Math.round((1 - MASTERY.masterCooldown) * 100)}% faster firing and a golden crown`
      : `Master: ${Math.round((MASTERY.masterSupport - 1) * 100)}% more ${b.kind === 'gold' ? 'gold' : 'boost'} and a golden crown`;
  }
  return `+${Math.round((b.masteryMult - 1) * 100)}% ${KIND_WORD[b.kind]} for every ${name}`;
}
