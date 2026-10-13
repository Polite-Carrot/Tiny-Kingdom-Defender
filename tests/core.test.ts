import { describe, it, expect } from 'vitest';
import { SaveSystem, migrate, SAVE_KEY, BACKUP_KEY, SAVE_VERSION, type StorageLike } from '../src/core/Save';
import { evaluateInterstitial, type InterstitialState } from '../src/ads/AdManager';
import { metaCost } from '../src/data/economy';
import { buildCampaignLevel, buildWeeklyLevel, buildEndlessLevel, weekKey, allCampaignLevels } from '../src/game/Levels';
import { LevelMap } from '../src/game/LevelMap';
import { Run } from '../src/game/Run';
import { Meta } from '../src/game/Meta';
import { CHAPTERS } from '../src/data/levels';
import type { Analytics } from '../src/analytics/Analytics';

function mem(init: Record<string, string> = {}): StorageLike & { m: Map<string, string> } {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

const nullAnalytics: Analytics = { track: () => {}, sessionEvents: () => [] };

describe('save system', () => {
  it('migrates a v1 save to the current version', () => {
    const d = migrate({ version: 1, gold: 123, stars: { L1: 3, L2: 1 } });
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.coins).toBe(123);
    expect(d.levels.L1.stars).toBe(3);
    expect(d.levels.L2.wins).toBe(1);
    expect(d.cosmetics.castle).toBe('castle_default');
    expect(d.endless.bestWave).toBe(0);
  });

  it('falls back to the backup when the main save is corrupt', () => {
    const storage = mem();
    const a = new SaveSystem(storage);
    a.data.coins = 42;
    a.save();
    a.data.coins = 50;
    a.save(); // backup now holds coins=42
    storage.setItem(SAVE_KEY, '{not json');
    const b = new SaveSystem(storage);
    expect(b.recovered).toBe('backup');
    expect(b.data.coins).toBe(42);
  });

  it('resets when both main and backup are corrupt', () => {
    const storage = mem({ [SAVE_KEY]: '[[[', [BACKUP_KEY]: 'nope' });
    const s = new SaveSystem(storage);
    expect(s.recovered).toBe('reset');
    expect(s.data.coins).toBe(0);
  });

  it('round-trips progress', () => {
    const storage = mem();
    const a = new SaveSystem(storage);
    a.data.levels.L1 = { stars: 2, wins: 1, plays: 2, bestHp: 0.7 };
    a.save();
    const b = new SaveSystem(storage);
    expect(b.data.levels.L1.stars).toBe(2);
  });
});

describe('interstitial rules', () => {
  const base: InterstitialState = {
    winsSinceLast: 3, levelsCompleted: 10, sessionSeconds: 600, secondsSinceRewarded: Infinity, result: 'win', reviveOffered: false, removeAds: false,
  };
  it('shows when all rules pass', () => expect(evaluateInterstitial(base).show).toBe(true));
  it('never after a loss', () => expect(evaluateInterstitial({ ...base, result: 'loss' }).show).toBe(false));
  it('never in the first 5 levels', () => expect(evaluateInterstitial({ ...base, levelsCompleted: 4 }).show).toBe(false));
  it('never in the first 3 minutes', () => expect(evaluateInterstitial({ ...base, sessionSeconds: 120 }).show).toBe(false));
  it('skips after a recent rewarded ad', () => expect(evaluateInterstitial({ ...base, secondsSinceRewarded: 60 }).show).toBe(false));
  it('never after a revive offer', () => expect(evaluateInterstitial({ ...base, reviveOffered: true }).show).toBe(false));
  it('only every 3rd win', () => expect(evaluateInterstitial({ ...base, winsSinceLast: 2 }).show).toBe(false));
  it('remove-ads disables it', () => expect(evaluateInterstitial({ ...base, removeAds: true }).show).toBe(false));
});

