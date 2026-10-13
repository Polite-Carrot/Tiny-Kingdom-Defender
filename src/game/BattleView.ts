// 3D presentation of a Run: diorama board, towers, instanced enemies/projectiles and juice.

import * as THREE from 'three';
import type { Renderer } from '../core/Renderer';
import type { CameraRig } from '../core/CameraRig';
import { ModelBuilder, mergeTransformed } from '../entities/ModelBuilder';
import { towerModel, enemyModel, heroModel, castleModel, spawnModel, padModel, propModel } from '../entities/Models';
import { Particles, Rings, Bolts } from '../systems/Effects';
import type { AudioSystem } from '../systems/Audio';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { CHAPTERS, GRID_SIZE, type ChapterTheme } from '../data/levels';
import { tileToWorld } from './LevelMap';
import type { Run, Tower, ProjectileKind } from './Run';

export interface ViewHooks {
  floatText(sx: number, sy: number, text: string, cls: string): void;
  coinFly(sx: number, sy: number, amount: number): void;
  castleHit(): void;
}

const ENEMY_COLORS: Record<EnemyId, string> = {
  grunt: '#7fb24f', runner: '#e0913a', knight: '#b9c2cf', bat: '#5b3f73', shaman: '#6a4aa0', shield: '#b0884f', minion: '#c0392b',
  boss_ogre: '#8aa05a', boss_scorpion: '#c9a063', boss_yeti: '#eef3f7', boss_dragon: '#b8322a',
};

const GROUND_PLANE: Record<string, string> = { meadow: '#78c3e6', desert: '#e3bd7c', snow: '#d5e5f3', volcano: '#e8481a' };

