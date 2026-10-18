// Turns the kingdom's road layout into world-space paths, build spots and decorative props.
// Pure logic: no rendering imports so the headless simulator can use it.

import { GRID_SIZE, type Waypoint } from '../data/base';
import { Random } from '../core/Random';

export interface PathData {
  /** World-space points (x, z). */
  xs: number[];
  zs: number[];
  /** Cumulative length at each point. */
  cum: number[];
  length: number;
}

export interface BuildSpot {
  index: number;
  col: number;
  row: number;
  x: number;
  z: number;
}

export interface Prop {
  /** 0..1, picks the prop type from the current theme's list. */
  variant: number;
  x: number;
  z: number;
  rot: number;
  scale: number;
}

export interface PathPoint {
  x: number;
  z: number;
  dx: number;
  dz: number;
}

const HALF = (GRID_SIZE - 1) / 2;
export const tileToWorld = (c: number) => c - HALF;
export const worldToTile = (x: number) => Math.round(x + HALF);

export class LevelMap {
  readonly size = GRID_SIZE;
  readonly paths: PathData[] = [];
  readonly pathCells = new Set<number>();
  readonly buildSpots: BuildSpot[] = [];
  /**
   * The first `classicSpots` build spots are the hand-picked pads beside the roads (shown as
   * overgrown pads); every other open grass square follows, so any square can be cleared and built on.
   */
  classicSpots = 0;
  readonly props: Prop[] = [];
  readonly castle: { x: number; z: number; col: number; row: number };
  /** Spawn points (start of each path), world space. */
  readonly spawns: { x: number; z: number }[] = [];

  constructor(public readonly roads: Waypoint[][], spotCount: number, seed: number) {
    const rng = new Random(seed);
    for (const wp of roads) {
      const xs: number[] = [];
      const zs: number[] = [];
      const cum: number[] = [];
      let len = 0;
      for (let i = 0; i < wp.length; i++) {
        const x = tileToWorld(wp[i][0]);
        const z = tileToWorld(wp[i][1]);
        if (i > 0) len += Math.hypot(x - xs[i - 1], z - zs[i - 1]);
        xs.push(x);
        zs.push(z);
        cum.push(len);
        if (i > 0) this.rasterize(wp[i - 1], wp[i]);
      }
      this.paths.push({ xs, zs, cum, length: len });
      this.spawns.push({ x: xs[0], z: zs[0] });
    }
    const last = roads[0][roads[0].length - 1];
    this.castle = { col: last[0], row: last[1], x: tileToWorld(last[0]), z: tileToWorld(last[1]) };
    this.generateSpots(spotCount, rng);
    this.generateProps(rng);
    this.classicSpots = this.buildSpots.length;
    this.addFieldSpots();
  }

