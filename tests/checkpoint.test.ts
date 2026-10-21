import { describe, it, expect } from 'vitest';
import { Run, newKingdom, type MetaBonuses } from '../src/game/Run';

const noMeta: MetaBonuses = { towerLevels: { archer: 0, cannon: 0, frost: 0, lightning: 0, mage: 0, ballista: 0, flame: 0, alchemist: 0, catapult: 0, gale: 0, mine: 0, beacon: 0 }, castleHpBonus: 0, goldBonus: 0, heroPower: 0, heroId: null };
const STEP = 1 / 30;

/** A siege at wave 8 with the checkpoint break on. Enemies of `slowWave` survive until `slowUntil`. */
function siege(slowWave: number, slowUntil: number) {
  const snap = newKingdom();
  snap.wave = 7;
  snap.checkpoint = 0;
  const run = new Run({ snapshot: snap, meta: noMeta, availableTowers: ['archer'] });
  run.holdAtCheckpoints = true;
  const events: { t: number; wave: number; alive: number; index: number }[] = [];
  run.events.on('checkpoint', ({ wave }) => events.push({ t: run.time, wave, alive: run.aliveCount(), index: run.waveIndex }));
  // Enemies still on the field when the checkpoint wave itself is cleared.
  const atClear = { t: -1, alive: -1 };
  run.events.on('waveCleared', ({ index }) => { if (index === 9) Object.assign(atClear, { t: run.time, alive: run.aliveCount() }); });
  run.callNextWave();
  const step = () => {
    run.castleHp = run.castleMaxHp;
    for (const e of run.enemies) if (e.alive && !e.hidden && (e.wave !== slowWave || run.time > slowUntil)) run.damage(e, 1e9, 'magic');
    // Call waves early whenever allowed, like an impatient player.
    run.callNextWave();
    run.update(STEP);
  };
  return { run, events, step, atClear };
}

describe('checkpoint break', () => {
  it('sends no wave past the checkpoint, and only announces it once the field is clear', () => {
    // Wave 8 (index 7) stragglers outlive the checkpoint wave itself (index 9).
    const { run, events, step, atClear } = siege(7, 1e9);
    let maxIndex = 0;
    for (let i = 0; i < 30 * 240 && !events.length; i++) {
      step();
      maxIndex = Math.max(maxIndex, run.waveIndex);
    }
    expect(events).toHaveLength(1);
    expect(events[0].wave).toBe(10);
    expect(atClear.alive).toBeGreaterThan(0);
    expect(events[0].alive).toBe(0);
    expect(events[0].t).toBeGreaterThan(atClear.t);
    expect(maxIndex).toBe(10);
  });

  it('holds the next wave until the player moves on from the checkpoint', () => {
    const { run, events, step } = siege(-1, 0);
    for (let i = 0; i < 30 * 240 && !events.length; i++) step();
    expect(events).toHaveLength(1);
    for (let i = 0; i < 30 * 60; i++) step();
    expect(run.waveIndex).toBe(10);
    expect(run.waitingForCheckpoint).toBe(true);
    run.resumeAfterCheckpoint();
    for (let i = 0; i < 30 * 5; i++) step();
    expect(run.waveIndex).toBe(11);
  });

  it('awards an unannounced checkpoint when a save is restored right at it', () => {
    const snap = newKingdom();
    snap.wave = 10;
    snap.checkpoint = 0;
    const run = new Run({ snapshot: snap, meta: noMeta, availableTowers: ['archer'] });
    run.holdAtCheckpoints = true;
    const got: number[] = [];
    run.events.on('checkpoint', ({ wave }) => got.push(wave));
    run.callNextWave();
    run.update(STEP);
    expect(got).toEqual([10]);
    run.resumeAfterCheckpoint();
    run.callNextWave();
    for (let i = 0; i < 30 * 2; i++) run.update(STEP);
    expect(run.waveIndex).toBe(11);
  });

  it('is off by default (balance simulator, Daily Challenge)', () => {
    const run = new Run({ snapshot: newKingdom(), meta: noMeta, availableTowers: ['archer'] });
    expect(run.holdAtCheckpoints).toBe(false);
  });
});
