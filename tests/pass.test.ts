import { describe, it, expect } from 'vitest';
import { SaveSystem, type StorageLike } from '../src/core/Save';
import { Meta } from '../src/game/Meta';
import type { Analytics } from '../src/analytics/Analytics';
import { PASS, PASS_TIERS, SEASONS, seasonFor, monthKey } from '../src/data/pass';
import { HEROES } from '../src/data/heroes';

function mem(): StorageLike {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
const nullAnalytics: Analytics = { track: () => {}, sessionEvents: () => [] };
const newMeta = () => new Meta(new SaveSystem(mem()), nullAnalytics);

/** Plays one maximal day: visit, 60 waves, 3 missions, the challenge. */
function maxDay(meta: Meta, day: Date): void {
  meta.passAdd('login', day);
  for (let i = 0; i < 60; i++) meta.passAdd('wave', day);
  for (let i = 0; i < 3; i++) meta.passAdd('mission', day);
  meta.passAdd('challenge', day);
}

describe('reward track', () => {
  it('has 30 tiers ending in the month\'s skin', () => {
    expect(PASS_TIERS).toHaveLength(PASS.tiers);
    expect(PASS_TIERS[PASS.tiers - 1].kind).toBe('skin');
  });

  it('covers every month from October 2026 to December 2027 with a unique skin for a real hero', () => {
    const months: string[] = [];
    for (let y = 2026, m = 9; y < 2028; m++) {
      if (m === 12) { m = 0; y++; if (y === 2028) break; }
      months.push(monthKey(new Date(y, m, 1)));
    }
    expect(months[0]).toBe('2026-10');
    expect(months[months.length - 1]).toBe('2027-12');
    for (const k of months) expect(SEASONS.find((s) => s.month === k), k).toBeTruthy();
    expect(new Set(SEASONS.map((s) => s.skin.id)).size).toBe(SEASONS.length);
    for (const s of SEASONS) expect(HEROES[s.skin.hero]).toBeTruthy();
    // Later months fall back to encores rather than nothing.
    expect(seasonFor(new Date(2028, 3, 2)).name).toMatch(/Encore/);
  });

  it('caps daily stars, so even a maximal player needs over two weeks', () => {
    const meta = newMeta();
    const day = new Date(2026, 10, 1, 12);
    maxDay(meta, day);
    const perDay = meta.d.pass.stars;
    expect(perDay).toBe(PASS.starsLogin + PASS.waveCapPerDay + 3 * PASS.starsPerMission + PASS.starsChallenge);
    // The same day again earns nothing more from the capped sources.
    meta.passAdd('login', day);
    meta.passAdd('wave', day);
    meta.passAdd('challenge', day);
    expect(meta.d.pass.stars).toBe(perDay);
    const days = Math.ceil((PASS.tiers * PASS.starsPerTier) / perDay);
    expect(days).toBeGreaterThanOrEqual(14);
    expect(days).toBeLessThanOrEqual(24);
  });

  it('pays tier rewards once, grants the skin at the top, and wears it', () => {
    const meta = newMeta();
    const day = new Date(2026, 9, 18, 12);
    meta.pass(day);
    meta.d.pass.stars = PASS.tiers * PASS.starsPerTier;
    expect(meta.passTier()).toBe(30);
    const coins = meta.d.coins;
    expect(meta.claimPassTier(1)).not.toBeNull();
    expect(meta.claimPassTier(1)).toBeNull();
    expect(meta.d.coins).toBe(coins + 150);
    const top = meta.claimPassTier(30)!;
    expect(top.skin?.id).toBe('skin_2026_10');
    expect(meta.heroSkin('ranger')?.name).toBe('Harvest Robin');
    meta.equipHeroSkin('ranger', '');
    expect(meta.heroSkin('ranger')).toBeNull();
  });

  it('collects leftover rewards when the month turns, then starts afresh', () => {
    const meta = newMeta();
    meta.pass(new Date(2026, 9, 20));
    meta.d.pass.stars = 5 * PASS.starsPerTier;
    const coins = meta.d.coins;
    const p = meta.pass(new Date(2026, 10, 2));
    expect(p.month).toBe('2026-11');
    expect(p.stars).toBe(0);
    expect(p.carried).toBe(5);
    expect(meta.d.coins).toBeGreaterThan(coins);
  });

  it('pays bonus chests past the end of the track', () => {
    const meta = newMeta();
    meta.pass();
    meta.d.pass.stars = PASS.tiers * PASS.starsPerTier + 2 * PASS.bonusEvery;
    expect(meta.passBonusDue()).toBe(2);
    expect(meta.claimPassBonus()).not.toBeNull();
    expect(meta.passBonusDue()).toBe(1);
  });
});
