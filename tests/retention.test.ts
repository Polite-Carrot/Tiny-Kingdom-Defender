import { describe, it, expect } from 'vitest';
import { SaveSystem, type StorageLike } from '../src/core/Save';
import { Meta, dayKey } from '../src/game/Meta';
import { Run, newKingdom } from '../src/game/Run';
import type { Analytics } from '../src/analytics/Analytics';
import { MASTERY, masteryLevelFor, masteryXpFor } from '../src/data/mastery';
import { KINGDOM_BONUS } from '../src/data/kingdom';
import { CHALLENGE, TWIST_CLASH, challengeMods } from '../src/data/challenge';
import { TOWERS } from '../src/data/towers';

function mem(): StorageLike {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
const nullAnalytics: Analytics = { track: () => {}, sessionEvents: () => [] };
const newMeta = () => new Meta(new SaveSystem(mem()), nullAnalytics);

describe('tower mastery', () => {
  it('levels up from kills and stops at the max level', () => {
    expect(masteryLevelFor(0)).toBe(0);
    expect(masteryLevelFor(masteryXpFor(1))).toBe(1);
    expect(masteryLevelFor(masteryXpFor(5) - 1)).toBe(4);
    expect(masteryLevelFor(1e9)).toBe(MASTERY.maxLevel);
    const meta = newMeta();
    expect(meta.addMasteryXp('archer', masteryXpFor(2))).toBe(2);
    expect(meta.addMasteryXp('archer', 1)).toBeNull();
    expect(meta.masteryLevel('archer')).toBe(2);
  });

  it('adds damage per level, range at Veteran and fire rate at Master', () => {
    const meta = newMeta();
    const base = new Run({ snapshot: newKingdom(), meta: meta.metaBonuses(), availableTowers: ['archer'] }).computeStats(TOWERS.archer, 1, -1);
    meta.d.mastery.archer = masteryXpFor(MASTERY.masterLevel);
    const st = new Run({ snapshot: newKingdom(), meta: meta.metaBonuses(), availableTowers: ['archer'] }).computeStats(TOWERS.archer, 1, -1);
    expect(st.damage).toBeCloseTo(base.damage * (1 + MASTERY.masterLevel * MASTERY.damagePerLevel));
    expect(st.range).toBeCloseTo(base.range * (1 + MASTERY.veteranRange));
    expect(st.cooldown).toBeCloseTo(base.cooldown * MASTERY.masterCooldown);
  });
});

describe('kingdom buildings', () => {
  it('need the unlock wave and the coins, and are bought once', () => {
    const meta = newMeta();
    meta.d.coins = 100000;
    expect(meta.buyBuilding('chapel')).toBe(false);
    meta.d.progress.bestWave = 20;
    expect(meta.buyBuilding('chapel')).toBe(true);
    expect(meta.buyBuilding('chapel')).toBe(false);
    expect(meta.metaBonuses().castleHpBonus).toBe(KINGDOM_BONUS.chapelHp);
  });

  it('the farm raises the treasury rate and the windmill wave coins', () => {
    const meta = newMeta();
    meta.d.progress.bestWave = 50;
    meta.d.coins = 100000;
    const rate = meta.treasuryRate();
    const coins = meta.recordWaveCleared(10);
    meta.buyBuilding('farm');
    meta.buyBuilding('windmill');
    expect(meta.treasuryRate()).toBeCloseTo(rate * (1 + KINGDOM_BONUS.farmTreasury));
    expect(meta.recordWaveCleared(10)).toBe(Math.round(coins * (1 + KINGDOM_BONUS.windmillCoins)));
  });
});

describe('daily challenge', () => {
  it('is the same for everyone on a day and valid', () => {
    for (let i = 0; i < 60; i++) {
      const day = new Date(2026, 0, 1 + i, 12);
      const a = newMeta().challengeFor(day);
      const b = newMeta().challengeFor(day);
      expect(a).toEqual(b);
      expect(CHALLENGE.startWaves).toContain(a.startWave);
      expect(new Set(a.twists).size).toBe(CHALLENGE.twistsPerDay);
      for (const [x, y] of TWIST_CLASH) expect(a.twists.includes(x) && a.twists.includes(y)).toBe(false);
      if (a.twists.includes('arsenal')) expect(a.towers?.length).toBe(3);
      else expect(a.towers).toBeNull();
    }
  });

  it('allows one attempt a day and pays a chest only for a new best', () => {
    const meta = newMeta();
    expect(meta.challengeState().attempted).toBe(false);
    meta.startChallenge();
    expect(meta.challengeState().attempted).toBe(true);
    const r1 = meta.finishChallenge(9);
    expect(r1.coins).toBe(9 * CHALLENGE.coinsPerWave);
    expect(r1.newBest).toBe(true);
    expect(r1.chest).not.toBeNull();
    // Finishing twice pays nothing more.
    expect(meta.finishChallenge(20).coins).toBe(0);
    expect(meta.d.challenge.best).toBe(9);
  });

  it('scores an attempt left unfinished on an earlier day', () => {
    const meta = newMeta();
    meta.startChallenge();
    meta.challengeProgress(4);
    meta.d.challenge.day = '2000-01-01';
    const res = meta.settleAbandonedChallenge();
    expect(res?.coins).toBe(4 * CHALLENGE.coinsPerWave);
    expect(meta.challengeState().day).toBe(dayKey());
    expect(meta.challengeState().attempted).toBe(false);
  });

  it('twists change the siege: no hero, a glass castle, tougher enemies over time', () => {
    const meta = newMeta();
    const mods = challengeMods(['noHero', 'glass'], 25, 0.5);
    const run = new Run({ snapshot: { ...newKingdom(), wave: 25, checkpoint: 25 }, meta: { ...meta.metaBonuses(), heroId: 'ranger' }, availableTowers: ['archer'], mods });
    expect(run.hero).toBeNull();
    expect(run.castleMaxHp).toBe(8);
    const early = run.spawnEnemy('grunt', 0, 0, 25, 1);
    const late = run.spawnEnemy('grunt', 0, 0, 35, 1);
    expect(early.maxHp).toBeCloseTo(early.def.hp * 0.5);
    expect(late.maxHp / early.maxHp).toBeCloseTo(Math.pow(1 + CHALLENGE.hpRamp, 10));
  });
});

describe('welcome back and near misses', () => {
  it('summarises time away only after a real break', () => {
    const meta = newMeta();
    meta.d.progress.bestWave = 10;
    meta.d.base = newKingdom();
    const now = Date.now();
    meta.d.lastSeen = now - 10 * 60000;
    expect(meta.welcomeBack(now)).toBeNull();
    meta.d.lastSeen = now - 3 * 3600000;
    meta.d.treasury.lastCollect = now - 3 * 3600000;
    const wb = meta.welcomeBack(now)!;
    expect(wb.treasury).toBe(meta.treasuryAmount(now));
    expect(wb.goal.length).toBeGreaterThan(0);
    // The ad triples the collection.
    const amt = meta.treasuryAmount();
    expect(meta.collectTreasury(3)).toBe(amt * 3);
  });

  it('counts the enemies left in the wave that broke the castle', () => {
    const run = new Run({ snapshot: newKingdom(), meta: newMeta().metaBonuses(), availableTowers: ['archer'] });
    run.callNextWave();
    for (let i = 0; i < 60 * 5; i++) run.update(1 / 60);
    const n = run.nearMiss();
    expect(n.wave).toBe(0);
    expect(n.enemiesLeft).toBeGreaterThan(0);
  });
});
