import { describe, it, expect } from 'vitest';
import { SaveSystem, type StorageLike } from '../src/core/Save';
import { Meta } from '../src/game/Meta';
import { Run, newKingdom } from '../src/game/Run';
import type { Analytics } from '../src/analytics/Analytics';
import { SPELL_BY_ID, spellCooldown } from '../src/data/spells';
import { PERK_TIERS, xpForLevel } from '../src/data/heroes';
import { weatherOf } from '../src/game/Siege';

function mem(): StorageLike {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
const nullAnalytics: Analytics = { track: () => {}, sessionEvents: () => [] };
const newMeta = () => new Meta(new SaveSystem(mem()), nullAnalytics);

function runWithEnemies(meta: Meta): Run {
  const run = new Run({ snapshot: newKingdom(), meta: meta.metaBonuses(), availableTowers: ['archer'], seed: 4 });
  run.callNextWave();
  for (let i = 0; i < 60 * 6; i++) run.update(1 / 60);
  return run;
}

describe('spells', () => {
  it('unlock with the best wave and level up in the shop', () => {
    const meta = newMeta();
    expect(meta.spellsAvailable().meteor).toBeUndefined();
    meta.d.progress.bestWave = SPELL_BY_ID.meteor.unlockWave;
    expect(meta.spellsAvailable().meteor).toBe(0);
    meta.d.coins = 10000;
    expect(meta.buySpellUpgrade('meteor')).toBe(true);
    expect(meta.spellLevel('meteor')).toBe(1);
    expect(spellCooldown('meteor', 1)).toBeLessThan(spellCooldown('meteor', 0));
  });

  it('meteor hurts the crowd and then recharges; freeze holds every enemy', () => {
    const meta = newMeta();
    meta.d.progress.bestWave = 40;
    const run = runWithEnemies(meta);
    const hpBefore = run.enemies.filter((e) => e.alive).reduce((a, e) => a + e.hp, 0);
    expect(run.castSpell('meteor')).toBe(true);
    const hpAfter = run.enemies.filter((e) => e.alive).reduce((a, e) => a + e.hp, 0);
    expect(hpAfter).toBeLessThan(hpBefore);
    expect(run.castSpell('meteor')).toBe(false);
    expect(run.castSpell('freeze')).toBe(true);
    for (const e of run.enemies) if (e.alive) expect(e.stunTimer).toBeGreaterThan(0);
    // Mend Walls does nothing at full health.
    expect(run.castSpell('repair')).toBe(false);
    run.castleHp -= 5;
    expect(run.castSpell('repair')).toBe(true);
  });
});

describe('hero skills', () => {
  it('a tier opens at its level, the pick is kept and changes the hero', () => {
    const meta = newMeta();
    expect(meta.pendingPerkTier('ranger')).toBe(-1);
    meta.d.heroXp.ranger = xpForLevel(PERK_TIERS[0].level);
    expect(meta.pendingPerkTier('ranger')).toBe(0);
    const before = new Run({ snapshot: newKingdom(), meta: meta.metaBonuses(), availableTowers: ['archer'] });
    meta.choosePerk('ranger', 0, 0); // Eagle Eye
    expect(meta.pendingPerkTier('ranger')).toBe(-1);
    expect(meta.heroPerks('ranger')).toEqual(['eagleEye']);
    const after = new Run({ snapshot: newKingdom(), meta: meta.metaBonuses(), availableTowers: ['archer'] });
    expect(after.heroRange()).toBeCloseTo(before.heroRange() * 1.25);
  });
});

describe('weather', () => {
  it('comes on some waves only, never the first few', () => {
    const kinds = Array.from({ length: 200 }, (_, w) => weatherOf(w));
    expect(kinds.slice(0, 3).every((k) => k === 'clear')).toBe(true);
    const share = kinds.filter((k) => k !== 'clear').length / kinds.length;
    expect(share).toBeGreaterThan(0.12);
    expect(share).toBeLessThan(0.4);
    expect(weatherOf(25)).toBe(weatherOf(25));
  });
});
