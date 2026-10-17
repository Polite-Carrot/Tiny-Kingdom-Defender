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

describe('stationed hero', () => {
  const heroRun = (snap = newKingdom()) => {
    const meta = newMeta();
    return new Run({ snapshot: snap, meta: { ...meta.metaBonuses(), heroId: 'knight' }, availableTowers: ['archer'], seed: 4 });
  };

  it('starts on the castle wall and moves to a pad for free once, then for gold', () => {
    const run = heroRun();
    const h = run.hero!;
    const c = run.map.castle;
    expect(h.post).toBe(-1);
    expect(Math.hypot(h.x - c.x, h.z - c.z)).toBeLessThan(0.5);
    expect(h.y).toBeGreaterThan(0.5);
    const [a, b] = [...run.unlockedSpots];
    const gold = run.gold;
    expect(run.stationHero(a)).toBe(true);
    expect(run.gold).toBe(gold);
    expect(h.post).toBe(a);
    // The hero's pad can't take a tower.
    expect(run.build(a, 'archer')).toBeNull();
    const cost = run.heroMoveCost();
    expect(cost).toBeGreaterThan(0);
    expect(run.stationHero(b)).toBe(true);
    expect(run.gold).toBe(gold - cost);
    // Saved and restored with the kingdom.
    const back = heroRun(run.snapshot());
    expect(back.hero!.post).toBe(b);
    expect(back.heroMoveCost()).toBe(cost);
  });

  it('fights from the post and never falls', () => {
    const run = heroRun();
    run.callNextWave();
    let attacks = 0;
    run.events.on('heroAttack', () => attacks++);
    for (let i = 0; i < 60 * 40; i++) run.update(1 / 60);
    const h = run.hero!;
    expect(attacks).toBeGreaterThan(0);
    expect(h.dead).toBe(false);
    expect(h.post).toBe(-1);
  });
});

describe('raiders: thief, tunneller, siege engine', () => {
  const run1 = (snap = newKingdom()) => new Run({ snapshot: { ...snap, gold: 500 }, meta: newMeta().metaBonuses(), availableTowers: ['archer'], seed: 3 });

  it('a thief that slips through steals gold and leaves the castle alone', () => {
    const run = run1();
    run.callNextWave();
    const e = run.spawnEnemy('thief', 0, run.map.paths[0].length - 0.05, run.currentWave, 1);
    const hp = run.castleHp, gold = run.gold;
    let stolen = 0;
    run.events.on('goldStolen', ({ amount }) => (stolen = amount));
    run.update(1 / 30);
    expect(e.alive).toBe(false);
    expect(stolen).toBeGreaterThan(0);
    expect(run.castleHp).toBe(hp);
    expect(run.gold).toBeLessThan(gold);
  });

  it('a tunneller travels hidden and surfaces halfway', () => {
    const run = run1();
    run.callNextWave();
    const e = run.spawnEnemy('tunneler', 0, 0, run.currentWave, 1);
    expect(e.hidden).toBe(true);
    const half = run.map.paths[0].length * 0.5;
    for (let i = 0; i < 30 * 60 && e.alive && e.dist < half + 0.2; i++) run.update(1 / 30);
    expect(e.hidden).toBe(false);
  });

  it('a siege engine knocks out a nearby tower for a while', () => {
    const run = run1();
    run.callNextWave();
    const t = run.build([...run.unlockedSpots][0], 'archer')!;
    // Park the engine right next to the tower.
    let best = 0, bd = Infinity;
    for (let d = 0; d < run.map.paths[0].length; d += 0.1) {
      const p = run.map.pointAt(0, d, { x: 0, z: 0, dx: 0, dz: 0 });
      const dd = Math.hypot(p.x - t.x, p.z - t.z);
      if (dd < bd) { bd = dd; best = d; }
    }
    const e = run.spawnEnemy('siege', 0, best, run.currentWave, 50);
    e.freezeTimer = 0;
    let hit = false;
    run.events.on('siegeHit', ({ tower }) => (hit = tower === t));
    for (let i = 0; i < 30 * 2 && !hit; i++) run.update(1 / 30);
    expect(hit).toBe(true);
    expect(t.dazed).toBeGreaterThan(0);
  });
});

describe('second hero slot', () => {
  it('opens at its wave for coins and brings a partner into the siege', () => {
    const meta = newMeta();
    meta.d.coins = 100000;
    meta.d.unlocks.heroes = ['ranger', 'knight'];
    expect(meta.buyHeroSlot2()).toBe(false);
    meta.d.progress.bestWave = 40;
    expect(meta.buyHeroSlot2()).toBe(true);
    expect(meta.secondHero()).toBe('knight');
    const run = new Run({ snapshot: newKingdom(), meta: meta.metaBonuses(), availableTowers: ['archer'] });
    expect(run.heroes.map((h) => h.def.id)).toEqual(['ranger', 'knight']);
    // Both start on the castle walls, in different spots, and can't share a pad.
    const [a, b] = run.heroes;
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.3);
    const pad = [...run.unlockedSpots][0];
    expect(run.stationHero(pad, a)).toBe(true);
    expect(run.stationHero(pad, b)).toBe(false);
    // Saved with the kingdom.
    const back = new Run({ snapshot: run.snapshot(), meta: meta.metaBonuses(), availableTowers: ['archer'] });
    expect(back.heroes[0].post).toBe(pad);
    expect(back.heroes[1].post).toBe(-1);
  });
});
