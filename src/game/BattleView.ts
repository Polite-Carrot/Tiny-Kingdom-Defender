// 3D presentation of a Run: diorama board, towers, instanced enemies/projectiles and juice.

import * as THREE from 'three';
import type { Renderer } from '../core/Renderer';
import type { CameraRig } from '../core/CameraRig';
import { ModelBuilder, mergeTransformed } from '../entities/ModelBuilder';
import { towerModel, enemyModel, heroModel, castleModel, spawnModel, padModel, propModel, barricadeModel, masteryModel } from '../entities/Models';
import { MASTERY } from '../data/mastery';
import type { BuildingId } from '../data/kingdom';
import { HeroAnimator } from './HeroAnimator';
import { HERO_GEAR } from '../data/heroes';
import { Particles, Rings, Bolts } from '../systems/Effects';
import { Scenery } from '../systems/Scenery';
import { Grass, type BladeSpot } from '../systems/Grass';
import type { AudioSystem } from '../systems/Audio';
import { ENEMIES, ELITES, ELITE_RULES, type EnemyId } from '../data/enemies';
import { GRID_SIZE } from '../data/base';
import type { Theme } from '../data/themes';
import { materialFor } from '../data/towers';
import { tileToWorld, worldToTile } from './LevelMap';
import { SYNERGY_BY_ID } from '../data/synergies';
import { themeOf, nightOf, activeRoads, weatherOf } from './Siege';
import { Weather } from '../systems/Weather';
import type { Run, Tower, Enemy, ProjectileKind } from './Run';

export interface ViewHooks {
  floatText(sx: number, sy: number, text: string, cls: string): void;
  coinFly(sx: number, sy: number, amount: number): void;
  castleHit(): void;
}

const ENEMY_COLORS: Record<EnemyId, string> = {
  grunt: '#7fb24f', runner: '#e0913a', knight: '#b9c2cf', bat: '#5b3f73', shaman: '#6a4aa0', shield: '#b0884f', minion: '#c0392b',
  scarab: '#2f6f7a', wraith: '#d9c08a', wolf: '#dfe8f0', golem: '#9fd6f0', fireimp: '#ff7a2a', magmaslug: '#e0582b', slugling: '#ff8a4a',
  boss_ogre: '#8aa05a', boss_scorpion: '#c9a063', boss_yeti: '#eef3f7', boss_dragon: '#b8322a',
};


interface TowerView {
  group: THREE.Group;
  base: THREE.Mesh;
  head: THREE.Mesh;
  anim: number;
  recoil: number;
  tier: number;
  branch: number;
  aim: number;
  headY: number;
  /** Ice block shown while an Ice Golem has the tower frozen. */
  ice?: THREE.Mesh;
  /** Mastery pennant / crown (Veteran and Master tower types). */
  badge?: THREE.Mesh;
}

const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
/** Glowing projectile tints (values above 1 bloom). */
const PROJ_COLORS: Partial<Record<ProjectileKind, number[]>> = {
  frost: [0.7, 0.95, 1.4], heroBolt: [1.3, 0.6, 1.5], arcane: [1.2, 0.75, 1.8], fire: [1.9, 0.9, 0.25], poison: [0.6, 1.6, 0.35], gust: [0.85, 1.7, 1.5],
};
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _right = new THREE.Vector3();

export class BattleView {
  readonly root = new THREE.Group();
  readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private disposables: { dispose(): void }[] = [];
  private enemyMeshes = new Map<EnemyId, THREE.InstancedMesh>();
  private barBg!: THREE.InstancedMesh;
  private barFill!: THREE.InstancedMesh;
  private shadows!: THREE.InstancedMesh;
  private bubbles!: THREE.InstancedMesh;
  /** Glowing rings under elite enemies. */
  private eliteRings!: THREE.InstancedMesh;
  private projArrow!: THREE.InstancedMesh;
  private projBall!: THREE.InstancedMesh;
  private projGlow!: THREE.InstancedMesh;
  private towerViews = new Map<number, TowerView>();
  private pads!: THREE.InstancedMesh;
  /** Barricade meshes by id, plus their HP bars. */
  private walls = new Map<number, { group: THREE.Group; mesh: THREE.Mesh; bar: THREE.Mesh; barBg: THREE.Mesh; tier: number }>();
  private tileMarker: THREE.Mesh | null = null;
  /** Glowing links between towers in a synergy. */
  private synergyLines: THREE.LineSegments | null = null;
  private synergyKey = '';
  private heroGear = 0;
  private castleTier = 0;
  private castleArchers = false;
  /** Rigged, animated hero. */
  private heroAnim: HeroAnimator | null = null;
  /** Soft coloured glow under the hero. */
  private heroAura: THREE.Mesh | null = null;
  private heroRing!: THREE.Mesh;
  private heroBar!: THREE.Mesh;
  private moveMarker!: THREE.Mesh;
  private allyMesh!: THREE.Mesh;
  private allyRing!: THREE.Mesh;
  private rangeRing!: THREE.Mesh;
  private rangeFill!: THREE.Mesh;
  private spotMarker!: THREE.Mesh;
  private castle!: THREE.Mesh;
  private castleShake = 0;
  readonly particles: Particles;
  readonly rings = new Rings();
  readonly bolts = new Bolts();
  private time = 0;
  /** New-road announcement: a warning beacon over each new tunnel and sparks marching down its road. */
  private frontier: { roads: number[]; beacon: THREE.Group; t: number } | null = null;
  private theme: Theme;
  /** Static board (tiles, props, pads, castle): rebuilt when the Age changes or a road opens. */
  private board = new THREE.Group();
  private boardDisposables: { dispose(): void }[] = [];
  private overgrowth: THREE.Mesh | null = null;
  private scenery: Scenery | null = null;
  private grass: Grass | null = null;
  private castleColor: string;
  private buildings: BuildingId[] = [];
  private roadCells: Map<number, number>;
  private padColor = new THREE.Color();
  private padHighlight = -1;
  heroSelected = false;
  private unsub: (() => void)[] = [];
  private trailColor: THREE.Color | null;

  constructor(
    private renderer: Renderer,
    private rig: CameraRig,
    readonly run: Run,
    private audio: AudioSystem,
    private hooks: ViewHooks,
    cosmetics: { castleColor: string; trailColor: string | null; heroGear?: number; castleTier?: number; archers?: boolean; buildings?: BuildingId[] },
  ) {
    this.theme = themeOf(run.waveIndex);
    this.trailColor = cosmetics.trailColor ? new THREE.Color(cosmetics.trailColor) : null;
    this.castleColor = cosmetics.castleColor;
    this.heroGear = cosmetics.heroGear ?? 0;
    this.castleTier = cosmetics.castleTier ?? 0;
    this.castleArchers = cosmetics.archers ?? false;
    this.buildings = cosmetics.buildings ?? [];
    this.roadCells = BattleView.rasterizeRoads();
    this.particles = new Particles(renderer.quality === 'high' ? 900 : 400);
    this.root.add(this.particles.mesh, this.rings.group, this.bolts.group, this.board);
    this.buildBoard();
    this.buildDynamic();
    renderer.scene.add(this.root);
    this.bindEvents();
  }

  private track<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  // --- Board ------------------------------------------------------------------

  /** Tile key -> lowest road index that uses it (includes the off-board spawn tiles). */
  private static rasterizeRoads(): Map<number, number> {
    const cells = new Map<number, number>();
    activeRoads().forEach((road, ri) => {
      const pts = road.points;
      for (let i = 1; i < pts.length; i++) {
        let [c, r] = pts[i - 1];
        const [tc, tr] = pts[i];
        for (let guard = 0; guard < 64; guard++) {
          const k = (r + 1) * 64 + (c + 1);
          if (!cells.has(k)) cells.set(k, ri);
          if (c === tc && r === tr) break;
          if (c !== tc) c += Math.sign(tc - c);
          else r += Math.sign(tr - r);
        }
      }
    });
    return cells;
  }

  /** Switches the Age theme (colours, props, sky) and rebuilds the board. */
  setTheme(theme: Theme): void {
    this.theme = theme;
    this.buildBoard();
  }

  rebuildBoard(): void {
    this.buildBoard();
  }

  private boardTrack<T extends { dispose(): void }>(o: T): T {
    this.boardDisposables.push(o);
    return o;
  }

