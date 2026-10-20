import { describe, it, expect } from 'vitest';
import { SaveSystem, migrate, SAVE_KEY, BACKUP_KEY, SAVE_VERSION, type StorageLike } from '../src/core/Save';
import { AdManager, evaluateInterstitial, type InterstitialState } from '../src/ads/AdManager';
import { metaCost } from '../src/data/economy';
import { Run, newKingdom, type MetaBonuses } from '../src/game/Run';
import { Meta } from '../src/game/Meta';
import { siegeWave, openRoads, ageOf, checkpointOf, kingdomMap, clearLandCost, initialSpots, checkpointCoins, setActiveMap, buildRealmMap } from '../src/game/Siege';
import { MAPS, MAP_BY_ID } from '../src/data/maps';
import { LAYOUTS } from '../src/game/RoadMigration';
import { LAND, WAVE_COMPOSER, SIEGE } from '../src/data/base';
import { TOWERS, towerStats, upgradeCost, levelName, MAX_TIER, MAX_LEVEL } from '../src/data/towers';
import type { Analytics } from '../src/analytics/Analytics';
import { heroLevelFor, xpForLevel, gearTierFor, HERO_LEVELS } from '../src/data/heroes';

function mem(init: Record<string, string> = {}): StorageLike & { m: Map<string, string> } {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

const nullAnalytics: Analytics = { track: () => {}, sessionEvents: () => [] };
const noMeta: MetaBonuses = { towerLevels: { archer: 0, cannon: 0, frost: 0, lightning: 0, mage: 0, ballista: 0, flame: 0, alchemist: 0, catapult: 0, gale: 0, mine: 0, beacon: 0 }, castleHpBonus: 0, goldBonus: 0, heroPower: 0, heroId: null };

describe('save system', () => {
  it('migrates a v1 save all the way to the current version', () => {
    const d = migrate({ version: 1, gold: 123, stars: { L1: 3, L2: 1 } });
    expect(d.version).toBe(SAVE_VERSION);
    // v3 -> v4 compensates 25 coins per campaign level won.
    expect(d.coins).toBe(123 + 2 * 25);
    expect(d.base).toBeNull();
    expect(d.cosmetics.castle).toBe('castle_default');
  });

  it('migrates a v3 campaign save to the kingdom format', () => {
    const d = migrate({ version: 3, coins: 10, levels: { L1: { stars: 3, wins: 2, plays: 2, bestHp: 1 } }, meta: { castleHp: 2, startGold: 3, heroPower: 1 }, endless: {}, weekly: {} });
    expect(d.meta.warChest).toBe(3);
    expect(d.meta.castleHp).toBe(2);
    expect(d.coins).toBe(35);
    expect((d as unknown as Record<string, unknown>).levels).toBeUndefined();
    expect(d.progress.bestWave).toBe(0);
  });

  it('falls back to the backup when the main save is corrupt', () => {
    const storage = mem();
    const a = new SaveSystem(storage);
    a.data.coins = 42;
    a.save();
    a.data.coins = 50;
    a.save();
    storage.setItem(SAVE_KEY, '{not json');
    const b = new SaveSystem(storage);
    expect(b.recovered).toBe('backup');
    expect(b.data.coins).toBe(42);
  });

  it('resets when both main and backup are corrupt', () => {
    const s = new SaveSystem(mem({ [SAVE_KEY]: '[[[', [BACKUP_KEY]: 'nope' }));
    expect(s.recovered).toBe('reset');
    expect(s.data.coins).toBe(0);
  });

  it('round-trips the kingdom', () => {
    const storage = mem();
    const a = new SaveSystem(storage);
    const run = new Run({ snapshot: newKingdom(), meta: noMeta, availableTowers: ['archer'] });
    run.build([...run.unlockedSpots][0], 'archer');
    a.data.base = run.snapshot();
    a.save();
    const b = new SaveSystem(storage);
    expect(b.data.base?.towers).toHaveLength(1);
    expect(b.data.base?.towers[0].type).toBe('archer');
  });
});

describe('interstitial rules', () => {
  const base: InterstitialState = {
    winsSinceLast: 2, levelsCompleted: 40, sessionSeconds: 600, secondsSinceRewarded: Infinity, result: 'win', reviveOffered: false, removeAds: false,
  };
  it('shows when all rules pass', () => expect(evaluateInterstitial(base).show).toBe(true));
  it('never after a loss', () => expect(evaluateInterstitial({ ...base, result: 'loss' }).show).toBe(false));
  it('never early in the game', () => expect(evaluateInterstitial({ ...base, levelsCompleted: 20 }).show).toBe(false));
  it('never in the first 3 minutes', () => expect(evaluateInterstitial({ ...base, sessionSeconds: 120 }).show).toBe(false));
  it('skips after a recent rewarded ad', () => expect(evaluateInterstitial({ ...base, secondsSinceRewarded: 60 }).show).toBe(false));
  it('never after a revive offer or fall in the segment', () => expect(evaluateInterstitial({ ...base, reviveOffered: true }).show).toBe(false));
  it('only every 2nd checkpoint', () => expect(evaluateInterstitial({ ...base, winsSinceLast: 1 }).show).toBe(false));
  it('remove-ads disables it', () => expect(evaluateInterstitial({ ...base, removeAds: true }).show).toBe(false));
});

describe('economy', () => {
  it('uses base × 1.35^level for permanent upgrades', () => {
    expect(metaCost(100, 0)).toBe(100);
    expect(metaCost(100, 1)).toBe(135);
    expect(metaCost(100, 2)).toBe(182);
  });

  it('pays coins per wave and a bigger first-time checkpoint reward', () => {
    const save = new SaveSystem(mem());
    const meta = new Meta(save, nullAnalytics);
    expect(meta.recordWaveCleared(0)).toBeGreaterThan(0);
    expect(meta.bestWave()).toBe(1);
    const first = meta.recordCheckpoint(10);
    const again = meta.recordCheckpoint(10);
    expect(first.firstTime).toBe(true);
    expect(again.firstTime).toBe(false);
    expect(again.coins).toBeLessThan(first.coins);
    expect(checkpointCoins(20, true)).toBeGreaterThan(checkpointCoins(10, true));
    expect(save.data.chest.pendingMilestone).toBe(1);
  });

  it('daily login streak resets after a missed day', () => {
    const meta = new Meta(new SaveSystem(mem()), nullAnalytics);
    const d1 = new Date(2026, 0, 1, 12);
    expect(meta.claimDaily(d1)?.dayIndex).toBe(0);
    expect(meta.claimDaily(d1)).toBeNull();
    expect(meta.claimDaily(new Date(2026, 0, 2, 12))?.dayIndex).toBe(1);
    expect(meta.claimDaily(new Date(2026, 0, 4, 12))?.dayIndex).toBe(0);
  });

  it('caps the treasury at 8 hours', () => {
    const save = new SaveSystem(mem());
    const meta = new Meta(save, nullAnalytics);
    save.data.treasury.lastCollect = Date.now() - 20 * 3600000;
    const capped = meta.treasuryAmount();
    save.data.treasury.lastCollect = Date.now() - 8 * 3600000;
    expect(meta.treasuryAmount()).toBe(capped);
  });
});

describe('towers', () => {
  it('every upgrade is a stronger material, then star levels', () => {
    for (const def of Object.values(TOWERS)) {
      let prevDmg = 0;
      let prevCost = 0;
      for (let tier = 1; tier < MAX_LEVEL; tier++) {
        const st = towerStats(def, tier, tier > 3 ? 0 : -1);
        // Attackers grow in damage, the Gold Mine in income, the Beacon in its bonus.
        const power = st.damage || st.income || st.buff;
        expect(power).toBeGreaterThan(prevDmg);
        const c = upgradeCost(def, tier);
        expect(c).toBeGreaterThan(prevCost);
        prevDmg = power;
        prevCost = c;
      }
    }
    expect(levelName(1)).toBe('Wood');
    expect(levelName(2)).toBe('Stone');
    expect(levelName(MAX_TIER)).toBe('Celestial');
    expect(levelName(MAX_TIER + 2)).toBe('Celestial ★2');
  });
});

describe('kingdom siege', () => {
  it('has one map whose roads all end at the castle, with enough pads', () => {
    const map = kingdomMap();
    expect(map.classicSpots).toBeGreaterThanOrEqual(24);
    expect(map.classicSpots).toBeLessThanOrEqual(LAND.totalSpots);
    // Every other open grass square can be cleared and built on too.
    expect(map.buildSpots.length).toBeGreaterThan(LAND.totalSpots * 3);
    const keys = new Set(map.buildSpots.map((s) => `${s.col},${s.row}`));
    expect(keys.size).toBe(map.buildSpots.length);
    for (const s of map.buildSpots) expect(map.isPath(s.col, s.row)).toBe(false);
    for (const p of map.paths) {
      expect(p.xs[p.xs.length - 1]).toBe(map.castle.x);
      expect(p.zs[p.zs.length - 1]).toBe(map.castle.z);
    }
    expect(initialSpots()).toHaveLength(LAND.initialSpots);
  });

  it('opens new roads and Ages as waves progress', () => {
    // Kingdom Vale's two mirror-image roads are both open from the start, and stay the only two.
    expect(openRoads(0)).toEqual([0, 1]);
    expect(openRoads(500)).toEqual([0, 1]);
    setActiveMap('crooked');
    expect(openRoads(0)).toEqual([0]);
    expect(openRoads(MAP_BY_ID.crooked.roads[1].openWave)).toEqual([0, 1]);
    expect(openRoads(MAP_BY_ID.crooked.roads[2].openWave)).toEqual([0, 1, 2]);
    setActiveMap('vale');
    expect(ageOf(0)).toBe(0);
    expect(ageOf(SIEGE.ageEvery - 1)).toBe(0);
    expect(ageOf(SIEGE.ageEvery)).toBe(1);
  });

  it('every new Age starts on a checkpoint, so a fall never drops you back an Age', () => {
    expect(SIEGE.ageEvery % SIEGE.checkpointEvery).toBe(0);
    for (let w = 0; w < 200; w++) expect(ageOf(checkpointOf(w))).toBe(ageOf(w));
    // New roads open as an Age begins.
    for (const r of MAP_BY_ID.vale.roads) expect(r.openWave % SIEGE.ageEvery).toBe(0);
  });

  it('waves are deterministic, endless, and capped in enemy count', () => {
    expect(JSON.stringify(siegeWave(37))).toBe(JSON.stringify(siegeWave(37)));
    for (const n of [5, 50, 150, 400]) {
      const w = siegeWave(n);
      const count = w.groups.reduce((a, g) => a + g.count, 0);
      expect(count).toBeLessThanOrEqual(WAVE_COMPOSER.maxEnemiesPerWave + 4);
      expect(w.groups.every((g) => openRoads(n).includes(g.path))).toBe(true);
    }
    expect(siegeWave(9).boss).toBe(true);
    expect(siegeWave(300).hpMult).toBeGreaterThan(siegeWave(100).hpMult);
  });

  it('clearing land costs more each time and unlocks a pad', () => {
    expect(clearLandCost(1)).toBeGreaterThan(clearLandCost(0));
    const snap = newKingdom();
    snap.gold = 10000;
    const run = new Run({ snapshot: snap, meta: noMeta, availableTowers: ['archer'] });
    const locked = run.map.buildSpots.find((s) => !run.isSpotUnlocked(s.index))!;
    expect(run.build(locked.index, 'archer')).toBeNull();
    expect(run.clearLand(locked.index)).toBe(true);
    expect(run.build(locked.index, 'archer')).not.toBeNull();
  });

  it('falling keeps towers and gold and returns to the last checkpoint', () => {
    const snap = newKingdom();
    snap.wave = 23;
    snap.checkpoint = 20;
    const run = new Run({ snapshot: snap, meta: noMeta, availableTowers: ['archer'] });
    const t = run.build([...run.unlockedSpots][0], 'archer')!;
    run.upgrade(t);
    const gold = run.gold;
    // Thieves that slip through make off with some gold.
    let stolen = 0;
    run.events.on('goldStolen', ({ amount }) => (stolen += amount));
    run.callNextWave();
    for (let i = 0; i < 30 * 600 && run.state === 'playing'; i++) run.update(1 / 30);
    expect(run.state).toBe('lost');
    const to = run.retreat();
    expect(to).toBe(20);
    expect(run.waveIndex).toBe(20);
    expect(run.towers).toHaveLength(1);
    expect(run.towers[0].tier).toBe(2);
    expect(run.gold).toBeGreaterThanOrEqual(gold - stolen);
    expect(run.castleHp).toBe(run.castleMaxHp);
    expect(run.state).toBe('prep');
  });

  it('ballista bolts pierce through a line of enemies', () => {
    const snap = newKingdom();
    snap.gold = 10000;
    const run = new Run({ snapshot: snap, meta: noMeta, availableTowers: ['ballista'] });
    // Three enemies bunched together on the road, next to an unlocked pad.
    const spot = run.map.buildSpots.find((s) => run.isSpotUnlocked(s.index))!;
    let best = 0, bestD = Infinity;
    for (let d = 0; d < 30; d += 0.1) {
      const pt = run.map.pointAt(0, d, { x: 0, z: 0, dx: 0, dz: 0 });
      const dd = Math.hypot(pt.x - spot.x, pt.z - spot.z);
      if (dd < bestD) { bestD = dd; best = d; }
    }
    const foes = [0, 0.15, 0.3].map((o) => run.spawnEnemy('knight', 0, best + o, 0, 50));
    for (const e of foes) e.lane = 0;
    run.state = 'playing';
    expect(run.build(spot.index, 'ballista')).not.toBeNull();
    for (let i = 0; i < 30 && foes.some((e) => e.hp === e.maxHp); i++) run.update(1 / 30);
    expect(foes.every((e) => e.hp < e.maxHp)).toBe(true);
  });

  it('burning and poison keep dealing damage over time', () => {
    const run = new Run({ snapshot: newKingdom(), meta: noMeta, availableTowers: ['flame'] });
    const e = run.spawnEnemy('grunt', 0, 0, 0, 100);
    run.state = 'playing';
    (run as unknown as { applyDot: (...a: unknown[]) => void }).applyDot(e, 20, 2, 'magic', 'burn', -1);
    const hp0 = e.hp;
    // Ticks every 0.5 s: two ticks in just over a second.
    for (let i = 0; i < 35; i++) run.update(1 / 30);
    expect(hp0 - e.hp).toBeGreaterThan(15);
    for (let i = 0; i < 60; i++) run.update(1 / 30);
    expect(e.dotTimer).toBeLessThanOrEqual(0);
    const after = e.hp;
    for (let i = 0; i < 30; i++) run.update(1 / 30);
    expect(e.hp).toBe(after);
  });

  it('holds before a new Age / new road until the player is ready', () => {
    // Serpent Pass: its East Gate opens as the second Age begins.
    setActiveMap('serpent');
    const snap = newKingdom();
    snap.wave = SIEGE.ageEvery;
    snap.checkpoint = SIEGE.ageEvery;
    const run = new Run({ snapshot: snap, meta: noMeta, availableTowers: ['archer'], announceFrontiers: true });
    const seen: number[][] = [];
    run.events.on('frontier', (f) => seen.push(f.roads));
    run.callNextWave();
    expect(run.holdingFor).toBe(SIEGE.ageEvery);
    expect(seen).toEqual([[1]]);
    for (let i = 0; i < 300; i++) run.update(1 / 30);
    expect(run.waveIndex).toBe(SIEGE.ageEvery);
    expect(run.aliveCount()).toBe(0);
    run.continueFrontier();
    expect(run.waveIndex).toBe(SIEGE.ageEvery + 1);
    expect(run.holdingFor).toBe(-1);    setActiveMap('vale');
  });

  it('new hero abilities: quake slows, holy light heals the castle, shadow strike hits several', () => {
    const mk = (heroId: 'dwarf' | 'valkyrie' | 'ninja') => {
      const run = new Run({ snapshot: newKingdom(), meta: { ...noMeta, heroId }, availableTowers: ['archer'] });
      run.state = 'playing';
      const h = run.hero!;
      h.abilityCd = 0;
      const foes = [0, 1, 2].map(() => run.spawnEnemy('knight', 0, 3, 0, 20));
      for (const e of foes) { e.x = h.x + 0.3; e.z = h.z; }
      return { run, h, foes };
    };
    const q = mk('dwarf');
    expect(q.run.useHeroAbility()).toBe(true);
    expect(q.foes.every((e) => e.slowFactor < 1 && e.hp < e.maxHp)).toBe(true);

    const v = mk('valkyrie');
    v.run.castleHp = 10;
    expect(v.run.useHeroAbility()).toBe(true);
    expect(v.run.castleHp).toBe(13);

    const n = mk('ninja');
    n.foes.forEach((e, i) => { e.x = n.h.x + 1 + i; });
    expect(n.run.useHeroAbility()).toBe(true);
    expect(n.foes.every((e) => e.hp < e.maxHp)).toBe(true);
    expect(Math.hypot(n.h.x - n.foes[0].x, n.h.z - n.foes[0].z)).toBeLessThan(3.5);
  });

  it('barricades stop ground enemies until smashed, flyers pass over', () => {
    const snap = newKingdom();
    snap.gold = 5000;
    const run = new Run({ snapshot: snap, meta: noMeta, availableTowers: ['archer'] });
    run.state = 'playing';
    // First open road tile a few steps from the tunnel.
    const p = run.map.paths[0];
    const pt = run.map.pointAt(0, 3, { x: 0, z: 0, dx: 0, dz: 0 });
    const col = Math.round(pt.x + (run.map.size - 1) / 2), row = Math.round(pt.z + (run.map.size - 1) / 2);
    expect(run.isOpenRoadTile(col, row)).toBe(true);
    const wall = run.placeBarricade(col, row)!;
    expect(wall).not.toBeNull();
    const grunt = run.spawnEnemy('grunt', 0, 1.5, 0, 1);
    const bat = run.spawnEnemy('bat', 0, 1.5, 0, 1);
    for (let i = 0; i < 90; i++) run.update(1 / 30);
    expect(grunt.dist).toBeLessThan(3);
    expect(bat.dist).toBeGreaterThan(3);
    expect(wall.hp).toBeLessThan(wall.maxHp);
    for (let i = 0; i < 30 * 60 && run.barricades.length; i++) run.update(1 / 30);
    expect(run.barricades).toHaveLength(0);
    for (let i = 0; i < 30; i++) run.update(1 / 30);
    expect(grunt.dist).toBeGreaterThan(3);
    void p;
  });

  it('elites are tougher and split / regenerate', () => {
    const run = new Run({ snapshot: newKingdom(), meta: noMeta, availableTowers: ['archer'] });
    run.state = 'playing';
    const e = run.spawnEnemy('grunt', 0, 1, 0, 1);
    const hp = e.maxHp;
    run.makeElite(e, 'splitter');
    expect(e.maxHp).toBeGreaterThan(hp * 2);
    const before = run.aliveCount();
    run.damage(e, 1e6, 'magic');
    expect(run.aliveCount()).toBe(before - 1 + 2);
  });

  it('towers close together form synergies that boost their stats', () => {
    const snap = newKingdom();
    snap.gold = 10000;
    const run = new Run({ snapshot: snap, meta: noMeta, availableTowers: ['frost', 'cannon', 'archer', 'mage'] });
    const pads = run.map.buildSpots;
    // Find two pads within synergy range.
    let pair: [number, number] | null = null;
    for (const a of pads) for (const b of pads) if (!pair && a !== b && Math.hypot(a.x - b.x, a.z - b.z) <= 2.3) pair = [a.index, b.index];
    expect(pair).not.toBeNull();
    for (const i of pair!) run.unlockedSpots.add(i);
    const archer = run.build(pair![0], 'archer')!;
    const base = archer.stats.damage;
    const seen: string[] = [];
    run.events.on('synergy', (e) => seen.push(e.synergy));
    run.build(pair![1], 'mage');
    expect(seen).toEqual(['enchanted']);
    expect(archer.synergies).toContain('enchanted');
    expect(archer.stats.damage).toBeCloseTo(base * 1.3);
    run.sell(run.towers[1]);
    expect(archer.synergies).toHaveLength(0);
    expect(archer.stats.damage).toBeCloseTo(base);
  });

  it('heroes level up with XP and get stronger', () => {
    expect(heroLevelFor(0)).toBe(1);
    expect(heroLevelFor(xpForLevel(5))).toBe(5);
    expect(heroLevelFor(1e9)).toBe(HERO_LEVELS.max);
    expect(gearTierFor(10)).toBe(2);
    const lo = new Run({ snapshot: newKingdom(), meta: { ...noMeta, heroId: 'ranger', heroLevel: 1 }, availableTowers: ['archer'] });
    const hi = new Run({ snapshot: newKingdom(), meta: { ...noMeta, heroId: 'ranger', heroLevel: 20 }, availableTowers: ['archer'] });
    expect(hi.hero!.maxHp).toBeGreaterThan(lo.hero!.maxHp * 2);
    expect(hi.hero!.damage).toBeGreaterThan(lo.hero!.damage * 1.9);
  });

  it('achievements unlock once and pay out', () => {
    const save = new SaveSystem(mem());
    const meta = new Meta(save, nullAnalytics);
    const coins = meta.d.coins;
    meta.d.stats.kills = 600;
    const got = meta.checkAchievements().map((a) => a.id);
    expect(got).toEqual(expect.arrayContaining(['kills1', 'kills500']));
    expect(meta.d.coins).toBeGreaterThan(coins);
    expect(meta.checkAchievements()).toHaveLength(0);
  });

  it('sell refunds 70% of the investment', () => {
    const run = new Run({ snapshot: newKingdom(), meta: noMeta, availableTowers: ['archer'] });
    const t = run.build([...run.unlockedSpots][0], 'archer')!;
    expect(run.sellValue(t)).toBe(Math.floor(70 * 0.7));
  });

  it('snapshots restore the same kingdom', () => {
    const snap = newKingdom();
    snap.gold = 5000;
    const a = new Run({ snapshot: snap, meta: noMeta, availableTowers: ['archer', 'cannon'] });
    const spots = [...a.unlockedSpots];
    a.build(spots[0], 'archer');
    a.build(spots[1], 'cannon');
    a.upgrade(a.towers[1]);
    const b = new Run({ snapshot: a.snapshot(), meta: noMeta, availableTowers: ['archer', 'cannon'] });
    expect(b.towers.map((t) => [t.def.id, t.tier, t.spot])).toEqual(a.towers.map((t) => [t.def.id, t.tier, t.spot]));
    expect(b.gold).toBe(Math.floor(a.gold));
  });
});

describe('roads per realm', () => {
  it('a realm never has more roads than its place in the list', () => {
    MAPS.forEach((m, i) => expect(m.roads.length, m.id).toBeLessThanOrEqual(Math.max(1, i + 1)));
    expect(MAP_BY_ID.vale.roads).toHaveLength(2);
  });

  it('moves a kingdom saved on the old layout onto the new one, square by square', () => {
    const oldMap = buildRealmMap(MAP_BY_ID.vale, LAYOUTS[4].vale!.roads, false);
    const newMap = kingdomMap('vale');
    const tile = (m: typeof oldMap, i: number) => `${m.buildSpots[i].col},${m.buildSpots[i].row}`;
    // Towers on pads beside the West Road (which stays) and a hero on another pad.
    const pads = oldMap.buildSpots.filter((s) => oldMap.isClassic(s.index)).slice(0, 4).map((s) => s.index);
    const base = { ...newKingdom(), wave: 37, checkpoint: 30, spots: pads, heroPost: pads[3], towers: pads.slice(0, 3).map((spot) => ({ spot, type: 'archer' as const, tier: 2, branch: -1, kills: 5 })),
      barricades: [{ col: 12, row: 3, hp: 10, maxHp: 10 }, { col: 1, row: 6, hp: 10, maxHp: 10 }] };
    const v4 = { version: 4, base, realms: { current: 'vale', saved: {}, best: {} } };
    const d = migrate(v4 as never);
    expect(d.version).toBe(SAVE_VERSION);
    const nb = d.base!;
    expect(nb.wave).toBe(37);
    // No tower is lost: each stays on its square, or moves to the nearest free one if a road now runs there.
    expect(nb.towers).toHaveLength(3);
    pads.slice(0, 3).forEach((old, k) => {
      const [c, r] = tile(oldMap, old).split(',').map(Number);
      if (!newMap.isPath(c, r)) expect(tile(newMap, nb.towers[k].spot)).toBe(tile(oldMap, old));
    });
    expect(new Set(nb.towers.map((t) => t.spot)).size).toBe(3);
    const [hc, hr] = tile(oldMap, pads[3]).split(',').map(Number);
    if (!newMap.isPath(hc, hr)) expect(tile(newMap, nb.heroPost!)).toBe(tile(oldMap, pads[3]));
    for (const t of nb.towers) expect(nb.spots).toContain(t.spot);
    // The barricade on the old North-East Road comes down; the one on the West Road stays.
    expect(nb.barricades).toEqual([{ col: 1, row: 6, hp: 10, maxHp: 10 }]);
  });

  it('moves version-5 kingdoms in The Gauntlet onto the corner-keep layout', () => {
    const oldMap = buildRealmMap(MAP_BY_ID.gauntlet, LAYOUTS[5].gauntlet!.roads, false);
    const newMap = kingdomMap('gauntlet');
    const tile = (m: typeof oldMap, i: number) => `${m.buildSpots[i].col},${m.buildSpots[i].row}`;
    // A pad beside the first straight, far from anything that moved.
    const pad = oldMap.buildSpots.find((s) => oldMap.isClassic(s.index) && s.row === 0)!.index;
    const base = { ...newKingdom(), wave: 22, spots: [pad], towers: [{ spot: pad, type: 'cannon' as const, tier: 1, branch: -1, kills: 0 }],
      barricades: [{ col: 15, row: 17, hp: 5, maxHp: 5 }] };
    const v5 = { version: 5, base: null, realms: { current: 'vale', saved: { gauntlet: { base, checkpointsPaid: 2, frontierSeen: 0 } }, best: { vale: 40, gauntlet: 22 } } };
    const d = migrate(v5 as never);
    const nb = d.realms.saved.gauntlet!.base!;
    expect(tile(newMap, nb.towers[0].spot)).toBe(tile(oldMap, pad));
    // The road now runs on to the corner keep, so that barricade still stands on it.
    expect(nb.barricades).toEqual([{ col: 15, row: 17, hp: 5, maxHp: 5 }]);
  });
});

describe('the two-road Kingdom Vale', () => {
  it('a tower on a square the East Road now crosses moves to the nearest free square', () => {
    const v6 = LAYOUTS[6].vale!;
    const oldMap = buildRealmMap(MAP_BY_ID.vale, v6.roads, v6.wide);
    const newMap = kingdomMap('vale');
    const onRoad = oldMap.buildSpots.find((s) => newMap.isPath(s.col, s.row))!;
    const safe = oldMap.buildSpots.find((s) => !newMap.isPath(s.col, s.row) && s.col < 4)!;
    const base = { ...newKingdom(), wave: 15, spots: [onRoad.index, safe.index], heroPost: onRoad.index,
      towers: [onRoad, safe].map((s) => ({ spot: s.index, type: 'archer' as const, tier: 1, branch: -1, kills: 0 })) };
    const d = migrate({ version: 6, base, realms: { current: 'vale', saved: {}, best: { vale: 15 } } } as never);
    const nb = d.base!;
    expect(nb.towers).toHaveLength(2);
    const moved = newMap.buildSpots[nb.towers[0].spot];
    expect(newMap.isPath(moved.col, moved.row)).toBe(false);
    expect(Math.max(Math.abs(moved.col - onRoad.col), Math.abs(moved.row - onRoad.row))).toBeLessThanOrEqual(2);
    expect(`${newMap.buildSpots[nb.towers[1].spot].col},${newMap.buildSpots[nb.towers[1].spot].row}`).toBe(`${safe.col},${safe.row}`);
    expect(nb.heroPost).toBe(-1);
  });
});

describe('Serpent Pass with its keep in the corner', () => {
  it('keeps every tower when a version-7 kingdom moves onto the new layout', () => {
    const v7 = LAYOUTS[7].serpent!;
    const oldMap = buildRealmMap(MAP_BY_ID.serpent, v7.roads, v7.wide);
    const newMap = kingdomMap('serpent');
    const pads = oldMap.buildSpots.filter((s) => oldMap.isClassic(s.index)).slice(0, 5);
    const base = { ...newKingdom(), wave: 33, spots: pads.map((s) => s.index), towers: pads.map((s) => ({ spot: s.index, type: 'mage' as const, tier: 2, branch: -1, kills: 3 })) };
    const d = migrate({ version: 7, base: null, realms: { current: 'vale', saved: { serpent: { base, checkpointsPaid: 3, frontierSeen: 20 } }, best: { serpent: 33 } } } as never);
    const nb = d.realms.saved.serpent!.base!;
    expect(nb.towers).toHaveLength(5);
    for (const t of nb.towers) {
      const s = newMap.buildSpots[t.spot];
      expect(newMap.isPath(s.col, s.row)).toBe(false);
    }
    expect(newMap.castle).toMatchObject({ col: 2, row: 12 });
  });
});

describe('realms 5 to 10', () => {
  it('no road is under 18 squares, and roads only meet at the castle', () => {
    for (const m of MAPS) {
      setActiveMap(m.id);
      const map = kingdomMap();
      const seen = new Map<string, number>();
      m.roads.forEach((r, i) => {
        let tiles = 0;
        for (let k = 1; k < r.points.length; k++) {
          const [a, b] = r.points[k - 1], [c, d] = r.points[k];
          const n = Math.abs(c - a) + Math.abs(d - b);
          for (let t = k === 1 ? 0 : 1; t <= n; t++) {
            const x = a + Math.sign(c - a) * t, y = b + Math.sign(d - b) * t;
            if (x < 0 || y < 0 || x >= map.size || y >= map.size) continue;
            tiles++;
            const key = `${x},${y}`;
            if (x !== map.castle.col || y !== map.castle.row) {
              // From realm 5 on, roads share nothing but the castle square.
              if (seen.has(key) && seen.get(key) !== i && MAPS.indexOf(m) >= 4) expect.fail(`${m.id}: ${r.name} overlaps another road at ${key}`);
              seen.set(key, i);
            }
          }
        }
        if (MAPS.indexOf(m) >= 3) expect(tiles, `${m.id} ${r.name}`).toBeGreaterThanOrEqual(18);
      });
    }
    setActiveMap('vale');
  });

  it('a version-8 Twin Rivers kingdom moves onto the bigger Pinwheel Keep board', () => {
    const v8 = LAYOUTS[8].twin!;
    const oldMap = buildRealmMap({ ...MAP_BY_ID.twin, size: v8.size }, v8.roads, v8.wide);
    const pads = oldMap.buildSpots.filter((s) => oldMap.isClassic(s.index)).slice(0, 4);
    const base = { ...newKingdom(), wave: 41, spots: pads.map((s) => s.index), towers: pads.map((s) => ({ spot: s.index, type: 'frost' as const, tier: 1, branch: -1, kills: 0 })) };
    const d = migrate({ version: 8, base: null, realms: { current: 'vale', saved: { twin: { base, checkpointsPaid: 4, frontierSeen: 40 } }, best: { twin: 41 } } } as never);
    const nb = d.realms.saved.twin!.base!;
    expect(nb.towers).toHaveLength(4);
    expect(nb.wave).toBe(41);
  });
});

describe('ads privacy and developer mode', () => {
  it('new saves have developer mode off and the personalised-ads question unanswered', () => {
    const s = new SaveSystem(mem());
    expect(s.data.settings.devMode).toBe(false);
    expect(s.data.settings.personalisedAds).toBeNull();
  });

  it('the personalised-ads choice reaches the ad network, and the website mock ignores it', async () => {
    const seen: boolean[] = [];
    const real = new AdManager({ init: async () => {}, isRewardedReady: () => true, showRewarded: async () => 'completed', isInterstitialReady: () => true, showInterstitial: async () => {}, setPersonalised: (on) => seen.push(on) }, nullAnalytics, { onOpen() {}, onClose() {}, toast() {} });
    expect(real.real).toBe(true);
    real.setPersonalised(true);
    real.setPersonalised(false);
    expect(seen).toEqual([true, false]);
    const mock = new AdManager({ init: async () => {}, isRewardedReady: () => true, showRewarded: async () => 'completed', isInterstitialReady: () => true, showInterstitial: async () => {} }, nullAnalytics, { onOpen() {}, onClose() {}, toast() {} });
    expect(mock.real).toBe(false);
    expect(() => mock.setPersonalised(true)).not.toThrow();
  });
});