interface TowerView {
  group: THREE.Group;
  base: THREE.Mesh;
  head: THREE.Mesh;
  anim: number;
  recoil: number;
  tier: number;
  branch: number;
  aim: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
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
  private projArrow!: THREE.InstancedMesh;
  private projBall!: THREE.InstancedMesh;
  private projGlow!: THREE.InstancedMesh;
  private towerViews = new Map<number, TowerView>();
  private pads!: THREE.InstancedMesh;
  private heroMesh: THREE.Mesh | null = null;
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
  private theme: ChapterTheme;
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
    cosmetics: { castleColor: string; trailColor: string | null },
  ) {
    this.theme = CHAPTERS[run.config.level.chapter].theme;
    this.trailColor = cosmetics.trailColor ? new THREE.Color(cosmetics.trailColor) : null;
    const t = this.theme;
    renderer.setTheme(t.sky, t.fog, t.sun, t.ambient);
    this.particles = new Particles(renderer.quality === 'high' ? 900 : 400);
    this.root.add(this.particles.mesh, this.rings.group, this.bolts.group);
    this.buildBoard(cosmetics.castleColor);
    this.buildDynamic();
    renderer.scene.add(this.root);
    this.bindEvents();
  }

  private track<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  // --- Board ------------------------------------------------------------------

  private buildBoard(castleColor: string): void {
    const t = this.theme;
    const map = this.run.map;
    const b = new ModelBuilder();
    const half = GRID_SIZE / 2 + 1;
    // Diorama body.
    b.box(half * 2, 1.0, half * 2, t.cliff, { y: -0.62 });
    b.box(half * 2 - 0.5, 0.8, half * 2 - 0.5, t.cliffDark, { y: -1.4 });
    // Tiles.
    const rnd = (i: number) => ((Math.sin(i * 91.7) * 43758.5453) % 1 + 1) % 1;
    const pathOff = new Set<number>();
    for (const p of map.layout.paths) pathOff.add((p[0][1] + 1) * 64 + (p[0][0] + 1));
    const grass = new THREE.Color(t.grass);
    const grassAlt = new THREE.Color(t.grassAlt);
    const tmp = new THREE.Color();
    for (let r = -1; r <= GRID_SIZE; r++) {
      for (let c = -1; c <= GRID_SIZE; c++) {
        const x = tileToWorld(c);
        const z = tileToWorld(r);
        const inside = c >= 0 && r >= 0 && c < GRID_SIZE && r < GRID_SIZE;
        const isPath = inside ? map.isPath(c, r) : pathOff.has((r + 1) * 64 + (c + 1));
        const i = (r + 2) * 31 + c;
        if (isPath) {
          b.box(1, 0.12, 1, t.path, { x, y: -0.1, z });
          // Little stones along the path.
          if (rnd(i) > 0.6) b.box(0.12, 0.04, 0.1, t.pathEdge, { x: x + (rnd(i + 3) - 0.5) * 0.7, y: -0.03, z: z + (rnd(i + 5) - 0.5) * 0.7, ry: rnd(i) * 3 });
        } else {
          tmp.copy((c + r) % 2 === 0 ? grass : grassAlt).multiplyScalar(0.96 + rnd(i) * 0.08);
          if (!inside) tmp.multiplyScalar(0.9);
          const h = 0.2 + rnd(i + 11) * 0.03;
          b.box(1, h, 1, tmp.getStyle(), { x, y: -0.12 + h / 2 - 0.04, z });
        }
      }
    }
    const boardGeo = this.track(b.build());
    const board = new THREE.Mesh(boardGeo, this.material);
    board.receiveShadow = true;
    this.root.add(board);

    // Sea / sand / lava plane around the diorama.
    const planeMat = this.track(t.id === 'volcano'
      ? new THREE.MeshBasicMaterial({ color: GROUND_PLANE[t.id] })
      : new THREE.MeshLambertMaterial({ color: GROUND_PLANE[t.id] ?? t.fog }));
    const plane = new THREE.Mesh(this.track(new THREE.PlaneGeometry(140, 140)), planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -1.3;
    this.root.add(plane);

    // Props merged into one draw call.
    const items = map.props.map((p) => ({ geo: propModel(p.type), x: p.x, y: 0, z: p.z, ry: p.rot, s: p.scale }));
    // Rim decoration.
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const side = i % 4;
      const k = (i * 0.37) % 1;
      const px = side === 0 ? -half + 0.45 : side === 1 ? half - 0.45 : (k - 0.5) * (half * 2 - 1);
      const pz = side === 2 ? -half + 0.45 : side === 3 ? half - 0.45 : (k - 0.5) * (half * 2 - 1);
      const c = Math.round(px + (GRID_SIZE - 1) / 2);
      const r = Math.round(pz + (GRID_SIZE - 1) / 2);
      if (pathOff.has((r + 1) * 64 + (c + 1))) continue;
      items.push({ geo: propModel(t.props[i % t.props.length]), x: px, y: 0, z: pz, ry: a, s: 0.9 });
    }
    if (items.length) {
      const propsMesh = new THREE.Mesh(this.track(mergeTransformed(items)), this.material);
      propsMesh.castShadow = true;
      propsMesh.receiveShadow = true;
      this.root.add(propsMesh);
    }

    // Build pads (instanced so they can be highlighted individually).
    this.pads = new THREE.InstancedMesh(padModel(), this.material, Math.max(1, map.buildSpots.length));
    this.padColor.set(t.pad);
    map.buildSpots.forEach((s, i) => {
      _m.makeTranslation(s.x, 0, s.z);
      this.pads.setMatrixAt(i, _m);
      this.pads.setColorAt(i, this.padColor);
    });
    this.pads.receiveShadow = true;
    this.root.add(this.pads);

    // Castle, facing the incoming path.
    const cp = map.paths[0];
    const n = cp.xs.length;
    const dirX = cp.xs[n - 2] - cp.xs[n - 1];
    const dirZ = cp.zs[n - 2] - cp.zs[n - 1];
    this.castle = new THREE.Mesh(castleModel(castleColor), this.material);
    this.castle.position.set(map.castle.x, 0, map.castle.z);
    this.castle.rotation.y = Math.atan2(dirX, dirZ);
    this.castle.castShadow = true;
    this.root.add(this.castle);

    // Spawn caves.
    const seen = new Set<string>();
    map.paths.forEach((p) => {
      const key = `${p.xs[0]},${p.zs[0]}`;
      if (seen.has(key)) return;
      seen.add(key);
      const m = new THREE.Mesh(spawnModel(t.id), this.material);
      m.position.set(p.xs[0], 0, p.zs[0]);
      m.rotation.y = Math.atan2(p.xs[1] - p.xs[0], p.zs[1] - p.zs[0]);
      m.castShadow = true;
      this.root.add(m);
    });
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
      const cap = ENEMIES[id].boss ? 4 : id === 'minion' ? 64 : 160;
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
      this.heroMesh = new THREE.Mesh(heroModel(hero.def.id), this.material);
      this.heroMesh.castShadow = true;
      this.root.add(this.heroMesh);
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
      if (hero.def.range <= 1.5) this.audio.play('heroHit');
      else if (hero.def.damageType === 'magic') this.audio.play('frost', 0.6);
      else this.audio.play('arrow', 0.8);
    });
    on('heroAbility', ({ hero, x, z, radius }) => {
      const kind = hero.def.ability.kind;
      if (kind === 'arrowRain') {
        for (let i = 0; i < 30; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * radius;
          this.particles.burst(x + Math.cos(a) * r, 2.5, z + Math.sin(a) * r, '#fff2c4', 1, { speed: 0.1, up: -6, size: 0.08, gravity: 10, life: 0.5 });
        }
        this.rings.spawn(x, z, radius, '#9dff8a', 0.6);
        this.audio.play('arrowRain');
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
    on('heroDeath', (h) => {
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
      v = { group, base, head, anim: 0, recoil: 0, tier: t.tier, branch: t.branch, aim: 0 };
      this.towerViews.set(t.id, v);
    }
    v.base.geometry = model.base;
    v.head.geometry = model.head;
    v.head.position.y = model.headY;
    v.tier = t.tier;
    v.branch = t.branch;
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
    if (this.padHighlight >= 0) this.pads.setColorAt(this.padHighlight, this.padColor);
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

  update(dt: number, simSpeed: number): void {
    this.time += dt;
    const run = this.run;
    const cam = this.renderer.camera;
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);

    // Enemies.
    const counts = new Map<EnemyId, number>();
    let bars = 0;
    let shadows = 0;
    let bubbles = 0;
    const bgColor = this.barFill.instanceColor!.array as Float32Array;
    for (const e of run.enemies) {
      const dying = !e.alive && e.flash > 0;
      if (!e.alive && !dying) continue;
      const mesh = this.enemyMeshes.get(e.def.id)!;
      const idx = counts.get(e.def.id) ?? 0;
      if (idx >= mesh.instanceMatrix.count) continue;
      counts.set(e.def.id, idx + 1);
      const sc = e.def.scale * ENEMY_VISUAL_SCALE;
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
      if (dying) { r = g = b = 0.8; }
      mesh.setColorAt(idx, _cTmp.setRGB(r, g, b));

      if (dying) continue;
      // Shadow blob.
      if (shadows < this.shadows.instanceMatrix.count) {
        const ss = sc * (e.def.flying ? 0.45 : 0.55);
        _m.compose(_p.set(e.x, 0.015, e.z), _q.identity(), _s.set(ss, 1, ss));
        this.shadows.setMatrixAt(shadows++, _m);
      }
      // Shield bubble.
      if (e.shielded > 0 && bubbles < this.bubbles.instanceMatrix.count) {
        const bs = sc * 0.95;
        _m.compose(_p.set(e.x, e.y + 0.3 * sc, e.z), _q.identity(), _s.set(bs, bs, bs));
        this.bubbles.setMatrixAt(bubbles++, _m);
      }
      // Health bar.
      const frac = Math.max(0, e.hp / e.maxHp);
      if ((frac < 0.999 || e.def.boss) && bars < 255) {
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
        const col = e.immuneTimer > 0 ? [1, 0.85, 0.2] : frac > 0.5 ? [0.35 + (1 - frac) * 1.2, 0.88, 0.32] : [0.95, 0.3 + frac * 1.0, 0.25];
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
    if (hero && this.heroMesh) {
      this.heroMesh.visible = !hero.dead;
      this.heroBar.visible = !hero.dead && hero.hp < hero.maxHp;
      if (!hero.dead) {
        const bob = hero.moving ? Math.abs(Math.sin(this.time * 12)) * 0.06 : 0;
        const atk = hero.attackAnim > 0 ? Math.sin((hero.attackAnim / 0.25) * Math.PI) * 0.12 : 0;
        this.heroMesh.position.set(hero.x, bob, hero.z);
        this.heroMesh.rotation.set(-atk, hero.facing, 0);
        this.heroMesh.scale.setScalar(1.25);
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
      if (kind === 'arrow' || kind === 'heroArrow') {
        if (na >= 128) continue;
        const dx = p.tx - p.x, dz = p.tz - p.z;
        _e.set(0, Math.atan2(dx, dz), 0);
        _q.setFromEuler(_e);
        _m.compose(_p, _q, _s.set(1, 1, kind === 'heroArrow' ? 1.2 : 1));
        this.projArrow.setMatrixAt(na, _m);
        const col = kind === 'heroArrow' ? [0.6, 1, 0.5] : [1, 0.95, 0.8];
        ca[na * 3] = col[0]; ca[na * 3 + 1] = col[1]; ca[na * 3 + 2] = col[2];
        na++;
      } else if (kind === 'cannon') {
        if (nb >= 48) continue;
        _m.compose(_p, _q.identity(), _s.setScalar(1));
        this.projBall.setMatrixAt(nb++, _m);
      } else {
        if (ng >= 96) continue;
        const s = kind === 'champion' ? 1.6 : kind === 'heroBolt' ? 1.3 : 1;
        _e.set(this.time * 8, this.time * 6, 0);
        _q.setFromEuler(_e);
        _m.compose(_p, _q, _s.setScalar(s));
        this.projGlow.setMatrixAt(ng, _m);
        const col = kind === 'frost' ? [0.7, 0.95, 1.4] : kind === 'heroBolt' ? [1.3, 0.6, 1.5] : [1.5, 1.2, 0.4];
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
        v.head.position.y = towerModelHeadY(v) + Math.sin(this.time * 2 + t.id) * 0.04;
      } else if (t.def.id === 'lightning') {
        v.head.rotation.y += dt * 2;
        const pulse = 1 + v.recoil * 0.3;
        v.head.scale.setScalar(pulse);
      } else {
        v.head.rotation.y = v.aim;
        const rec = v.recoil * 0.06;
        v.head.position.x = -Math.sin(v.aim) * rec;
        v.head.position.z = -Math.cos(v.aim) * rec;
        v.head.scale.set(1, 1 - v.recoil * 0.08, 1);
      }
      v.recoil = Math.max(0, v.recoil - dt * 6);
    }
  }

  dispose(): void {
    this.unsub.forEach((u) => u());
    this.renderer.scene.remove(this.root);
    for (const d of this.disposables) d.dispose();
    for (const m of this.enemyMeshes.values()) m.dispose();
    this.particles.dispose();
    this.rings.dispose();
    this.bolts.dispose();
    this.material.dispose();
  }
}

const _cTmp = new THREE.Color();
/** Enemies are drawn a bit larger than their logical size for readability on phones. */
const ENEMY_VISUAL_SCALE = 1.3;
function towerModelHeadY(v: TowerView): number {
  return 0.85 + Math.min(v.tier, 4) * 0.1;
}

export function enemyColor(id: EnemyId): string {
  return ENEMY_COLORS[id];
}

