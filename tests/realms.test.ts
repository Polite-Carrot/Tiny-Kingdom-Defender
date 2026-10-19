import { describe, it, expect, afterEach } from 'vitest';
import { MAPS } from '../src/data/maps';
import { LAND } from '../src/data/base';
import { kingdomMap, setActiveMap, initialSpots, siegeWave, openRoads, nightOf } from '../src/game/Siege';
import { Run, newKingdom } from '../src/game/Run';
import { Meta } from '../src/game/Meta';
import { SaveSystem, type StorageLike } from '../src/core/Save';
import type { Analytics } from '../src/analytics/Analytics';
import { TOWERS, towerStats } from '../src/data/towers';
import { AutoPlayer } from '../src/game/AutoPlayer';

function mem(): StorageLike {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
const nullAnalytics: Analytics = { track: () => {}, sessionEvents: () => [] };

afterEach(() => setActiveMap('vale'));

describe('realms', () => {
  for (const def of MAPS) {
    it(`${def.name}: every road reaches the castle and there is room to build`, () => {
      setActiveMap(def.id);
      const map = kingdomMap();
      const castle = def.roads[0].points[def.roads[0].points.length - 1];
      for (const r of def.roads) {
        expect(r.points[r.points.length - 1]).toEqual(castle);
        // Straight orthogonal segments only.
        for (let i = 1; i < r.points.length; i++) expect(r.points[i][0] === r.points[i - 1][0] || r.points[i][1] === r.points[i - 1][1]).toBe(true);
        // Starts just off the board edge.
        const [c, rr] = r.points[0];
        expect(c === -1 || rr === -1 || c === map.size || rr === map.size).toBe(true);
      }
      expect(map.classicSpots).toBeGreaterThanOrEqual(24);
      expect(map.buildSpots.length).toBeGreaterThan(LAND.totalSpots * 3);
      expect(initialSpots()).toHaveLength(LAND.initialSpots);
      expect(openRoads(0)).toEqual([0]);
      expect(siegeWave(3).groups.length).toBeGreaterThan(0);
    });

    it(`${def.name}: the auto player holds the first waves`, () => {
      setActiveMap(def.id);
      const run = new Run({ snapshot: newKingdom(), meta: new Meta(new SaveSystem(mem()), nullAnalytics).metaBonuses(), availableTowers: ['archer', 'cannon'], seed: 3 });
      const ai = new AutoPlayer(run, 3);
      let cleared = 0;
      run.events.on('waveCleared', () => cleared++);
      for (let i = 0; i < 30 * 400 && cleared < 4 && run.state !== 'lost'; i++) {
        ai.update(1 / 30);
        run.update(1 / 30);
      }
      expect(cleared).toBe(4);
    });
  }

  it('switching realms keeps each siege separate', () => {
    const meta = new Meta(new SaveSystem(mem()), nullAnalytics);
    meta.d.base = { ...newKingdom(), wave: 12 };
    expect(meta.switchMap('serpent')).toBe(false); // locked
    meta.d.progress.bestWave = 25;
    expect(meta.switchMap('serpent')).toBe(true);
    expect(meta.d.base).toBeNull();
    expect(meta.mapBase('coil')?.wave).toBe(12);
    meta.d.base = { ...newKingdom(), wave: 3 };
    meta.switchMap('coil');
    expect(meta.d.base?.wave).toBe(12);
    expect(meta.mapBase('serpent')?.wave).toBe(3);
  });
});

describe('new towers', () => {
  it('the Gold Mine pays out at the end of each wave', () => {
    const run = new Run({ snapshot: newKingdom(), meta: new Meta(new SaveSystem(mem()), nullAnalytics).metaBonuses(), availableTowers: ['archer', 'mine'], seed: 2 });
    run.gold = 10000;
    const spots = [...run.unlockedSpots];
    run.build(spots[0], 'archer');
    run.build(spots[1], 'archer');
    run.build(spots[2], 'mine');
    let paid = 0;
    run.events.on('mineGold', ({ gold }) => (paid += gold));
    run.callNextWave();
    for (let i = 0; i < 60 * 120 && paid === 0; i++) run.update(1 / 60);
    expect(paid).toBeGreaterThan(0);
  });

  it('a Beacon boosts towers in range and Storm Shrines push enemies back', () => {
    const run = new Run({ snapshot: newKingdom(), meta: new Meta(new SaveSystem(mem()), nullAnalytics).metaBonuses(), availableTowers: ['archer', 'beacon', 'gale'] });
    run.gold = 10000;
    const map = run.map;
    const a = map.buildSpots[0];
    const near = map.buildSpots.find((s) => s !== a && Math.hypot(s.x - a.x, s.z - a.z) <= 1.5)!;
    run.unlockedSpots.add(a.index);
    run.unlockedSpots.add(near.index);
    const archer = run.build(a.index, 'archer')!;
    const before = archer.stats.damage;
    run.build(near.index, 'beacon');
    expect(archer.buffedBy).toBeGreaterThan(0);
    expect(archer.stats.damage).toBeCloseTo(before * (1 + towerStats(TOWERS.beacon, 1, -1).buff));
    expect(towerStats(TOWERS.gale, 1, -1).knockback).toBeGreaterThan(0);
  });

  it('every tenth wave ends at night', () => {
    expect(nightOf(0)).toBe(0);
    expect(nightOf(6)).toBe(0.5);
    expect(nightOf(9)).toBe(1);
    expect(nightOf(10)).toBe(0);
  });
});

describe('squares beside the tunnels', () => {
  it('are buildable in every realm, and come last so saved spot numbers stay put', () => {
    for (const def of MAPS) {
      setActiveMap(def.id);
      const map = kingdomMap();
      const at = new Map(map.buildSpots.map((s) => [`${s.col},${s.row}`, s.index]));
      let firstBeside = Infinity, lastOther = -1;
      for (const s of map.buildSpots) {
        if (map.isClassic(s.index)) continue;
        const beside = def.roads.some((r) => Math.max(Math.abs(s.col - r.points[0][0]), Math.abs(s.row - r.points[0][1])) <= 1);
        if (beside) firstBeside = Math.min(firstBeside, s.index);
        else lastOther = Math.max(lastOther, s.index);
      }
      // Each road's first on-board square has buildable grass on at least one side.
      for (const r of def.roads) {
        const [sc, sr] = r.points[0];
        const ec = Math.min(map.size - 1, Math.max(0, sc)), er = Math.min(map.size - 1, Math.max(0, sr));
        const sides = sc < 0 || sc >= map.size ? [[ec, er - 1], [ec, er + 1]] : [[ec - 1, er], [ec + 1, er]];
        expect(sides.some(([c, rr]) => at.has(`${c},${rr}`)), `${def.id} ${r.name}`).toBe(true);
      }
      expect(firstBeside).toBeGreaterThan(lastOther);
    }
  });
});