  private buildBoard(): void {
    for (const d of this.boardDisposables) d.dispose();
    this.scenery?.dispose();
    this.grass?.dispose();
    this.grass = null;
    this.boardDisposables = [];
    this.board.clear();
    this.overgrowth?.geometry.dispose();
    this.overgrowth = null;
    this.propsMesh?.geometry.dispose();
    this.propsMesh = null;
    const t = this.theme;
    this.renderer.setTheme(t.sky, t.fog, t.sun, t.ambient);
    const map = this.run.map;
    const wave = this.run.waveIndex;
    const b = new ModelBuilder();
    const half = GRID_SIZE / 2 + 1;
    // Diorama body: a raised plateau with layered rock strata.
    b.box(half * 2, 0.55, half * 2, t.cliff, { y: -0.4 });
    b.box(half * 2 - 0.12, 0.5, half * 2 - 0.12, new THREE.Color(t.cliff).lerp(new THREE.Color(t.cliffDark), 0.5), { y: -0.92 });
    b.box(half * 2 - 0.3, 0.8, half * 2 - 0.3, t.cliffDark, { y: -1.5 });
    const rnd = (i: number) => ((Math.sin(i * 91.7) * 43758.5453) % 1 + 1) % 1;
    const grass = new THREE.Color(t.grass);
    const grassAlt = new THREE.Color(t.grassAlt);
    const pathCol = new THREE.Color(t.path);
    const tmp = new THREE.Color();
    // Swaying grass blades on open ground (not on pads), thick in the meadows, sparse elsewhere.
    const blades: BladeSpot[] = [];
    // Grass blades stay off pads (the classic pads, and any open field already cleared).
    const padTiles = new Set(map.buildSpots.filter((sp) => map.isClassic(sp.index) || this.run.isSpotUnlocked(sp.index)).map((sp) => sp.row * 64 + sp.col));
    const bladesPerTile = this.renderer.quality === 'high' ? ({ meadow: 22, desert: 5, snow: 4, volcano: 3 } as const)[t.id] : 0;
    const bladeBase = new THREE.Color(t.id === 'desert' ? '#c9b26a' : t.id === 'snow' ? '#a9c2a0' : t.id === 'volcano' ? '#8a7a5a' : t.grass);
    for (let r = -1; r <= GRID_SIZE; r++) {
      for (let c = -1; c <= GRID_SIZE; c++) {
        const x = tileToWorld(c);
        const z = tileToWorld(r);
        const inside = c >= 0 && r >= 0 && c < GRID_SIZE && r < GRID_SIZE;
        const road = this.roadCells.get((r + 1) * 64 + (c + 1));
        const i = (r + 2) * 37 + c;
        const isOpenRoad = (cc: number, rr: number) => {
          const rd = this.roadCells.get((rr + 1) * 64 + (cc + 1));
          return rd !== undefined && activeRoads()[rd].openWave <= wave;
        };
        if (road !== undefined && activeRoads()[road].openWave <= wave) {
          tmp.copy(pathCol).multiplyScalar(0.96 + rnd(i) * 0.08);
          b.box(1, 0.12, 1, tmp.getStyle(), { x, y: -0.1, z });
          if (t.id === 'desert') {
            // Sandy track: a few loose stones and ruts.
            if (rnd(i) > 0.6) b.box(0.12, 0.04, 0.1, t.pathEdge, { x: x + (rnd(i + 3) - 0.5) * 0.6, y: -0.03, z: z + (rnd(i + 5) - 0.5) * 0.6, ry: rnd(i) * 3 });
          } else {
            // Cobbles: a jittered 3×3 grid of rounded stones, a few missing or worn.
            for (let gy = 0; gy < 3; gy++) {
              for (let gx = 0; gx < 3; gx++) {
                const ci = i * 13 + gy * 3 + gx;
                if (rnd(ci + 0.5) < 0.12) continue;
                const off = gy % 2 ? 0.08 : -0.04;
                tmp.copy(pathCol).lerp(new THREE.Color(t.pathEdge), 0.15 + rnd(ci + 1.5) * 0.45).multiplyScalar(0.92 + rnd(ci + 2.5) * 0.16);
                b.box(0.26 + rnd(ci + 3.5) * 0.04, 0.05, 0.25 + rnd(ci + 4.5) * 0.04, tmp.getStyle(),
                  { x: x - 0.31 + gx * 0.31 + off + (rnd(ci + 5.5) - 0.5) * 0.03, y: -0.035, z: z - 0.31 + gy * 0.31 + (rnd(ci + 6.5) - 0.5) * 0.03, ry: (rnd(ci + 7.5) - 0.5) * 0.2 });
              }
            }
          }
          // Kerb stones where the road meets grass.
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (isOpenRoad(c + dc, r + dr) || c + dc < -1 || r + dr < -1 || c + dc > GRID_SIZE || r + dr > GRID_SIZE) continue;
            for (let k = 0; k < 3; k++) {
              const along = (k - 1) * 0.32 + (rnd(i + k * 7 + dc * 3 + dr * 5) - 0.5) * 0.08;
              const sx = dc !== 0 ? dc * 0.46 : along;
              const sz = dr !== 0 ? dr * 0.46 : along;
              b.dodec(0.075 + rnd(i + k) * 0.03, t.pathEdge, { x: x + sx, y: -0.02, z: z + sz, sy: 0.55, ry: rnd(i + k * 3) * 3 });
            }
          }
        } else if (road !== undefined) {
          // A road that hasn't opened yet: an overgrown trail you can plan around.
          tmp.copy(grass).lerp(pathCol, 0.35).multiplyScalar(0.95 + rnd(i) * 0.06);
          b.box(1, 0.16, 1, tmp.getStyle(), { x, y: -0.1, z });
          if (rnd(i + 7) > 0.55) b.dodec(0.12, '#8a8378', { x: x + (rnd(i + 2) - 0.5) * 0.6, y: 0.0, z: z + (rnd(i + 4) - 0.5) * 0.6, sy: 0.6 });
        } else {
          // Soft, noisy grass instead of a hard checkerboard.
          const n = (Math.sin(c * 0.9 + r * 0.4) + Math.cos(r * 0.8 - c * 0.3)) * 0.25 + 0.5;
          tmp.copy(grass).lerp(grassAlt, n * 0.8 + rnd(i) * 0.2).multiplyScalar(0.97 + rnd(i + 1) * 0.06);
          if (!inside) tmp.multiplyScalar(0.92);
          const h = 0.2 + rnd(i + 11) * 0.025;
          b.box(1, h, 1, tmp.getStyle(), { x, y: -0.12 + h / 2 - 0.04, z });
          if (!padTiles.has(r * 64 + c)) {
            for (let k = 0; k < bladesPerTile; k++) {
              const u = rnd(i * 7.3 + k * 1.91), v = rnd(i * 3.7 + k * 2.63 + 9);
              blades.push({
                x: x + (u - 0.5) * 0.96, y: -0.16 + h, z: z + (v - 0.5) * 0.96, h: 0.6 + rnd(i + k * 5.1) * 0.8,
                color: bladeBase.clone().multiplyScalar(0.85 + rnd(i + k * 3.3) * 0.35),
              });
            }
          }
          // Grass tufts, flowers or pebbles depending on the Age.
          const tuftCol = new THREE.Color(t.grassAlt).multiplyScalar(t.id === 'snow' ? 0.93 : 0.82);
          const tufts = rnd(i + 21) > 0.35 ? 1 + Math.floor(rnd(i + 22) * 3) : 0;
          for (let k = 0; k < tufts; k++) {
            const tx = x + (rnd(i + 30 + k) - 0.5) * 0.8;
            const tz = z + (rnd(i + 40 + k) - 0.5) * 0.8;
            const ty = -0.12 + h - 0.04;
            if (t.id === 'meadow' && rnd(i + 50 + k) > 0.8) {
              b.ball(0.035, 0, ['#ffffff', '#ffe066', '#ff9fc0', '#b7a6ff'][Math.floor(rnd(i + 60 + k) * 4)], { x: tx, y: ty + 0.05, z: tz });
            } else if (t.id === 'meadow' || t.id === 'snow') {
              b.cone(0.05, 0.12, 3, tuftCol, { x: tx, y: ty + 0.05, z: tz, ry: rnd(i + k) * 3 });
              b.cone(0.04, 0.09, 3, tuftCol, { x: tx + 0.05, y: ty + 0.04, z: tz + 0.03, ry: rnd(i + k + 1) * 3, rz: 0.3 });
            } else {
              b.dodec(0.04 + rnd(i + 70 + k) * 0.03, t.id === 'volcano' && rnd(i + 80 + k) > 0.7 ? new THREE.Color('#ff7a2a').multiplyScalar(1.5) : t.pathEdge, { x: tx, y: ty + 0.01, z: tz, sy: 0.6 });
            }
          }
        }
      }
    }
    const board = new THREE.Mesh(this.boardTrack(b.build()), this.material);
    board.receiveShadow = true;
    this.board.add(board);
    if (blades.length) {
      this.grass = new Grass(blades, t.id === 'meadow' ? 1 : 0.6);
      this.board.add(this.grass.mesh);
    }

    // The world around the board: island, sea, mountains, sky, clouds, particles.
    this.scenery?.dispose();
    if (this.scenery) this.root.remove(this.scenery.group);
    this.scenery = new Scenery(t, this.renderer.quality === 'high', this.buildings);
    this.root.add(this.scenery.group);

    // Props merged into one draw call; the Age decides which prop each slot shows.
    this.buildProps();