describe('economy', () => {
  it('uses base × 1.35^level', () => {
    expect(metaCost(100, 0)).toBe(100);
    expect(metaCost(100, 1)).toBe(135);
    expect(metaCost(100, 2)).toBe(182);
  });

  it('pays 40-60 per win, 30% on loss, star bonus once', () => {
    const save = new SaveSystem(mem());
    const meta = new Meta(save, nullAnalytics);
    const first = meta.levelReward(0, true, 3);
    expect(first.base).toBeGreaterThanOrEqual(40);
    expect(first.starBonus).toBeGreaterThan(0);
    meta.recordLevel(0, true, 3, 1);
    const again = meta.levelReward(0, true, 3);
    expect(again.starBonus).toBe(0);
    const last = meta.levelReward(59, true, 1);
    expect(last.base).toBeLessThanOrEqual(60);
    const loss = meta.levelReward(0, false, 0);
    expect(loss.total).toBe(Math.round(first.base * 0.3));
  });

  it('daily login streak resets after a missed day', () => {
    const save = new SaveSystem(mem());
    const meta = new Meta(save, nullAnalytics);
    const d1 = new Date(2026, 0, 1, 12);
    const d2 = new Date(2026, 0, 2, 12);
    const d4 = new Date(2026, 0, 4, 12);
    expect(meta.claimDaily(d1)?.dayIndex).toBe(0);
    expect(meta.claimDaily(d1)).toBeNull();
    expect(meta.claimDaily(d2)?.dayIndex).toBe(1);
    expect(meta.claimDaily(d4)?.dayIndex).toBe(0);
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

describe('levels', () => {
  it('builds 60 campaign levels with 8-12 waves and bosses every 5th', () => {
    const all = allCampaignLevels();
    expect(all).toHaveLength(60);
    for (const l of all) {
      expect(l.waves.length).toBeGreaterThanOrEqual(8);
      expect(l.waves.length).toBeLessThanOrEqual(12);
      expect(l.isBoss).toBe((l.indexInChapter + 1) % 5 === 0);
      if (l.isBoss) expect(l.waves[l.waves.length - 1].boss).toBe(true);
    }
  });

  it('every level map has paths ending at the castle and enough build spots', () => {
    for (const l of allCampaignLevels()) {
      const map = new LevelMap(l.layout, l.buildSpots, l.seed, CHAPTERS[l.chapter].theme.props);
      expect(map.buildSpots.length).toBeGreaterThanOrEqual(8);
      for (const p of map.paths) {
        expect(p.xs[p.xs.length - 1]).toBe(map.castle.x);
        expect(p.zs[p.zs.length - 1]).toBe(map.castle.z);
      }
    }
  });

  it('weekly challenge is deterministic per week', () => {
    const a = buildWeeklyLevel(new Date(2026, 9, 13));
    const b = buildWeeklyLevel(new Date(2026, 9, 14));
    expect(weekKey(new Date(2026, 9, 13))).toBe(weekKey(new Date(2026, 9, 14)));
    expect(a.modifier?.id).toBe(b.modifier?.id);
    expect(JSON.stringify(a.waves)).toBe(JSON.stringify(b.waves));
  });

  it('endless waves scale up indefinitely', () => {
    const lvl = buildEndlessLevel();
    const count = (n: number) => lvl.endlessWave!(n).groups.reduce((a, g) => a + g.count, 0);
    expect(count(30)).toBeGreaterThan(count(1));
    expect(lvl.endlessWave!(60).hpMult).toBeGreaterThan(lvl.endlessWave!(5).hpMult);
  });
});

describe('run simulation', () => {
  it('a level with no towers is lost and gives a defeat', () => {
    const run = new Run({
      level: buildCampaignLevel(0),
      meta: { towerLevels: { archer: 0, cannon: 0, frost: 0, lightning: 0 }, castleHpBonus: 0, startGoldBonus: 0, heroPower: 0, heroId: null },
      availableTowers: ['archer'],
      allowSpecialisation: false,
    });
    run.callNextWave();
    for (let i = 0; i < 60 * 600 && run.state === 'playing'; i++) run.update(1 / 30);
    expect(run.state).toBe('lost');
  });

  it('sell refunds 70% of investment', () => {
    const run = new Run({
      level: buildCampaignLevel(0),
      meta: { towerLevels: { archer: 0, cannon: 0, frost: 0, lightning: 0 }, castleHpBonus: 0, startGoldBonus: 0, heroPower: 0, heroId: null },
      availableTowers: ['archer'],
      allowSpecialisation: true,
    });
    const t = run.build(0, 'archer')!;
    expect(run.sellValue(t)).toBe(Math.floor(70 * 0.7));
  });
});
