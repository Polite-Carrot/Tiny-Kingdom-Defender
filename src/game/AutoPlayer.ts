// Simple heuristic AI used by the headless balance simulator.
// Greedy: builds on the spots that cover the most path, then upgrades.

import { TOWERS, type TowerId } from '../data/towers';
import { Random } from '../core/Random';
import type { Run, Tower } from './Run';

export class AutoPlayer {
  private spotValue: number[];
  private think = 0;
  private rng: Random;
  private buildCycle: TowerId[];
  private cycleIdx = 0;

  constructor(private run: Run, seed: number, private skill = 1) {
    this.rng = new Random(seed);
    const map = run.map;
    // Coverage of each spot: number of path samples within ~3 tiles.
    this.spotValue = map.buildSpots.map((s) => {
      let v = 0;
      map.paths.forEach((p, pi) => {
        const pt = { x: 0, z: 0, dx: 0, dz: 0 };
        for (let d = 0; d < p.length; d += 0.25) {
          map.pointAt(pi, d, pt);
          if ((pt.x - s.x) ** 2 + (pt.z - s.z) ** 2 <= 2.9 * 2.9) v += 1 + d / p.length; // prefer near castle
        }
      });
      return v * (0.9 + this.rng.next() * 0.2);
    });
    const avail = (['archer', 'cannon', 'archer', 'frost', 'lightning', 'cannon', 'archer'] as TowerId[]).filter((t) => run.isTowerAvailable(t));
    this.buildCycle = avail.length ? avail : (['archer', 'cannon', 'frost', 'lightning'] as TowerId[]).filter((t) => run.isTowerAvailable(t));
  }

  update(dt: number): void {
    const run = this.run;
    if (run.state === 'prep') {
      this.act();
      run.callNextWave();
      return;
    }
    this.think -= dt;
    if (this.think > 0) return;
    this.think = 0.5;
    this.act();
    if (run.heroAbilityReady()) run.useHeroAbility();
  }

  private bestFreeSpot(): number {
    let best = -1;
    let bv = -1;
    this.run.map.buildSpots.forEach((s, i) => {
      if (this.run.towerAt(s.index)) return;
      if (this.spotValue[i] > bv) {
        bv = this.spotValue[i];
        best = i;
      }
    });
    return best;
  }

  private act(): void {
    const run = this.run;
    for (let guard = 0; guard < 6; guard++) {
      const spot = this.bestFreeSpot();
      const nextType = this.buildCycle[this.cycleIdx % this.buildCycle.length];
      const towers = run.towers;
      // Upgrade candidate: cheapest upgrade among valuable towers.
      let up: Tower | null = null;
      let upCost = Infinity;
      for (const t of towers) {
        const c = run.upgradeCost(t);
        if (c !== null && c < upCost) {
          upCost = c;
          up = t;
        }
      }
      const buildFirst = spot >= 0 && (towers.length < 4 || towers.length < run.map.buildSpots.length * 0.75 * this.skill && this.rng.next() < 0.6);
      if (buildFirst && run.gold >= TOWERS[nextType].cost) {
        if (run.build(spot, nextType)) {
          this.cycleIdx++;
          continue;
        }
      }
      if (up && run.gold >= upCost && (!buildFirst || spot < 0)) {
        run.upgrade(up, up.tier === 3 ? this.rng.int(0, 1) : -1);
        continue;
      }
      if (spot >= 0 && run.gold >= TOWERS[nextType].cost && !up) {
        if (run.build(spot, nextType)) {
          this.cycleIdx++;
          continue;
        }
      }
      break;
    }
  }
}