  /**
   * Every remaining grass square (not road or castle) becomes a spot too, right up to the board
   * edge beside the tunnels (the tunnel mouths themselves sit just off the board).
   */
  private addFieldSpots(): void {
    const taken = new Set(this.buildSpots.map((s) => LevelMap.key(s.col, s.row)));
    const nearSpawn = (c: number, r: number) => this.paths.some((p) => Math.max(Math.abs(c - worldToTile(p.xs[0])), Math.abs(r - worldToTile(p.zs[0]))) <= 1);
    const add = (c: number, r: number) => {
      this.buildSpots.push({ index: this.buildSpots.length, col: c, row: r, x: tileToWorld(c), z: tileToWorld(r) });
      taken.add(LevelMap.key(c, r));
    };
    const open = (c: number, r: number) => !taken.has(LevelMap.key(c, r)) && !this.pathCells.has(LevelMap.key(c, r)) && !this.nearCastle(c, r, 1);
    for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) if (open(c, r) && !nearSpawn(c, r)) add(c, r);
    // The squares beside the tunnel mouths come last, so the spot numbers saved kingdoms use
    // for the squares above stay the same.
    for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) if (open(c, r)) add(c, r);
  }

  isClassic(spot: number): boolean {
    return spot < this.classicSpots;
  }

  /** Number of road tiles of a given road within `radius` of a spot. */
  spotCoverage(spot: BuildSpot, road: number, radius = 2.7): number {
    const p = this.paths[road];
    let n = 0;
    const pt: PathPoint = { x: 0, z: 0, dx: 0, dz: 0 };
    for (let d = 0; d <= p.length; d += 0.5) {
      this.pointAt(road, d, pt);
      if ((pt.x - spot.x) ** 2 + (pt.z - spot.z) ** 2 <= radius * radius) n++;
    }
    return n / 2;
  }

  static key(c: number, r: number): number {
    return r * 64 + c;
  }

  isPath(c: number, r: number): boolean {
    return this.pathCells.has(LevelMap.key(c, r));
  }

  private rasterize(a: Waypoint, b: Waypoint): void {
    const dc = Math.sign(b[0] - a[0]);
    const dr = Math.sign(b[1] - a[1]);
    let c = a[0];
    let r = a[1];
    for (let guard = 0; guard < 64; guard++) {
      if (c >= 0 && r >= 0 && c < GRID_SIZE && r < GRID_SIZE) this.pathCells.add(LevelMap.key(c, r));
      if (c === b[0] && r === b[1]) break;
      if (c !== b[0]) c += dc;
      else r += dr;
    }
  }

  private nearCastle(c: number, r: number, d: number): boolean {
    return Math.max(Math.abs(c - this.castle.col), Math.abs(r - this.castle.row)) <= d;
  }

  private generateSpots(count: number, rng: Random): void {
    const pathList: [number, number][] = [];
    this.pathCells.forEach((k) => pathList.push([k % 64, Math.floor(k / 64)]));
    const covered = new Map<number, number>();
    type Cand = { c: number; r: number; cells: number[]; jitter: number };
    const cands: Cand[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (this.isPath(c, r) || this.nearCastle(c, r, 1)) continue;
        let adjacent = false;
        for (let dr = -1; dr <= 1 && !adjacent; dr++) for (let dc = -1; dc <= 1; dc++) if (this.isPath(c + dc, r + dr)) adjacent = true;
        if (!adjacent) continue;
        const cells: number[] = [];
        for (const [pc, pr] of pathList) if ((pc - c) ** 2 + (pr - r) ** 2 <= 2.7 * 2.7) cells.push(LevelMap.key(pc, pr));
        cands.push({ c, r, cells, jitter: rng.next() * 0.5 });
      }
    }
    const chosen: Cand[] = [];
    while (chosen.length < count) {
      let best: Cand | null = null;
      let bestScore = -1;
      for (const cand of cands) {
        if (chosen.some((o) => Math.max(Math.abs(o.c - cand.c), Math.abs(o.r - cand.r)) < 2)) continue;
        let score = cand.jitter;
        for (const k of cand.cells) score += 1 / (1 + 1.5 * (covered.get(k) ?? 0));
        if (score > bestScore) {
          bestScore = score;
          best = cand;
        }
      }
      if (!best) break;
      chosen.push(best);
      for (const k of best.cells) covered.set(k, (covered.get(k) ?? 0) + 1);
    }
    // Stable order: top-left to bottom-right so indices are predictable.
    chosen.sort((a, b) => a.r - b.r || a.c - b.c);
    chosen.forEach((cand, i) => this.buildSpots.push({ index: i, col: cand.c, row: cand.r, x: tileToWorld(cand.c), z: tileToWorld(cand.r) }));
  }

  private generateProps(rng: Random): void {
    const spotSet = new Set(this.buildSpots.map((s) => LevelMap.key(s.col, s.row)));
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const k = LevelMap.key(c, r);
        if (this.pathCells.has(k) || spotSet.has(k) || this.nearCastle(c, r, 1)) continue;
        let nearPath = false;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (this.isPath(c + dc, r + dr)) nearPath = true;
        const edge = c === 0 || r === 0 || c === GRID_SIZE - 1 || r === GRID_SIZE - 1;
        const chance = nearPath ? 0.12 : edge ? 0.55 : 0.32;
        if (rng.next() > chance) continue;
        const n = edge && rng.next() < 0.4 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          this.props.push({
            variant: rng.next(),
            x: tileToWorld(c) + rng.range(-0.28, 0.28),
            z: tileToWorld(r) + rng.range(-0.28, 0.28),
            rot: rng.range(0, Math.PI * 2),
            scale: rng.range(0.75, 1.15),
          });
        }
      }
    }
  }

  /** Position along a path at a distance; writes into out. */
  pointAt(pathIndex: number, dist: number, out: PathPoint): PathPoint {
    const p = this.paths[pathIndex];
    const d = Math.max(0, Math.min(dist, p.length));
    let i = 1;
    while (i < p.cum.length - 1 && p.cum[i] < d) i++;
    const segLen = p.cum[i] - p.cum[i - 1] || 1;
    const t = (d - p.cum[i - 1]) / segLen;
    const dx = (p.xs[i] - p.xs[i - 1]) / segLen;
    const dz = (p.zs[i] - p.zs[i - 1]) / segLen;
    out.x = p.xs[i - 1] + (p.xs[i] - p.xs[i - 1]) * t;
    out.z = p.zs[i - 1] + (p.zs[i] - p.zs[i - 1]) * t;
    out.dx = dx;
    out.dz = dz;
    return out;
  }

  /** Closest distance-along-path for a world point, returns {path, dist, d2}. */
  closestOnPaths(x: number, z: number): { path: number; dist: number; d2: number } {
    let best = { path: 0, dist: 0, d2: Infinity };
    this.paths.forEach((p, pi) => {
      for (let i = 1; i < p.xs.length; i++) {
        const ax = p.xs[i - 1], az = p.zs[i - 1];
        const bx = p.xs[i], bz = p.zs[i];
        const lx = bx - ax, lz = bz - az;
        const l2 = lx * lx + lz * lz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * lx + (z - az) * lz) / l2));
        const px = ax + lx * t, pz = az + lz * t;
        const d2 = (px - x) ** 2 + (pz - z) ** 2;
        if (d2 < best.d2) best = { path: pi, dist: p.cum[i - 1] + Math.sqrt(l2) * t, d2 };
      }
    });
    return best;
  }
}