    // Build pads (instanced so they can be highlighted individually).
    this.pads = new THREE.InstancedMesh(padModel(), this.material, Math.max(1, map.buildSpots.length));
    this.boardDisposables.push({ dispose: () => this.pads.dispose() });
    this.padColor.set(t.pad);
    this.refreshPads();
    this.pads.receiveShadow = true;
    this.board.add(this.pads);
    this.buildOvergrowth();
    this.buildCastleAndCaves();
    this.buildLanterns();
    this.applyNight(true);
  }

  // --- Day and night --------------------------------------------------------------

  private night = 0;
  private lanternGlow: THREE.Mesh | null = null;
  private weather: Weather | null = null;
  private weatherK = 0;

  /** Lantern posts along the roads; their flames light up as night falls. */
  private buildLanterns(): void {
    const map = this.run.map;
    const posts = new ModelBuilder();
    const flames = new ModelBuilder();
    let n = 0;
    for (const k of map.pathCells) {
      const c = k % 64, r = Math.floor(k / 64);
      if ((c * 7 + r * 3) % 4 !== 0 || n >= 44) continue;
      if (Math.max(Math.abs(c - map.castle.col), Math.abs(r - map.castle.row)) <= 1) continue;
      // Stand on the kerb, on a side that isn't road.
      const side = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).find(([dc, dr]) => !map.isPath(c + dc, r + dr) && c + dc >= 0 && r + dr >= 0 && c + dc < GRID_SIZE && r + dr < GRID_SIZE);
      if (!side) continue;
      const x = tileToWorld(c) + side[0] * 0.5, z = tileToWorld(r) + side[1] * 0.5;
      posts.cyl(0.022, 0.03, 0.62, 5, '#3a3036', { x, y: 0.31, z });
      posts.box(0.11, 0.025, 0.11, '#2a2228', { x, y: 0.64, z });
      posts.cone(0.085, 0.07, 4, '#2a2228', { x, y: 0.79, z, ry: Math.PI / 4 });
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) posts.box(0.012, 0.12, 0.012, '#2a2228', { x: x + dx * 0.045, y: 0.7, z: z + dz * 0.045 });
      flames.ball(0.04, 0, '#ffffff', { x, y: 0.7, z, sy: 1.3 });
      n++;
    }
    if (!n) return;
    const postMesh = new THREE.Mesh(this.boardTrack(posts.build()), this.material);
    postMesh.castShadow = true;
    this.board.add(postMesh);
    const mat = this.boardTrack(new THREE.MeshBasicMaterial({ color: '#ffcf6a' }));
    this.lanternGlow = new THREE.Mesh(this.boardTrack(flames.build()), mat);
    this.board.add(this.lanternGlow);
  }

  /** Weather of the wave being fought: eases in, and only changes kind once it has cleared. */
  private updateWeather(dt: number): void {
    if (!this.weather) {
      this.weather = new Weather(this.renderer.quality);
      this.root.add(this.weather.group);
    }
    const run = this.run;
    const want = weatherOf(run.state === 'prep' ? run.waveIndex : run.currentWave);
    const w = this.weather;
    const target = want !== 'clear' && want === w.current ? 1 : 0;
    this.weatherK += Math.sign(target - this.weatherK) * Math.min(Math.abs(target - this.weatherK), dt * 0.35);
    if (this.weatherK <= 0.001 && want !== w.current) w.setKind(want);
    w.update(dt, this.weatherK);
    const haze = w.current === 'fog' ? 1 : w.current === 'sand' ? 0.75 : w.current === 'snow' ? 0.55 : w.current === 'rain' ? 0.45 : w.current === 'ash' ? 0.5 : 0;
    const col = w.current === 'sand' ? '#d8b878' : w.current === 'ash' ? '#6a6068' : w.current === 'rain' ? '#8a96a8' : '#d4d8e0';
    this.renderer.setWeather(haze * this.weatherK, col, w.flash);
  }

  /** Eases the light towards the time of day of the wave being fought. */
  private applyNight(snap = false, dt = 0): void {
    const run = this.run;
    const wave = run.state === 'prep' ? run.waveIndex : run.currentWave;
    const target = nightOf(wave);
    const before = this.night;
    this.night = snap ? target : this.night + Math.sign(target - this.night) * Math.min(Math.abs(target - this.night), dt * 0.25);
    if (!snap && before === this.night) return;
    const k = this.night;
    this.renderer.setNight(k);
    this.scenery?.setNight(k);
    if (this.lanternGlow) {
      const m = this.lanternGlow.material as THREE.MeshBasicMaterial;
      m.color.set('#ffcf6a').multiplyScalar(0.35 + 2.3 * k);
    }
  }

  private propsMesh: THREE.Mesh | null = null;

  /** Trees and rocks on the board, merged into one draw call (none on cleared ground). */
  private buildProps(): void {
    if (this.propsMesh) {
      this.board.remove(this.propsMesh);
      this.propsMesh.geometry.dispose();
      this.propsMesh = null;
    }
    const t = this.theme;
    const map = this.run.map;
    const half = GRID_SIZE / 2;
    const cleared = new Set(map.buildSpots.filter((sp) => this.run.isSpotUnlocked(sp.index)).map((sp) => sp.row * 64 + sp.col));
    const onCleared = (x: number, z: number) => cleared.has(worldToTile(z) * 64 + worldToTile(x));
    const pick = (v: number) => t.props[Math.min(t.props.length - 1, Math.floor(v * t.props.length))];
    const items = map.props.filter((p) => !onCleared(p.x, p.z)).map((p) => ({ geo: propModel(pick(p.variant)), x: p.x, y: 0, z: p.z, ry: p.rot, s: p.scale }));
    for (let i = 0; i < 30; i++) {
      const side = i % 4;
      const k = (i * 0.37) % 1;
      const px = side === 0 ? -half + 0.45 : side === 1 ? half - 0.45 : (k - 0.5) * (half * 2 - 1);
      const pz = side === 2 ? -half + 0.45 : side === 3 ? half - 0.45 : (k - 0.5) * (half * 2 - 1);
      const c = Math.round(px + (GRID_SIZE - 1) / 2);
      const r = Math.round(pz + (GRID_SIZE - 1) / 2);
      if (this.roadCells.has((r + 1) * 64 + (c + 1)) || onCleared(px, pz)) continue;
      items.push({ geo: propModel(t.props[i % t.props.length]), x: px, y: 0, z: pz, ry: i * 1.3, s: 0.9 });
    }
    if (!items.length) return;
    this.propsMesh = new THREE.Mesh(mergeTransformed(items), this.material);
    this.propsMesh.castShadow = true;
    this.propsMesh.receiveShadow = true;
    this.board.add(this.propsMesh);
  }

  private buildCastleAndCaves(): void {
    const t = this.theme;
    const map = this.run.map;
    // Castle, facing its first road.
    const cp = map.paths[0];
    const n = cp.xs.length;
    this.castle = new THREE.Mesh(castleModel(this.castleColor, this.castleTier, this.castleArchers), this.material);
    this.castle.position.set(map.castle.x, 0, map.castle.z);
    this.castle.rotation.y = Math.atan2(cp.xs[n - 2] - cp.xs[n - 1], cp.zs[n - 2] - cp.zs[n - 1]);
    this.castle.castShadow = true;
    this.board.add(this.castle);

    // Spawn caves (closed roads get a boarded-up gate: the rocks are drawn either way).
    map.paths.forEach((p) => {
      const m = new THREE.Mesh(spawnModel(t.id), this.material);
      m.position.set(p.xs[0], 0, p.zs[0]);
      m.rotation.y = Math.atan2(p.xs[1] - p.xs[0], p.zs[1] - p.zs[0]);
      m.castShadow = true;
      this.board.add(m);
    });
    this.padHighlight = -1;
  }

  /**
   * Pad colours: unlocked pads use the Age's stone colour, locked classic pads are darker, and
   * open fields have no pad at all until they are cleared.
   */
  private refreshPads(): void {
    const locked = new THREE.Color(this.theme.cliffDark).lerp(new THREE.Color(this.theme.grass), 0.35);
    const map = this.run.map;
    map.buildSpots.forEach((sp, i) => {
      const open = this.run.isSpotUnlocked(sp.index);
      const shown = open || map.isClassic(sp.index);
      _m.makeTranslation(sp.x, shown ? 0 : -5, sp.z);
      if (!shown) _m.scale(_s.setScalar(0.001));
      this.pads.setMatrixAt(i, _m);
      this.pads.setColorAt(i, open ? this.padColor : locked);
    });
    this.pads.instanceMatrix.needsUpdate = true;
    if (this.pads.instanceColor) this.pads.instanceColor.needsUpdate = true;
  }

  /** Bushes and rocks covering land that hasn't been cleared yet. */
  private buildOvergrowth(): void {
    if (this.overgrowth) {
      this.board.remove(this.overgrowth);
      this.overgrowth.geometry.dispose();
      this.overgrowth = null;
    }
    const t = this.theme;
    const bushType = t.id === 'desert' ? 'cactus' : t.id === 'snow' ? 'pine' : t.id === 'volcano' ? 'lavarock' : 'bush';
    const items: { geo: THREE.BufferGeometry; x: number; y: number; z: number; ry: number; s: number }[] = [];
    for (const sp of this.run.map.buildSpots) {
      if (this.run.isSpotUnlocked(sp.index) || !this.run.map.isClassic(sp.index)) continue;
      const k = sp.index * 1.7;
      items.push({ geo: propModel(bushType), x: sp.x - 0.12, y: 0.06, z: sp.z + 0.05, ry: k, s: 0.75 });
      items.push({ geo: propModel('rock'), x: sp.x + 0.18, y: 0.05, z: sp.z - 0.12, ry: k * 2, s: 0.8 });
    }
    if (!items.length) return;
    this.overgrowth = new THREE.Mesh(mergeTransformed(items), this.material);
    this.overgrowth.castShadow = true;
    this.board.add(this.overgrowth);
  }

  private buildDynamic(): void {
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      this.root.add(m);
      return m;
    };
    for (const id of Object.keys(ENEMIES) as EnemyId[]) {
      const cap = ENEMIES[id].boss ? 4 : id === 'minion' || id === 'slugling' ? 64 : 160;
      const m = mk(enemyModel(id), this.material, cap);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      m.castShadow = false;
      this.enemyMeshes.set(id, m);
    }
    const quad = this.track(new THREE.PlaneGeometry(1, 1));
    this.barBg = mk(quad, this.track(new THREE.MeshBasicMaterial({ color: '#2a1f1f', depthTest: false, toneMapped: false })), 256);
    this.barFill = mk(quad, this.track(new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, toneMapped: false })), 256);
    this.barFill.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(256 * 3), 3);
    this.barBg.renderOrder = 10;
    this.barFill.renderOrder = 11;
    const circle = this.track(new THREE.CircleGeometry(0.5, 12));
    circle.rotateX(-Math.PI / 2);
    this.shadows = mk(circle, this.track(new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false })), 300);
    this.bubbles = mk(this.track(new THREE.IcosahedronGeometry(0.5, 1)), this.track(new THREE.MeshBasicMaterial({ color: '#7fc8ff', transparent: true, opacity: 0.28, depthWrite: false })), 160);
    const eliteRing = this.track(new THREE.RingGeometry(0.36, 0.5, 24));
    eliteRing.rotateX(-Math.PI / 2);
    this.eliteRings = mk(eliteRing, this.track(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })), 64);
    this.eliteRings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3).fill(1), 3);

    const arrowGeo = this.track(new THREE.BoxGeometry(0.035, 0.035, 0.34));
    this.projArrow = mk(arrowGeo, this.track(new THREE.MeshBasicMaterial({ color: '#ffffff' })), 128);
    this.projArrow.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(128 * 3), 3);
    this.projBall = mk(this.track(new THREE.IcosahedronGeometry(0.11, 0)), this.track(new THREE.MeshLambertMaterial({ color: '#2b2f38', flatShading: true })), 48);
    this.projGlow = mk(this.track(new THREE.OctahedronGeometry(0.1, 0)), this.track(new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })), 96);
    this.projGlow.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(96 * 3), 3);

    // Range indicator.
    const ringGeo = this.track(new THREE.RingGeometry(0.97, 1, 64));
    ringGeo.rotateX(-Math.PI / 2);
    this.rangeRing = new THREE.Mesh(ringGeo, this.track(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false })));
    const fillGeo = this.track(new THREE.CircleGeometry(1, 64));
    fillGeo.rotateX(-Math.PI / 2);
    this.rangeFill = new THREE.Mesh(fillGeo, this.track(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.14, depthWrite: false })));
    this.rangeRing.visible = this.rangeFill.visible = false;
    this.rangeRing.renderOrder = this.rangeFill.renderOrder = 3;
    this.root.add(this.rangeRing, this.rangeFill);

    const markerGeo = this.track(new THREE.RingGeometry(0.4, 0.5, 24));
    markerGeo.rotateX(-Math.PI / 2);
    this.spotMarker = new THREE.Mesh(markerGeo, this.track(new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, depthWrite: false, toneMapped: false })));
    this.spotMarker.visible = false;
    this.root.add(this.spotMarker);

    // Hero.
    const hero = this.run.hero;
    this.heroRing = new THREE.Mesh(markerGeo, this.track(new THREE.MeshBasicMaterial({ color: '#7dff9a', transparent: true, depthWrite: false, toneMapped: false })));
    this.heroRing.visible = false;
    this.moveMarker = new THREE.Mesh(markerGeo, this.track(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false })));
    this.moveMarker.visible = false;
    this.root.add(this.heroRing, this.moveMarker);
    if (hero) {
      this.makeHeroAnimator();
      const auraGeo = this.track(new THREE.CircleGeometry(0.5, 32));
      auraGeo.rotateX(-Math.PI / 2);
      this.heroAura = new THREE.Mesh(auraGeo, this.track(new THREE.MeshBasicMaterial({
        color: new THREE.Color(hero.def.color).multiplyScalar(1.4), transparent: true, opacity: 0.32, depthWrite: false, map: this.auraTexture(),
      })));
      this.root.add(this.heroAura);
      this.heroBar = new THREE.Mesh(quad, this.track(new THREE.MeshBasicMaterial({ color: '#59e05a', depthTest: false, toneMapped: false })));
      this.heroBar.renderOrder = 11;
      this.root.add(this.heroBar);
    }
    this.allyMesh = new THREE.Mesh(heroModel('champion'), this.material);
    this.allyMesh.visible = false;
    this.allyMesh.scale.setScalar(1.25);
    this.allyRing = new THREE.Mesh(markerGeo, this.track(new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, depthWrite: false, toneMapped: false })));
    this.allyRing.visible = false;
    this.root.add(this.allyMesh, this.allyRing);
  }

  // --- Events -> juice ---------------------------------------------------------

  private bindEvents(): void {
    const ev = this.run.events;
    const on = <K extends Parameters<typeof ev.on>[0]>(k: K, fn: Parameters<typeof ev.on<K>>[1]) => this.unsub.push(ev.on(k, fn));
    on('towerBuilt', (t) => {
      this.ensureTower(t);
      this.particles.burst(t.x, 0.2, t.z, '#d8c8a8', 14, { speed: 2.4, up: 1.5, size: 0.1 });
      this.rings.spawn(t.x, t.z, 0.9, '#ffffff', 0.4);
      this.audio.play('build');
    });
    on('towerUpgraded', (t) => {
      this.ensureTower(t);
      const v = this.towerViews.get(t.id);
      if (v) v.anim = 0;
      this.particles.burst(t.x, 1.0, t.z, '#ffe27a', 22, { speed: 2, up: 3, size: 0.07, gravity: 4 });
      this.rings.spawn(t.x, t.z, 1.1, '#ffe27a', 0.5);
      this.audio.play('upgrade');
    });
    on('towerSold', ({ tower, refund }) => {
      const v = this.towerViews.get(tower.id);
      if (v) {
        this.root.remove(v.group);
        this.towerViews.delete(tower.id);
      }
      this.particles.burst(tower.x, 0.3, tower.z, '#bfb29a', 18, { speed: 2.5, up: 2, size: 0.1 });
      const s = this.project(tower.x, 1, tower.z);
      this.hooks.floatText(s.x, s.y, `+${refund}`, 'gold');
      this.audio.play('sell');
    });
    on('towerFire', ({ tower, target }) => {
      const v = this.towerViews.get(tower.id);
      if (v) v.recoil = 1;
      const id = tower.def.id;
      if (tower.stats.aura) {
        this.audio.play('aura');
        return;
      }
      if (id === 'archer') this.audio.play('arrow');
      else if (id === 'cannon') {
        this.audio.play('cannon', 0.7);
        if (target) {
          const a = tower.aim;
          this.particles.burst(tower.x + Math.sin(a) * 0.45, 0.9, tower.z + Math.cos(a) * 0.45, '#d8d8d8', 5, { speed: 0.8, up: 1, size: 0.12, gravity: -1, life: 0.5 });
        }
      } else if (id === 'frost') this.audio.play('frost');
      else if (id === 'mage') this.audio.play('arcane');
      else if (id === 'ballista') this.audio.play('ballista');
      else if (id === 'flame') {
        this.audio.play('flame');
        if (target) {
          // A gout of flame from the nozzle.
          const a = tower.aim;
          const v2 = this.towerViews.get(tower.id);
          const hy = (v2?.headY ?? 0.8) + 0.12;
          this.particles.burst(tower.x + Math.sin(a) * 0.45, hy, tower.z + Math.cos(a) * 0.45, '#ff8a2a', 4, { speed: 1.2, up: 0.6, size: 0.1, gravity: -0.6, life: 0.35 });
        }
      } else if (id === 'alchemist') this.audio.play('poison');
      else if (id === 'catapult') this.audio.play('ballista', 0.8);
      else if (id === 'gale') this.audio.play('frost', 0.7);
    });
    on('spell', ({ id, x, z, radius, value }) => {
      const c = this.run.map.castle;
      if (id === 'meteor') {
        // A streak from the sky, then a fiery blast.
        this.bolts.spawn([x - 2.5, 9, z - 1.5, x - 1.2, 4.5, z - 0.7, x, 0.3, z], '#ffb347');
        this.particles.burst(x, 0.3, z, '#ff7a2a', 30, { speed: 3.5, up: 4, size: 0.16, gravity: -1, life: 0.8 });
        this.particles.burst(x, 0.3, z, '#ffd36a', 18, { speed: 2.4, up: 5, size: 0.1, gravity: -1.2, life: 0.6 });
        this.particles.burst(x, 0.2, z, '#5a4a40', 16, { speed: 2, up: 1.5, size: 0.2, gravity: -0.3, life: 1.2 });
        this.rings.spawn(x, z, radius, '#ff9a3a', 0.5);
        this.rings.spawn(x, z, radius * 0.6, '#ffe08a', 0.35);
        this.rig.shake(0.35);
        this.audio.play('bossRoar', 0.5);
        this.audio.play('cannon');
      } else if (id === 'freeze') {
        for (const e of this.run.enemies) {
          if (!e.alive) continue;
          this.rings.spawn(e.x, e.z, 0.45, '#bfeaff', 0.6);
          this.particles.burst(e.x, 0.4, e.z, '#dff6ff', 5, { speed: 1, up: 1.2, size: 0.07, life: 0.6 });
        }
        this.audio.play('frost');
      } else if (id === 'blessing') {
        this.particles.burst(c.x, 1.6, c.z, '#ffd84a', 50, { speed: 3, up: 4, size: 0.1, gravity: -1.5, life: 1.2 });
        this.rings.spawn(c.x, c.z, 3, '#ffd84a', 0.8);
        this.audio.play('reward');
      } else {
        this.particles.burst(c.x, 1, c.z, '#7dffb0', 30, { speed: 2, up: 3, size: 0.1, gravity: -1, life: 0.9 });
        this.rings.spawn(c.x, c.z, 1.6, '#7dffb0', 0.6);
        const s = this.project(c.x, 1.6, c.z);
        this.hooks.floatText(s.x, s.y, `+${value} ♥`, 'heal big');
        this.audio.play('upgrade');
      }
    });
    on('mineGold', ({ tower, gold }) => {
      const v = this.towerViews.get(tower.id);
      if (v) v.recoil = 1;
      this.particles.burst(tower.x, 0.8, tower.z, '#ffd84a', 12, { speed: 1.2, up: 2.4, size: 0.08, gravity: -2, life: 0.8 });
      const s = this.project(tower.x, 1.2, tower.z);
      this.hooks.floatText(s.x, s.y, `+${gold}`, 'gold');
    });
    on('lightning', ({ points }) => {
      this.bolts.spawn(points, '#c8a6ff');
      for (let i = 3; i < points.length; i += 3) this.particles.burst(points[i], points[i + 1], points[i + 2], '#e3d0ff', 4, { speed: 1.5, up: 1, size: 0.05, life: 0.3 });
      this.audio.play('lightning');
    });
    on('projectileHit', ({ p, x, z }) => {
      if (p.kind === 'cannon') {
        this.particles.burst(x, 0.15, z, '#ffb347', 10, { speed: 2.5, up: 2.5, size: 0.1, life: 0.4 });
        this.particles.burst(x, 0.15, z, '#8a8076', 8, { speed: 1.4, up: 1.2, size: 0.16, gravity: -0.5, life: 0.7 });
        this.rings.spawn(x, z, p.splash, '#ffcf7a', 0.35);
        this.rig.shake(0.13);
      } else if (p.kind === 'frost') {
        this.particles.burst(x, 0.4, z, '#bfeaff', 6, { speed: 1.5, up: 1.5, size: 0.06, life: 0.4 });
      } else if (p.kind === 'fire') {
        this.particles.burst(x, 0.2, z, '#ff7a1a', 8, { speed: 1.8, up: 2, size: 0.1, gravity: -0.8, life: 0.45 });
        this.particles.burst(x, 0.2, z, '#ffd36a', 4, { speed: 1, up: 2.5, size: 0.06, gravity: -1, life: 0.35 });
        this.rings.spawn(x, z, p.splash, '#ff9a3a', 0.25);
      } else if (p.kind === 'poison') {
        this.particles.burst(x, 0.15, z, '#7fd65a', 14, { speed: 1.2, up: 0.8, size: 0.16, gravity: -0.15, life: 1.1 });
        this.particles.burst(x, 0.15, z, '#c8ff9a', 6, { speed: 0.6, up: 1.4, size: 0.07, gravity: -0.3, life: 0.8 });
        this.rings.spawn(x, z, p.splash, '#8be05a', 0.6);
        this.audio.play('poison', 0.5);
      } else if (p.kind === 'arcane') {
        this.particles.burst(x, 0.45, z, '#c8a6ff', p.splash > 0 ? 14 : 6, { speed: 1.8, up: 1.5, size: 0.07, life: 0.4 });
        if (p.splash > 0) this.rings.spawn(x, z, p.splash, '#b48cf0', 0.35);
      } else if (p.kind === 'bolt') {
        this.particles.burst(x, 0.35, z, '#c9a66b', 4, { speed: 1.6, up: 1.2, size: 0.05, life: 0.3 });
      } else if (p.kind === 'boulder') {
        // A boulder lands: dust, rock chips and a thump.
        this.particles.burst(x, 0.15, z, '#a8987e', 16, { speed: 2.2, up: 1.6, size: 0.17, gravity: -0.4, life: 0.9 });
        this.particles.burst(x, 0.15, z, '#6a5e50', 10, { speed: 3, up: 3, size: 0.07, life: 0.5 });
        if (p.dot > 0) this.particles.burst(x, 0.2, z, '#ff8a2a', 12, { speed: 2, up: 2, size: 0.1, gravity: -0.8, life: 0.5 });
        this.rings.spawn(x, z, p.splash, '#d9c8a0', 0.45);
        this.rig.shake(0.18);
        this.audio.play('cannon', 0.5);
      } else if (p.kind === 'gust') {
        // Swirling wind.
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          this.particles.burst(x + Math.cos(a) * 0.2, 0.3, z + Math.sin(a) * 0.2, i % 2 ? '#dff8f0' : '#9fe3d0', 1, { speed: 1.8, up: 0.6, size: 0.07, gravity: 0, life: 0.4, spread: 0.2 });
        }
        if (p.splash > 0) this.rings.spawn(x, z, p.splash, '#bff3e4', 0.3);
      } else if (p.kind === 'champion') {
        this.particles.burst(x, 0.4, z, '#ffd84a', 8, { speed: 2, up: 2, size: 0.07, life: 0.4 });
        this.rings.spawn(x, z, p.splash, '#ffd84a', 0.3);
      } else {
        this.particles.burst(x, 0.4, z, '#fff2c4', 2, { speed: 1, up: 1, size: 0.04, life: 0.2 });
      }
    });
    on('splash', ({ x, z, radius, kind }) => {
      if (kind === 'aura') this.rings.spawn(x, z, radius, '#bfeaff', 0.5);
    });
    on('enemyHit', ({ enemy, amount, immune }) => {
      if (immune) {
        if (Math.random() < 0.15) {
          const s = this.project(enemy.x, enemy.y + 0.9 * enemy.def.scale, enemy.z);
          this.hooks.floatText(s.x, s.y, 'IMMUNE', 'immune');
        }
        return;
      }
      // Throttle numbers: show the bigger ones and a sample of small ones.
      if (amount >= 30 || Math.random() < 0.25) {
        const s = this.project(enemy.x, enemy.y + 0.75 * enemy.def.scale, enemy.z);
        this.hooks.floatText(s.x + (Math.random() - 0.5) * 18, s.y, String(Math.round(amount)), amount >= 80 ? 'dmg big' : 'dmg');
      }
    });
    on('enemyDeath', ({ enemy, bounty }) => {
      const col = ENEMY_COLORS[enemy.def.id];
      const big = !!enemy.def.boss;
      this.particles.burst(enemy.x, enemy.y + 0.3, enemy.z, col, big ? 40 : 10, { speed: big ? 4 : 2.2, up: big ? 4 : 2.5, size: big ? 0.16 : 0.09 });
      this.particles.burst(enemy.x, enemy.y + 0.3, enemy.z, '#ffffff', big ? 12 : 3, { speed: 1.5, up: 1.5, size: 0.06, life: 0.3 });
      if (bounty > 0) {
        const s = this.project(enemy.x, enemy.y + 0.6, enemy.z);
        this.hooks.coinFly(s.x, s.y, bounty);
      }
      if (big) {
        this.rig.shake(0.35);
        this.rings.spawn(enemy.x, enemy.z, 2.5, '#ffffff', 0.7);
        this.audio.play('bossDeath');
      } else this.audio.play('death');
    });
    on('enemyLeak', () => {
      this.castleShake = 0.4;
      this.rig.shake(0.12);
      this.particles.burst(this.run.map.castle.x, 0.8, this.run.map.castle.z, '#ff6b5a', 12, { speed: 2, up: 2.5, size: 0.08 });
      this.audio.play('leak');
      this.hooks.castleHit();
    });
    on('heroAttack', ({ hero }) => {
      this.heroAnim?.attack();
      if (hero.def.range <= 1.5) this.audio.play('heroHit');
      else if (hero.def.damageType === 'magic') this.audio.play('frost', 0.6);
      else this.audio.play('arrow', 0.8);
    });
    on('heroAbility', (ev) => {
      const { hero, x, z, radius } = ev;
      this.heroAnim?.ability();
      const kind = hero.def.ability.kind;
      if (kind === 'arrowRain') {
        for (let i = 0; i < 30; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * radius;
          this.particles.burst(x + Math.cos(a) * r, 2.5, z + Math.sin(a) * r, '#fff2c4', 1, { speed: 0.1, up: -6, size: 0.08, gravity: 10, life: 0.5 });
        }
        this.rings.spawn(x, z, radius, '#9dff8a', 0.6);
        this.audio.play('arrowRain');
      } else if (kind === 'quake') {
        this.rings.spawn(x, z, radius, '#e8b070', 0.7);
        this.rings.spawn(x, z, radius * 0.55, '#ffffff', 0.4);
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2;
          const r = radius * (0.3 + Math.random() * 0.7);
          this.particles.burst(x + Math.cos(a) * r, 0.05, z + Math.sin(a) * r, i % 2 ? '#a07a4a' : '#d8c09a', 1, { speed: 0.5, up: 2.5, size: 0.13, gravity: 6, life: 0.6 });
        }
        this.rig.shake(0.32);
        this.audio.play('cannon', 1);
        this.audio.play('taunt', 0.6);
      } else if (kind === 'holyLight') {
        this.rings.spawn(x, z, radius, '#fff2a8', 0.8);
        this.rings.spawn(x, z, radius * 0.5, '#ffffff', 0.5);
        for (let i = 0; i < 30; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * radius;
          this.particles.burst(x + Math.cos(a) * r, 0.1, z + Math.sin(a) * r, i % 3 ? '#fff2a8' : '#ffffff', 1, { speed: 0.1, up: 3.5, size: 0.09, gravity: -1, life: 0.9 });
        }
        const c = this.run.map.castle;
        this.particles.burst(c.x, 1.2, c.z, '#fff2a8', 24, { speed: 1.5, up: 2.5, size: 0.1, gravity: -0.5, life: 1 });
        this.rings.spawn(c.x, c.z, 1.2, '#7dff9a', 0.8);
        const sp = this.project(c.x, 1.6, c.z);
        this.hooks.floatText(sp.x, sp.y, `+${hero.def.ability.count ?? 3} ♥`, 'heal big');
        this.audio.play('heal');
      } else if (kind === 'shadowStrike') {
        const pts = ev.points ?? [];
        for (let i = 2; i + 1 < pts.length; i += 2) {
          const px = pts[i], pz = pts[i + 1];
          this.particles.burst(px, 0.4, pz, '#7a4fd6', 8, { speed: 1.6, up: 1.2, size: 0.1, life: 0.45 });
          this.particles.burst(px, 0.4, pz, '#ffffff', 3, { speed: 2.4, up: 0.6, size: 0.05, life: 0.25 });
          // Slash trail between victims.
          const ax = pts[i - 2], az = pts[i - 1];
          for (let k = 1; k < 6; k++) this.particles.burst(ax + (px - ax) * (k / 6), 0.45, az + (pz - az) * (k / 6), '#2b2a4a', 1, { speed: 0.1, up: 0.2, size: 0.12, gravity: 0, life: 0.5, spread: 0 });
        }
        this.rig.shake(0.15);
        this.audio.play('heroHit');
        this.audio.play('arrowRain', 0.5);
      } else if (kind === 'taunt') {
        this.rings.spawn(x, z, radius, '#8fb4ff', 0.6);
        this.rings.spawn(x, z, radius * 0.6, '#ffffff', 0.4);
        this.rig.shake(0.18);
        this.audio.play('taunt');
      } else {
        this.particles.burst(x, 0.2, z, '#ff8a3d', 40, { speed: 4, up: 4, size: 0.14, life: 0.7 });
        this.particles.burst(x, 0.2, z, '#5a4a48', 20, { speed: 2, up: 2, size: 0.2, gravity: -0.6, life: 1 });
        this.rings.spawn(x, z, radius, '#ffb347', 0.6);
        this.rings.spawn(x, z, radius * 1.6, '#ff6a2a', 0.8);
        this.rig.shake(0.3);
        this.audio.play('meteor');
      }
    });
    on('eliteSpawn', (e) => {
      const s = this.project(e.x, 1.2, e.z);
      this.hooks.floatText(s.x, s.y, `${ELITES[e.elite!].name} elite!`, 'elite');
      this.rings.spawn(e.x, e.z, 0.9, ELITES[e.elite!].color, 0.5);
    });
    on('eliteKill', (e) => {
      const s = this.project(e.x, 1.0, e.z);
      this.hooks.floatText(s.x, s.y - 20, `+${ELITE_RULES.gems} 💎`, 'gem big');
      this.particles.burst(e.x, 0.5, e.z, ELITES[e.elite!].color, 18, { speed: 2.2, up: 2.5, size: 0.09, life: 0.7 });
    });
    on('castleFire', () => this.audio.play('arrow', 0.5));
    on('synergy', ({ synergy, a, b }) => {
      const def = SYNERGY_BY_ID[synergy];
      for (const t of [a, b]) {
        this.rings.spawn(t.x, t.z, 0.8, def.color, 0.6);
        this.particles.burst(t.x, 1.0, t.z, def.color, 12, { speed: 1.5, up: 2, size: 0.08, life: 0.7 });
      }
      this.audio.play('upgrade');
    });
    on('barricadeRepaired', (b) => {
      this.particles.burst(b.x, 0.3, b.z, '#ffe680', 10, { speed: 1.2, up: 2, size: 0.07, life: 0.5 });
    });
    on('barricadeBuilt', (b) => {
      this.particles.burst(b.x, 0.2, b.z, '#c9a06a', 14, { speed: 1.8, up: 2, size: 0.09, life: 0.5 });
      this.rings.spawn(b.x, b.z, 0.7, '#ffd84a', 0.4);
    });
    on('barricadeBroken', (b) => {
      this.particles.burst(b.x, 0.3, b.z, '#9a6a3f', 26, { speed: 3, up: 3, size: 0.12, gravity: 1.2, life: 0.9 });
      this.particles.burst(b.x, 0.2, b.z, '#8a8076', 10, { speed: 1.5, up: 1.2, size: 0.18, gravity: -0.4, life: 0.8 });
      this.rig.shake(0.2);
      this.audio.play('cannon', 0.8);
      const s = this.project(b.x, 0.9, b.z);
      this.hooks.floatText(s.x, s.y, 'Barricade broken!', 'boss');
    });
    on('barricadeRemoved', ({ barricade, refund }) => {
      this.particles.burst(barricade.x, 0.3, barricade.z, '#bfb29a', 12, { speed: 2, up: 2, size: 0.1 });
      const s = this.project(barricade.x, 0.8, barricade.z);
      if (refund > 0) this.hooks.floatText(s.x, s.y, `+${refund}`, 'gold');
      this.audio.play('sell');
    });
    on('burrow', ({ enemy, hidden }) => {
      this.particles.burst(enemy.x, 0.05, enemy.z, '#d9c08a', hidden ? 10 : 8, { speed: 1.4, up: 1.6, size: 0.1, gravity: 2, life: 0.5 });
    });
    on('towerFrozen', ({ tower, enemy }) => {
      this.bolts.spawn([enemy.x, 0.6, enemy.z, tower.x, 1.0, tower.z], '#bfeaff');
      this.particles.burst(tower.x, 0.8, tower.z, '#e0faff', 14, { speed: 1.4, up: 1.5, size: 0.08, life: 0.6 });
      this.audio.play('frost', 1);
    });
    on('heroRespawn', (h) => {
      this.heroAnim?.respawn();
      this.rings.spawn(h.x, h.z, 0.9, h.def.color, 0.5);
      this.particles.burst(h.x, 0.3, h.z, '#ffffff', 14, { speed: 1.5, up: 2.5, size: 0.07, life: 0.6 });
    });
    on('heroDeath', (h) => {
      this.heroAnim?.die();
      this.particles.burst(h.x, 0.4, h.z, '#ffffff', 16, { speed: 2, up: 3, size: 0.08 });
    });
    on('bossMechanic', ({ enemy, kind }) => {
      const s = this.project(enemy.x, 1.6, enemy.z);
      if (kind === 'summon') {
        this.rings.spawn(enemy.x, enemy.z, 1.4, '#c06aff', 0.5);
        this.hooks.floatText(s.x, s.y, 'SUMMON!', 'boss');
        this.audio.play('bossRoar');
      } else if (kind === 'charge') {
        this.particles.burst(enemy.x, 0.1, enemy.z, '#c8b090', 18, { speed: 2.5, up: 1, size: 0.14, gravity: 1 });
        this.rig.shake(0.22);
        this.hooks.floatText(s.x, s.y, 'CHARGE!', 'boss');
        this.audio.play('bossRoar');
      } else {
        this.rings.spawn(enemy.x, enemy.z, 1.2, '#ffd84a', 0.8);
        this.hooks.floatText(s.x, s.y, 'IMMUNE!', 'immune');
        this.audio.play('immune');
      }
    });
    on('heal', ({ targets }) => {
      for (const t of targets.slice(0, 6)) this.particles.burst(t.x, t.y + 0.4, t.z, '#79f2a0', 3, { speed: 0.4, up: 1.8, size: 0.06, gravity: 0, life: 0.6 });
      this.audio.play('heal');
    });
    on('waveStart', ({ index }) => {
      const w = this.run.waveDef(index);
      this.audio.play(w?.boss ? 'bossRoar' : 'waveStart');
    });
    on('waveCleared', ({ gold }) => {
      const s = this.project(this.run.map.castle.x, 2.2, this.run.map.castle.z);
      this.hooks.floatText(s.x, s.y, `Wave clear +${gold}`, 'gold big');
      this.audio.play('waveClear');
    });
    on('earlyCall', ({ gold }) => {
      if (gold > 0) this.audio.play('coin');
    });
    on('landCleared', ({ spot }) => {
      const sp = this.run.map.buildSpots[spot];
      this.refreshPads();
      this.buildOvergrowth();
      if (!this.run.map.isClassic(spot)) this.buildProps();
      this.particles.burst(sp.x, 0.2, sp.z, '#8fbf5a', 16, { speed: 2.2, up: 2.5, size: 0.1 });
      this.particles.burst(sp.x, 0.2, sp.z, '#bfb29a', 10, { speed: 1.6, up: 1.5, size: 0.14 });
      this.rings.spawn(sp.x, sp.z, 0.9, '#ffffff', 0.4);
      this.audio.play('build');
    });
    on('ageChange', ({ wave }) => {
      this.setTheme(themeOf(wave));
      const c = this.run.map.castle;
      this.rings.spawn(c.x, c.z, 6, '#ffffff', 1.2);
    });
    on('roadOpened', ({ road }) => {
      this.rebuildBoard();
      const p = this.run.map.paths[road];
      for (let i = 0; i < 3; i++) this.rings.spawn(p.xs[0], p.zs[0], 1.5 + i, '#ff7a6a', 0.8 + i * 0.3);
      this.rig.shake(0.25);
      this.audio.play('bossRoar');
    });
    on('retreat', () => {
      this.particles.clear();
      this.rebuildBoard();
    });
    on('goldRush', () => {
      const c = this.run.map.castle;
      this.particles.burst(c.x, 1.5, c.z, '#ffd84a', 40, { speed: 3, up: 4, size: 0.1 });
      this.audio.play('reward');
    });
    on('revived', () => {
      this.rings.spawn(this.run.map.castle.x, this.run.map.castle.z, 3, '#7dffb0', 0.9);
      this.particles.burst(this.run.map.castle.x, 1, this.run.map.castle.z, '#7dffb0', 40, { speed: 3, up: 4, size: 0.1 });
    });
  }

  private ensureTower(t: Tower): void {
    let v = this.towerViews.get(t.id);
    const model = towerModel(t.def.id, t.tier, t.branch);
    if (!v) {
      const group = new THREE.Group();
      const base = new THREE.Mesh(model.base, this.material);
      const head = new THREE.Mesh(model.head, this.material);
      base.castShadow = head.castShadow = true;
      group.add(base, head);
      group.position.set(t.x, 0, t.z);
      this.root.add(group);
      v = { group, base, head, anim: 0, recoil: 0, tier: t.tier, branch: t.branch, aim: 0, headY: model.headY };
      this.towerViews.set(t.id, v);
    }
    v.base.geometry = model.base;
    v.head.geometry = model.head;
    const m = this.run.config.meta.mastery?.[t.def.id] ?? 0;
    const rank = m >= MASTERY.masterLevel ? 2 : m >= MASTERY.veteranLevel ? 1 : 0;
    if (rank && !v.badge) {
      v.badge = new THREE.Mesh(masteryModel(rank), this.material);
      v.badge.castShadow = true;
      v.group.add(v.badge);
    }
    if (v.badge) {
      v.badge.visible = rank > 0;
      if (rank) v.badge.geometry = masteryModel(rank);
    }
    v.head.position.y = model.headY;
    v.headY = model.headY;
    v.tier = t.tier;
    v.branch = t.branch;
  }

  /** Kingdom buildings beyond the moat changed. */
  setBuildings(ids: BuildingId[]): void {
    this.buildings = [...ids];
    this.scenery?.setBuildings(this.buildings);
  }

  /** Mastery changed: refresh every tower's look. */
  refreshTowers(): void {
    for (const t of this.run.towers) this.ensureTower(t);
  }

  // --- Selection helpers -------------------------------------------------------

  showRange(x: number, z: number, range: number, color: string): void {
    this.rangeRing.position.set(x, 0.05, z);
    this.rangeFill.position.set(x, 0.04, z);
    this.rangeRing.scale.setScalar(range);
    this.rangeFill.scale.setScalar(range);
    (this.rangeRing.material as THREE.MeshBasicMaterial).color.set(color);
    (this.rangeFill.material as THREE.MeshBasicMaterial).color.set(color);
    this.rangeRing.visible = this.rangeFill.visible = true;
  }

  hideRange(): void {
    this.rangeRing.visible = this.rangeFill.visible = false;
  }

  highlightSpot(index: number): void {
    if (this.padHighlight >= 0) this.refreshPads();
    this.padHighlight = index;
    if (index >= 0) {
      const s = this.run.map.buildSpots[index];
      this.pads.setColorAt(index, new THREE.Color('#fff3a0'));
      this.spotMarker.position.set(s.x, 0.12, s.z);
      this.spotMarker.visible = true;
    } else {
      this.spotMarker.visible = false;
    }
    if (this.pads.instanceColor) this.pads.instanceColor.needsUpdate = true;
  }

  showMoveMarker(x: number, z: number): void {
    this.moveMarker.position.set(x, 0.06, z);
    this.moveMarker.visible = true;
    this.moveMarker.scale.setScalar(1.4);
  }

  project(x: number, y: number, z: number): { x: number; y: number } {
    _v.set(x, y, z).project(this.renderer.camera);
    return { x: (_v.x * 0.5 + 0.5) * this.renderer.width, y: (-_v.y * 0.5 + 0.5) * this.renderer.height };
  }

  // --- Per-frame sync --------------------------------------------------------------

  private _iceGeo: THREE.BufferGeometry | null = null;
  private _iceMat: THREE.Material | null = null;
  private iceGeo(): THREE.BufferGeometry {
    return (this._iceGeo ??= this.track(new THREE.DodecahedronGeometry(0.62, 0)).scale(0.9, 1.25, 0.9));
  }
  private iceMat(): THREE.Material {
    return (this._iceMat ??= this.track(new THREE.MeshLambertMaterial({ color: '#bfeaff', transparent: true, opacity: 0.55, flatShading: true, emissive: new THREE.Color('#2a6a8a') })));
  }

  /** Square outline over a road tile (barricade placement). col < 0 hides it. */
  highlightTile(col: number, row: number): void {
    if (!this.tileMarker) {
      const g = this.track(new THREE.RingGeometry(0.62, 0.7, 4, 1));
      g.rotateZ(Math.PI / 4);
      g.rotateX(-Math.PI / 2);
      this.tileMarker = new THREE.Mesh(g, this.track(new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.9, depthWrite: false })));
      this.root.add(this.tileMarker);
    }
    this.tileMarker.visible = col >= 0;
    if (col >= 0) this.tileMarker.position.set(tileToWorld(col), 0.06, tileToWorld(row));
  }

  /** Rebuilds the synergy links when the set of pairs changes; sparks travel along them. */
  private updateSynergyLinks(dt: number): void {
    const pairs: { a: Tower; b: Tower; color: string }[] = [];
    for (const t of this.run.towers) {
      t.synergies.forEach((id, i) => {
        const b = this.run.towers.find((o) => o.id === t.partners[i]);
        if (b && t.id < b.id) pairs.push({ a: t, b, color: SYNERGY_BY_ID[id].color });
      });
      // Beacon light reaching the towers it empowers.
      if (t.buffedBy >= 0) {
        const b = this.run.towers.find((o) => o.id === t.buffedBy);
        if (b) pairs.push({ a: b, b: t, color: '#ffe08a' });
      }
    }
    const key = pairs.map((p) => `${p.a.id}-${p.b.id}`).join();
    if (key !== this.synergyKey) {
      this.synergyKey = key;
      if (this.synergyLines) {
        this.root.remove(this.synergyLines);
        this.synergyLines.geometry.dispose();
        this.synergyLines = null;
      }
      if (pairs.length) {
        const pos: number[] = [];
        const col: number[] = [];
        const c = new THREE.Color();
        for (const p of pairs) {
          pos.push(p.a.x, 0.16, p.a.z, p.b.x, 0.16, p.b.z);
          c.set(p.color).multiplyScalar(1.6);
          col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        this.synergyLines = new THREE.LineSegments(g, this.synergyMat());
        this.root.add(this.synergyLines);
      }
    }
    if (this.synergyLines) (this.synergyLines.material as THREE.LineBasicMaterial).opacity = 0.55 + Math.sin(this.time * 3) * 0.25;
    for (const p of pairs) {
      if (Math.random() > dt * 2.5) continue;
      const k = Math.random();
      this.particles.burst(p.a.x + (p.b.x - p.a.x) * k, 0.2, p.a.z + (p.b.z - p.a.z) * k, p.color, 1, { speed: 0.1, up: 0.6, size: 0.06, gravity: -0.2, life: 0.6, spread: 0 });
    }
  }

  private _synMat: THREE.LineBasicMaterial | null = null;
  private synergyMat(): THREE.LineBasicMaterial {
    return (this._synMat ??= this.track(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false })));
  }

  private updateWalls(dt: number): void {
    const run = this.run;
    const live = new Set<number>();
    const tier = 1 + Math.min(2, Math.floor(run.waveIndex / 20));
    for (const b of run.barricades) {
      live.add(b.id);
      let w = this.walls.get(b.id);
      if (!w || w.tier !== tier) {
        if (w) this.root.remove(w.group);
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(barricadeModel(tier), this.material);
        mesh.castShadow = true;
        const quad = this.track(new THREE.PlaneGeometry(1, 1));
        const barBg = new THREE.Mesh(quad, this.wallBarMat('#2a1f1f'));
        const bar = new THREE.Mesh(quad, this.wallBarMat('#d9a85a'));
        barBg.renderOrder = bar.renderOrder = 11;
        group.add(mesh);
        this.root.add(group, barBg, bar);
        group.position.set(b.x, 0, b.z);
        // Lie across the road.
        const c = run.map.closestOnPaths(b.x, b.z);
        const pt = run.map.pointAt(c.path, c.dist, { x: 0, z: 0, dx: 0, dz: 0 });
        group.rotation.y = Math.atan2(pt.dx, pt.dz);
        w = { group, mesh, bar, barBg, tier };
        this.walls.set(b.id, w);
      }
      // Shudder while being battered.
      const hit = b.hitT < 0.2 ? (0.2 - b.hitT) / 0.2 : 0;
      w.mesh.position.x = Math.sin(this.time * 70) * 0.03 * hit;
      w.mesh.rotation.z = Math.sin(this.time * 55) * 0.04 * hit;
      if (hit > 0 && Math.random() < dt * 10) this.particles.burst(b.x, 0.3, b.z, '#c9a06a', 1, { speed: 1.2, up: 1.4, size: 0.05, life: 0.4 });
      const frac = Math.max(0, b.hp / b.maxHp);
      const show = frac < 0.999;
      w.bar.visible = w.barBg.visible = show;
      if (show) {
        const cam = this.renderer.camera;
        w.barBg.position.set(b.x, 0.85, b.z);
        w.barBg.quaternion.copy(cam.quaternion);
        w.barBg.scale.set(0.66, 0.09, 1);
        w.bar.position.copy(w.barBg.position).addScaledVector(_right, -(0.6 * (1 - frac)) / 2);
        w.bar.quaternion.copy(cam.quaternion);
        w.bar.scale.set(Math.max(0.001, 0.6 * frac), 0.06, 1);
      }
    }
    for (const [id, w] of this.walls) {
      if (live.has(id)) continue;
      this.root.remove(w.group, w.bar, w.barBg);
      this.walls.delete(id);
    }
  }

  private _wallBarMats = new Map<string, THREE.Material>();
  private wallBarMat(color: string): THREE.Material {
    let m = this._wallBarMats.get(color);
    if (!m) {
      m = this.track(new THREE.MeshBasicMaterial({ color, depthTest: false, toneMapped: false }));
      this._wallBarMats.set(color, m);
    }
    return m;
  }

  private makeHeroAnimator(): void {
    const hero = this.run.hero;
    if (!hero) return;
    if (this.heroAnim) this.root.remove(this.heroAnim.root);
    this.heroAnim = new HeroAnimator(hero.def.id, this.material, (x, z) =>
      this.particles.burst(x, 0.04, z, this.theme.id === 'snow' ? '#ffffff' : this.theme.pathEdge, 2, { speed: 0.4, up: 0.5, size: 0.06, gravity: 1, life: 0.35 }), this.heroGear);
    this.root.add(this.heroAnim.root);
  }

  /** Castle upgrades bought mid-siege: swap in the bigger castle. */
  setCastleLook(tier: number, archers: boolean): void {
    if (tier === this.castleTier && archers === this.castleArchers) return;
    this.castleTier = tier;
    this.castleArchers = archers;
    this.castle.geometry = castleModel(this.castleColor, tier, archers);
    const c = this.run.map.castle;
    this.rings.spawn(c.x, c.z, 1.6, '#ffd84a', 0.8);
    this.particles.burst(c.x, 0.6, c.z, '#ffe680', 24, { speed: 2, up: 3, size: 0.09, life: 0.8 });
  }

  /** Level-up burst; `newGear` ≥ 0 re-dresses the hero in that gear tier. */
  heroLevelUp(newGear: number): void {
    const h = this.run.hero;
    if (!h) return;
    if (newGear >= 0) {
      this.heroGear = newGear;
      this.makeHeroAnimator();
      this.heroAnim?.respawn();
    }
    const col = newGear >= 0 ? HERO_GEAR[newGear].color : '#ffe680';
    this.rings.spawn(h.x, h.z, 0.9, col, 0.6);
    this.rings.spawn(h.x, h.z, 1.4, '#ffffff', 0.8);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.particles.burst(h.x + Math.cos(a) * 0.35, 0.1, h.z + Math.sin(a) * 0.35, i % 2 ? col : '#ffe680', 1, { speed: 0.2, up: 3.5, size: 0.08, gravity: -0.5, life: 0.9, spread: 0 });
    }
    const s = this.project(h.x, 1.4, h.z);
    this.hooks.floatText(s.x, s.y, 'LEVEL UP!', 'heal big');
  }

  /** Boss entrance: shockwave rings, dust and a heavy shake at the tunnel. */
  bossIntro(e: Enemy): void {
    const col = ENEMY_COLORS[e.def.id];
    for (let i = 0; i < 3; i++) this.rings.spawn(e.x, e.z, 1 + i * 0.8, i === 1 ? '#ffffff' : col, 0.7 + i * 0.25);
    this.particles.burst(e.x, 0.1, e.z, '#8a7a6a', 26, { speed: 2.5, up: 2, size: 0.16, gravity: 1, life: 0.9 });
    this.particles.burst(e.x, 0.6, e.z, col, 16, { speed: 2, up: 3, size: 0.1, life: 0.8 });
    this.rig.shake(0.35);
  }

  /** Radial gradient for the hero's aura. */
  private auraTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    grad.addColorStop(0.8, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return this.track(new THREE.CanvasTexture(c));
  }

  /** Shows the warning beacon over new tunnels (or the castle for a new Age) and marching sparks along new roads. */
  showFrontier(roads: number[]): void {
    this.hideFrontier();
    const beacon = new THREE.Group();
    const red = this.track(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff4a3a').multiplyScalar(1.6), transparent: true, opacity: 0.95 }));
    const arrowGeo = this.track(new THREE.ConeGeometry(0.28, 0.55, 4));
    const ringGeo = this.track(new THREE.RingGeometry(0.75, 0.95, 32));
    ringGeo.rotateX(-Math.PI / 2);
    const spots = roads.length ? roads.map((r) => ({ x: this.run.map.paths[r].xs[0], z: this.run.map.paths[r].zs[0] })) : [];
    for (const sp of spots) {
      const arrow = new THREE.Mesh(arrowGeo, red);
      arrow.rotation.x = Math.PI;
      arrow.position.set(sp.x, 2.2, sp.z);
      arrow.name = 'arrow';
      const ring = new THREE.Mesh(ringGeo, red);
      ring.position.set(sp.x, 0.08, sp.z);
      ring.name = 'ring';
      beacon.add(arrow, ring);
    }
    this.root.add(beacon);
    this.frontier = { roads, beacon, t: 0 };
    if (roads.length) this.audio.play('bossRoar', 0.6);
  }

  hideFrontier(): void {
    if (!this.frontier) return;
    this.root.remove(this.frontier.beacon);
    this.frontier = null;
  }

  private updateFrontier(dt: number): void {
    const f = this.frontier;
    if (!f) return;
    f.t += dt;
    for (const o of f.beacon.children) {
      if (o.name === 'arrow') {
        o.position.y = 2.0 + Math.abs(Math.sin(f.t * 3.2)) * 0.45;
        o.rotation.y += dt * 2;
      } else {
        const k = (f.t * 0.9) % 1;
        o.scale.setScalar(0.6 + k * 1.4);
        ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.95;
      }
    }
    // Sparks march from the tunnel to the castle so the new route is obvious.
    for (const r of f.roads) {
      const path = this.run.map.paths[r];
      for (let k = 0; k < 6; k++) {
        const d = (f.t * 3.2 + (k * path.length) / 6) % path.length;
        const pt = this.run.map.pointAt(r, d, { x: 0, z: 0, dx: 0, dz: 0 });
        if (Math.random() < 0.6) this.particles.burst(pt.x, 0.25, pt.z, k % 2 ? '#ff6a4a' : '#ffd36a', 1, { speed: 0.15, up: 0.6, size: 0.11, gravity: 0, life: 0.5, spread: 0 });
      }
    }
  }

  update(dt: number, simSpeed: number): void {
    this.applyNight(false, dt);
    this.updateWeather(dt);
    this.updateFrontier(dt);
    this.updateWalls(dt);
    this.updateSynergyLinks(dt);
    this.time += dt;
    const run = this.run;
    const cam = this.renderer.camera;
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);

    // Enemies.
    const counts = new Map<EnemyId, number>();
    let bars = 0;
    let shadows = 0;
    let bubbles = 0;
    let eliteRings = 0;
    const bgColor = this.barFill.instanceColor!.array as Float32Array;
    for (const e of run.enemies) {
      const dying = !e.alive && e.flash > 0;
      if (!e.alive && !dying) continue;
      const mesh = this.enemyMeshes.get(e.def.id)!;
      const idx = counts.get(e.def.id) ?? 0;
      if (idx >= mesh.instanceMatrix.count) continue;
      counts.set(e.def.id, idx + 1);
      const sc = e.def.scale * ENEMY_VISUAL_SCALE * (e.elite ? ELITE_RULES.scale : 1);
      const yaw = Math.atan2(e.dirX, e.dirZ);
      let y = e.y;
      let rx = 0;
      let rz = 0;
      let sy = sc;
      let sxz = sc;
      if (dying) {
        const k = 1 - e.flash / 0.6;
        rx = k * 1.4;
        y -= k * 0.3;
        sxz = sy = sc * (1 - k * 0.8);
      } else if (e.def.flying) {
        const flap = Math.sin(this.time * 18 + e.phase);
        y += Math.sin(this.time * 3 + e.phase) * 0.08;
        sy = sc * (1 + flap * 0.15);
        sxz = sc * (1 - flap * 0.1);
      } else if (!e.frozen) {
        const speed = e.def.speed * e.slowFactor * simSpeed;
        const bob = Math.abs(Math.sin(this.time * 9 * Math.max(0.6, speed) + e.phase));
        y += bob * 0.05 * sc;
        rz = Math.sin(this.time * 9 * Math.max(0.6, speed) + e.phase) * 0.08;
      }
      if (e.hidden) {
        // Burrowed: only a ripple of sand shows where it travels.
        y -= 0.42 * sc;
        sy *= 0.6;
        if (Math.random() < dt * 12) this.particles.burst(e.x, 0.03, e.z, '#d9c08a', 1, { speed: 0.5, up: 0.7, size: 0.07, gravity: 1.5, life: 0.4 });
      }
      if (e.alive && e.dotTimer > 0 && Math.random() < dt * 9) {
        const burn = e.dotKind === 'burn';
        this.particles.burst(e.x + (Math.random() - 0.5) * 0.2 * sc, y + 0.3 * sc, e.z + (Math.random() - 0.5) * 0.2 * sc, burn ? (Math.random() < 0.5 ? '#ff7a1a' : '#ffd36a') : '#8be05a', 1,
          { speed: 0.2, up: burn ? 1.4 : 0.6, size: burn ? 0.08 : 0.07, gravity: burn ? -1 : -0.3, life: burn ? 0.4 : 0.7 });
      }
      _e.set(rx, yaw, rz, 'YXZ');
      _q.setFromEuler(_e);
      _p.set(e.x, y, e.z);
      _s.set(sxz, sy, sxz);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(idx, _m);
      // Tint.
      let r = 1, g = 1, b = 1;
      if (e.alive && e.flash > 0) { r = g = b = 2.6; }
      else if (e.immuneTimer > 0) { r = 1.9; g = 1.6; b = 0.5; }
      else if (e.frozen && e.stunTimer > 0 && e.slowFactor < 1) { r = 0.6; g = 0.9; b = 1.8; }
      else if (e.slowFactor < 1) { r = 0.75; g = 0.92; b = 1.35; }
      if (e.def.boss && e.chargeTimer <= 0 && e.alive) { r *= 1.6; g *= 0.7; b *= 0.7; }
      if (e.elite && !dying) {
        // Elites glow in their trait colour, pulsing.
        _cTmp.set(ELITES[e.elite].color);
        const k = 0.35 + Math.sin(this.time * 5 + e.phase) * 0.12;
        r = r * (1 - k) + _cTmp.r * 1.8 * k;
        g = g * (1 - k) + _cTmp.g * 1.8 * k;
        b = b * (1 - k) + _cTmp.b * 1.8 * k;
      }
      if (dying) { r = g = b = 0.8; }
      mesh.setColorAt(idx, _cTmp.setRGB(r, g, b));

      if (dying) continue;
      // Shadow blob.
      if (shadows < this.shadows.instanceMatrix.count) {
        const ss = sc * (e.def.flying ? 0.45 : 0.55);
        _m.compose(_p.set(e.x, 0.015, e.z), _q.identity(), _s.set(ss, 1, ss));
        this.shadows.setMatrixAt(shadows++, _m);
      }
      // Elite ring and sparkles.
      if (e.elite && eliteRings < 64 && !e.hidden) {
        const rs = sc * (1.05 + Math.sin(this.time * 4 + e.phase) * 0.08);
        _q.setFromAxisAngle(_up, this.time * 1.5);
        _m.compose(_p.set(e.x, (e.def.flying ? e.y - 0.3 : 0) + 0.03, e.z), _q, _s.set(rs, 1, rs));
        this.eliteRings.setMatrixAt(eliteRings, _m);
        this.eliteRings.setColorAt(eliteRings, _cTmp.set(ELITES[e.elite].color).multiplyScalar(1.6));
        eliteRings++;
        if (Math.random() < dt * 6) this.particles.burst(e.x, e.y + 0.4 * sc, e.z, ELITES[e.elite].color, 1, { speed: 0.4, up: 1, size: 0.06, gravity: -0.5, life: 0.5 });
      }
      // Shield bubble.
      if (e.shielded > 0 && bubbles < this.bubbles.instanceMatrix.count) {
        const bs = sc * 0.95;
        _m.compose(_p.set(e.x, e.y + 0.3 * sc, e.z), _q.identity(), _s.set(bs, bs, bs));
        this.bubbles.setMatrixAt(bubbles++, _m);
      }
      // Health bar.
      const frac = Math.max(0, e.hp / e.maxHp);
      if ((frac < 0.999 || e.def.boss) && bars < 255 && !e.hidden) {
        const w = e.def.boss ? 1.1 : 0.48;
        const h = e.def.boss ? 0.09 : 0.06;
        const by = e.y + (e.def.flying ? 0.45 : 0.78) * sc + 0.1;
        _p.set(e.x, by, e.z);
        _m.compose(_p, cam.quaternion, _s.set(w + 0.04, h + 0.04, 1));
        this.barBg.setMatrixAt(bars, _m);
        const off = (w * (1 - frac)) / 2;
        _p.addScaledVector(_right, -off);
        _m.compose(_p, cam.quaternion, _s.set(Math.max(0.001, w * frac), h, 1));
        this.barFill.setMatrixAt(bars, _m);
        const col = e.elite ? [1.2, 0.85, 0.15] : e.immuneTimer > 0 ? [1, 0.85, 0.2] : frac > 0.5 ? [0.35 + (1 - frac) * 1.2, 0.88, 0.32] : [0.95, 0.3 + frac * 1.0, 0.25];
        bgColor[bars * 3] = col[0];
        bgColor[bars * 3 + 1] = col[1];
        bgColor[bars * 3 + 2] = col[2];
        bars++;
      }
    }
    for (const [id, mesh] of this.enemyMeshes) {
      mesh.count = counts.get(id) ?? 0;
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // Hero.
    const hero = run.hero;
    if (hero && this.heroAnim) {
      // The animator plays the death fall itself, so the hero stays visible until it ends.
      this.heroAnim.root.visible = this.heroAnim.update(dt, this.time, hero);
      if (this.heroAura) this.heroAura.visible = !hero.dead;
      this.heroBar.visible = !hero.dead && hero.hp < hero.maxHp;
      if (!hero.dead) {
        if (this.heroAura) {
          this.heroAura.visible = true;
          this.heroAura.position.set(hero.x, 0.025, hero.z);
          this.heroAura.scale.setScalar(1 + Math.sin(this.time * 3) * 0.06);
        }
        _m.compose(_p.set(hero.x, 0.015, hero.z), _q.identity(), _s.set(0.6, 1, 0.6));
        if (shadows < this.shadows.instanceMatrix.count) this.shadows.setMatrixAt(shadows++, _m);
        const frac = hero.hp / hero.maxHp;
        this.heroBar.position.set(hero.x, 1.15, hero.z).addScaledVector(_right, -(0.5 * (1 - frac)) / 2);
        this.heroBar.quaternion.copy(cam.quaternion);
        this.heroBar.scale.set(0.5 * frac, 0.06, 1);
      }
      this.heroRing.visible = this.heroSelected && !hero.dead;
      if (this.heroRing.visible) {
        this.heroRing.position.set(hero.x, 0.05, hero.z);
        this.heroRing.scale.setScalar(1.1 + Math.sin(this.time * 6) * 0.08);
      }
      if (this.moveMarker.visible) {
        this.moveMarker.scale.multiplyScalar(Math.pow(0.2, dt));
        if (this.moveMarker.scale.x < 0.5 || !hero.moving) this.moveMarker.visible = false;
      }
    }

    // Ally.
    const ally = run.ally;
    this.allyMesh.visible = this.allyRing.visible = ally.active;
    if (ally.active) {
      const atk = ally.attackAnim > 0 ? Math.sin((ally.attackAnim / 0.3) * Math.PI) * 0.15 : 0;
      this.allyMesh.position.set(ally.x, Math.sin(this.time * 3) * 0.03, ally.z);
      this.allyMesh.rotation.set(-atk, ally.facing, 0);
      this.allyRing.position.set(ally.x, 0.05, ally.z);
      this.allyRing.scale.setScalar(1.3 + Math.sin(this.time * 5) * 0.1);
      if (Math.random() < dt * 8) this.particles.burst(ally.x, 0.2, ally.z, '#ffe27a', 1, { speed: 0.5, up: 1.5, size: 0.05, gravity: -1, life: 0.6 });
    }

    this.shadows.count = shadows;
    this.shadows.visible = shadows > 0;
    this.bubbles.visible = bubbles > 0;
    this.barBg.visible = this.barFill.visible = bars > 0;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.bubbles.count = bubbles;
    this.eliteRings.count = eliteRings;
    this.eliteRings.visible = eliteRings > 0;
    this.eliteRings.instanceMatrix.needsUpdate = true;
    if (this.eliteRings.instanceColor) this.eliteRings.instanceColor.needsUpdate = true;
    this.bubbles.instanceMatrix.needsUpdate = true;
    this.barBg.count = this.barFill.count = bars;
    this.barBg.instanceMatrix.needsUpdate = true;
    this.barFill.instanceMatrix.needsUpdate = true;
    this.barFill.instanceColor!.needsUpdate = true;

    this.updateProjectiles();
    this.updateTowers(dt);

    // Castle wobble when hit.
    if (this.castleShake > 0) {
      this.castleShake = Math.max(0, this.castleShake - dt);
      const k = this.castleShake / 0.4;
      this.castle.scale.set(1 + k * 0.08, 1 - k * 0.08, 1 + k * 0.08);
      this.castle.position.x = run.map.castle.x + Math.sin(this.time * 60) * k * 0.05;
    }
    // Spot marker pulse.
    if (this.spotMarker.visible) this.spotMarker.scale.setScalar(1 + Math.sin(this.time * 6) * 0.08);

    this.scenery?.update(dt);
    this.grass?.update(this.time);
    this.particles.update(dt);
    this.rings.update(dt);
    this.bolts.update(dt);
  }

  private updateProjectiles(): void {
    let na = 0, nb = 0, ng = 0;
    const ca = this.projArrow.instanceColor!.array as Float32Array;
    const cg = this.projGlow.instanceColor!.array as Float32Array;
    for (const p of this.run.projectiles) {
      if (!p.active) continue;
      const kind: ProjectileKind = p.kind;
      _p.set(p.x, p.y, p.z);
      if (kind === 'arrow' || kind === 'heroArrow' || kind === 'bolt') {
        if (na >= 128) continue;
        const dx = p.tx - p.x, dz = p.tz - p.z;
        _e.set(0, Math.atan2(dx, dz), 0);
        _q.setFromEuler(_e);
        if (kind === 'bolt') _m.compose(_p, _q, _s.set(1.8, 1.8, 2.2));
        else _m.compose(_p, _q, _s.set(1, 1, kind === 'heroArrow' ? 1.2 : 1));
        this.projArrow.setMatrixAt(na, _m);
        const col = kind === 'heroArrow' ? [0.6, 1, 0.5] : kind === 'bolt' ? [0.75, 0.6, 0.45] : [1, 0.95, 0.8];
        ca[na * 3] = col[0]; ca[na * 3 + 1] = col[1]; ca[na * 3 + 2] = col[2];
        na++;
      } else if (kind === 'cannon' || kind === 'boulder') {
        if (nb >= 48) continue;
        if (kind === 'boulder') {
          _e.set(this.time * 5, this.time * 3, 0);
          _q.setFromEuler(_e);
          _m.compose(_p, _q, _s.setScalar(1.9 + p.splash * 0.3));
        } else _m.compose(_p, _q.identity(), _s.setScalar(1));
        this.projBall.setMatrixAt(nb++, _m);
      } else {
        if (ng >= 96) continue;
        const s = kind === 'champion' ? 1.6 : kind === 'heroBolt' ? 1.3 : kind === 'fire' ? 1.25 : kind === 'poison' ? 1.15 : kind === 'arcane' && p.splash > 0 ? 1.5 : 1;
        _e.set(this.time * 8, this.time * 6, 0);
        _q.setFromEuler(_e);
        _m.compose(_p, _q, _s.setScalar(s));
        this.projGlow.setMatrixAt(ng, _m);
        const col = PROJ_COLORS[kind] ?? [1.5, 1.2, 0.4];
        if (kind === 'fire' && Math.random() < 0.7) this.particles.burst(p.x, p.y, p.z, Math.random() < 0.5 ? '#ff7a1a' : '#ffb347', 1, { speed: 0.2, up: 0.5, size: 0.08, gravity: -0.5, life: 0.25, spread: 0 });
        else if (kind === 'poison' && Math.random() < 0.4) this.particles.burst(p.x, p.y, p.z, '#8be05a', 1, { speed: 0.1, up: 0.2, size: 0.05, gravity: 0.5, life: 0.3, spread: 0 });
        else if (kind === 'arcane' && Math.random() < 0.5) this.particles.burst(p.x, p.y, p.z, '#c8a6ff', 1, { speed: 0.1, up: 0.1, size: 0.05, gravity: 0, life: 0.3, spread: 0 });
        else if (kind === 'gust' && Math.random() < 0.8) this.particles.burst(p.x, p.y, p.z, '#dff8f0', 1, { speed: 0.6, up: 0.2, size: 0.07, gravity: 0, life: 0.35, spread: 0.1 });
        cg[ng * 3] = col[0]; cg[ng * 3 + 1] = col[1]; cg[ng * 3 + 2] = col[2];
        ng++;
      }
      if (this.trailColor && Math.random() < 0.5) this.particles.burst(p.x, p.y, p.z, this.trailColor, 1, { speed: 0.1, up: 0.1, size: 0.05, gravity: 0, life: 0.3, spread: 0 });
    }
    this.projArrow.count = na;
    this.projBall.count = nb;
    this.projGlow.count = ng;
    this.projArrow.visible = na > 0;
    this.projBall.visible = nb > 0;
    this.projGlow.visible = ng > 0;
    this.projArrow.instanceMatrix.needsUpdate = true;
    this.projArrow.instanceColor!.needsUpdate = true;
    this.projBall.instanceMatrix.needsUpdate = true;
    this.projGlow.instanceMatrix.needsUpdate = true;
    this.projGlow.instanceColor!.needsUpdate = true;
  }

  private updateTowers(dt: number): void {
    for (const t of this.run.towers) {
      if (!this.towerViews.has(t.id)) this.ensureTower(t);
      const v = this.towerViews.get(t.id)!;
      // Build / upgrade squash & stretch.
      if (v.anim < 1) {
        v.anim = Math.min(1, v.anim + dt / 0.5);
        const k = v.anim;
        const s = 1 + Math.sin(k * Math.PI * 2.5) * (1 - k) * 0.45;
        v.group.scale.set(1 / Math.sqrt(s), k < 0.15 ? k / 0.15 * s : s, 1 / Math.sqrt(s));
      } else v.group.scale.set(1, 1, 1);
      // Aim.
      let diff = t.aim - v.aim;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      v.aim += diff * Math.min(1, dt * 14);
      if (t.def.id === 'frost') {
        v.head.rotation.y += dt * 1.2;
        v.head.position.y = v.headY + Math.sin(this.time * 2 + t.id) * 0.04;
      } else if (t.def.id === 'mage') {
        v.head.rotation.y += dt * 1.6;
        v.head.position.y = v.headY + Math.sin(this.time * 2.4 + t.id) * 0.05;
        v.head.scale.setScalar(1 + v.recoil * 0.25);
      } else if (t.def.id === 'lightning') {
        v.head.rotation.y += dt * 2;
        const pulse = 1 + v.recoil * 0.3;
        v.head.scale.setScalar(pulse);
      } else if (t.def.id === 'mine') {
        // The winch turns; it jolts when gold comes up.
        v.head.rotation.z += dt * 1.5;
        v.head.scale.setScalar(1 + v.recoil * 0.15);
      } else if (t.def.id === 'beacon') {
        v.head.rotation.y += dt * 0.9;
        v.head.position.y = v.headY + Math.sin(this.time * 1.8 + t.id) * 0.05;
        v.head.scale.setScalar(1 + Math.sin(this.time * 3 + t.id) * 0.05);
        if (Math.random() < dt * 3) this.particles.burst(t.x, v.headY + 0.3, t.z, '#ffe08a', 1, { speed: 0.4, up: 0.8, size: 0.06, gravity: -0.3, life: 0.9 });
      } else if (t.def.id === 'gale') {
        // Vanes spin, faster just after a gust.
        v.head.rotation.y += dt * (2 + v.recoil * 10);
      } else {
        v.head.rotation.y = v.aim;
        const rec = v.recoil * 0.06;
        v.head.position.x = -Math.sin(v.aim) * rec;
        v.head.position.z = -Math.cos(v.aim) * rec;
        v.head.scale.set(1, 1 - v.recoil * 0.08, 1);
      }
      v.recoil = Math.max(0, v.recoil - dt * 6);
      if (t.frozen > 0 && !v.ice) {
        v.ice = new THREE.Mesh(this.iceGeo(), this.iceMat());
        v.ice.position.y = 0.55;
        v.group.add(v.ice);
      }
      if (v.ice) {
        v.ice.visible = t.frozen > 0;
        if (v.ice.visible) v.ice.scale.set(1, 0.9 + Math.min(1, t.frozen) * 0.15, 1);
      }
      // Precious materials sparkle.
      if (t.tier >= 6 && Math.random() < dt * (t.tier - 4) * 0.6) {
        this.particles.burst(t.x + (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 1.2, t.z + (Math.random() - 0.5) * 0.6, materialFor(t.tier).accent, 1, { speed: 0.2, up: 0.8, size: 0.05, gravity: -0.5, life: 0.8 });
      }
    }
  }

  dispose(): void {
    this.unsub.forEach((u) => u());
    this.renderer.scene.remove(this.root);
    for (const d of this.disposables) d.dispose();
    for (const d of this.boardDisposables) d.dispose();
    this.scenery?.dispose();
    this.grass?.dispose();
    this.overgrowth?.geometry.dispose();
    this.propsMesh?.geometry.dispose();
    for (const m of this.enemyMeshes.values()) m.dispose();
    this.particles.dispose();
    this.weather?.dispose();
    this.renderer.setWeather(0, '#ffffff', 0);
    this.rings.dispose();
    this.bolts.dispose();
    this.material.dispose();
  }
}

const _cTmp = new THREE.Color();
/** Enemies are drawn a bit larger than their logical size for readability on phones. */
const ENEMY_VISUAL_SCALE = 1.3;

export function enemyColor(id: EnemyId): string {
  return ENEMY_COLORS[id];
}

