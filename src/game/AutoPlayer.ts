// Simple heuristic AI used by the headless balance simulator (and the debug "autoplay").
// Greedy: builds on the pads that cover the most open road, clears land when out of pads,
// and spends the rest on the cheapest upgrade.

import { TOWERS, BRANCH_TIER, type TowerId } from '../data/towers';
import { Random } from '../core/Random';
import { openRoads } from './Siege';
import type { Run, Tower } from './Run';

export class AutoPlayer {
  private think = 0;
  private rng: Random;
  private cycleIdx = 0;
  private valueCache = new Map<string, number[]>();

  constructor(private run: Run, seed: number, private skill = 1) {
    this.rng = new Random(seed);
  }

  /** Coverage of each spot for the roads that are open now (and soon). */
  private spotValues(): number[] {
    const roads = openRoads(this.run.waveIndex + 3);
    const key = roads.join(',');
    let v = this.valueCache.get(key);
    if (!v) {
      const map = this.run.map;
      v = map.buildSpots.map((s) => roads.reduce((a, r) => a + map.spotCoverage(s, r, 2.9), 0) * (0.9 + this.rng.next() * 0.2));
      this.valueCache.set(key, v);
    }
    return v;
  }

  private cycle(): TowerId[] {
    const avail = (['archer', 'cannon', 'mage', 'frost', 'ballista', 'lightning', 'flame', 'archer', 'alchemist', 'cannon'] as TowerId[]).filter((t) => this.run.isTowerAvailable(t));
    return avail.length ? avail : ['archer'];
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

  private best(filter: (spot: number) => boolean): number {
    const values = this.spotValues();
    let best = -1;
    let bv = 0.5;
    this.run.map.buildSpots.forEach((s, i) => {
      if (!filter(s.index)) return;
      if (values[i] > bv) {
        bv = values[i];
        best = i;
      }
    });
    return best;
  }

  private act(): void {
    const run = this.run;
    for (let guard = 0; guard < 8; guard++) {
      const cycle = this.cycle();
      const nextType = cycle[this.cycleIdx % cycle.length];
      const free = this.best((i) => run.isSpotUnlocked(i) && !run.towerAt(i));
      const land = free < 0 ? this.best((i) => !run.isSpotUnlocked(i)) : -1;
      let up: Tower | null = null;
      let upCost = Infinity;
      for (const t of run.towers) {
        const c = run.upgradeCost(t);
        if (c !== null && c < upCost) {
          upCost = c;
          up = t;
        }
      }
      const wantsTower = free >= 0 && (run.towers.length < 4 || this.rng.next() < 0.55 * this.skill);
      if (wantsTower && run.gold >= TOWERS[nextType].cost && run.build(free, nextType)) {
        this.cycleIdx++;
        continue;
      }
      // Clearing land competes with upgrades: take it when it is cheaper than the next upgrade.
      if (land >= 0 && run.clearLandCost() <= upCost * 1.2 && run.gold >= run.clearLandCost() + TOWERS[nextType].cost) {
        run.clearLand(land);
        continue;
      }
      if (up && run.gold >= upCost && !(wantsTower && run.gold < upCost + TOWERS[nextType].cost && run.towers.length < 6)) {
        run.upgrade(up, up.tier === BRANCH_TIER ? this.rng.int(0, 1) : -1);
        continue;
      }
      break;
    }
  }
}
