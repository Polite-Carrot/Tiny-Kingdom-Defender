import { describe, it, expect } from 'vitest';
import { Run, newKingdom, type MetaBonuses } from '../src/game/Run';
import { TOWERS } from '../src/data/towers';

const levels = (n: number) => ({ archer: n, cannon: 0, frost: 0, lightning: 0, mage: 0, ballista: 0, flame: 0, alchemist: 0, catapult: 0, gale: 0, mine: n, beacon: n });
const meta = (n: number, mastery = 0): MetaBonuses => ({ towerLevels: levels(n), castleHpBonus: 0, goldBonus: 0, heroPower: 0, heroId: null, mastery: { archer: mastery, mine: mastery, beacon: mastery } });
const stats = (m: MetaBonuses, id: 'archer' | 'mine' | 'beacon') => new Run({ snapshot: newKingdom(), meta: m, availableTowers: [id] }).computeStats(TOWERS[id], 1, -1);

describe('shop and mastery levels for support towers', () => {
  it('give attack towers damage, the Gold Mine gold and the Beacon a stronger boost', () => {
    const [a0, a5] = [stats(meta(0), 'archer'), stats(meta(5), 'archer')];
    expect(a5.damage).toBeGreaterThan(a0.damage);
    const [m0, m5] = [stats(meta(0), 'mine'), stats(meta(5), 'mine')];
    expect(m5.income).toBeCloseTo(m0.income * 1.3);
    expect(m5.damage).toBe(m0.damage);
    const [b0, b5] = [stats(meta(0), 'beacon'), stats(meta(5), 'beacon')];
    expect(b5.buff).toBeCloseTo(b0.buff * 1.15);
  });

  it('Master makes a support tower better at its job, not faster at firing', () => {
    const [m9, m10] = [stats(meta(0, 9), 'mine'), stats(meta(0, 10), 'mine')];
    expect(m10.income).toBeGreaterThan(m9.income * 1.12);
    expect(m10.cooldown).toBe(m9.cooldown);
    expect(stats(meta(0, 10), 'archer').cooldown).toBeLessThan(stats(meta(0, 9), 'archer').cooldown);
  });
});
