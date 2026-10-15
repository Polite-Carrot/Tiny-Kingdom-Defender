// Tower mastery: every tower type earns experience from the enemies it defeats, forever.
// Each mastery level adds a little damage; Veteran (5) and Master (10) add a perk and a new look.

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
