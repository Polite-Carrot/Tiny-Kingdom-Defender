// The world around the board: an island of rolling hills with trees, animated water (or sand,
// ice, lava), distant mountains, a sky dome, drifting clouds and floating ambient particles.
// Everything is low-poly, vertex-coloured and built in code. One instance per Age theme.

import * as THREE from 'three';
import { ModelBuilder, mergeTransformed } from '../entities/ModelBuilder';
import { propModel } from '../entities/Models';
import type { Theme } from '../data/themes';
import { Water } from './Water';
import { Grass, type BladeSpot } from './Grass';
import { Moat } from './Moat';
import { ModelBuilder as MB } from '../entities/ModelBuilder';

/** Smooth 2D value noise in [0, 1]. */
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, y: number) => noise(x, y) * 0.6 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.1;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Look {
  /** Dry sand, wet sand at the waterline, and the sea floor further out. */
  beach: string;
  wet: string;
  floor: string;
  low: string;
  high: string;
  rock: string;
  peak: string | null;
  cloud: string;
  particle: string;
  particleMode: 'pollen' | 'dust' | 'snow' | 'embers';
}

const LOOKS: Record<Theme['id'], Look> = {
  meadow: { beach: '#ecdcaa', wet: '#bba274', floor: '#5f8f86', low: '#7fc057', high: '#5fa44a', rock: '#8d8577', peak: '#f4f8fb', cloud: '#ffffff', particle: '#fff3a6', particleMode: 'pollen' },
  desert: { beach: '#f4dcaa', wet: '#c9a978', floor: '#5f9a8e', low: '#e8c47e', high: '#d7a462', rock: '#b9773f', peak: null, cloud: '#fff8ec', particle: '#f0d8a8', particleMode: 'dust' },
  snow: { beach: '#e6eef5', wet: '#aab9c8', floor: '#56738c', low: '#eef5fb', high: '#dce7f1', rock: '#7d8fa6', peak: '#ffffff', cloud: '#f4f8ff', particle: '#ffffff', particleMode: 'snow' },
  volcano: { beach: '#3a2e30', wet: '#241b1d', floor: '#2a1612', low: '#5e4c50', high: '#4a3a3f', rock: '#241b1f', peak: '#ff7a2a', cloud: '#5b4b52', particle: '#ffb347', particleMode: 'embers' },
};

/** Half-size of the board's square footprint (the plateau). */
const BOARD_HALF = 8.6;
const WATER_Y = -1.18;
/** The moat: from the plateau out to a stone retaining wall this far away. */
const MOAT_W = 1.5;
// The moat water is opaque, so its floor sits just under the surface: that keeps the step
// up to the bank short enough to hide behind the wall stones.
const MOAT_FLOOR = -1.42;
const WALL_TOP = -0.84;
/** The plateau itself (the board) is a little inside BOARD_HALF. */
const PLATEAU_HALF = 8.5;
const TERRAIN_SIZE = 84;

export class Scenery {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private water: Water;
  private grass: Grass | null = null;
  private moat: Moat | null = null;
  private clouds = new THREE.Group();
  private particles: THREE.Points;
  private pVel: Float32Array;
  private time = 0;
  private look: Look;

  constructor(private theme: Theme, private animated: boolean) {
    this.look = LOOKS[theme.id];
    const lambert = this.track(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.group.add(this.buildSky());
    this.group.add(new THREE.Mesh(this.track(this.buildTerrain()), lambert));
    const props = this.buildProps();
    if (props) this.group.add(new THREE.Mesh(this.track(props), lambert));
    this.group.add(new THREE.Mesh(this.track(this.buildMountains()), lambert));
    const cloudMat = this.track(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new THREE.Color(theme.id === 'volcano' ? '#2a1a1e' : '#9aa6b8') }));
    this.buildClouds(cloudMat);
    this.group.add(this.clouds);

    if (animated) this.buildGrass();
    this.group.add(this.buildSunGlow());

    // The moat: stone walls, reflective still water, lily pads and reeds (lava stays lava).
    this.group.add(new THREE.Mesh(this.track(this.buildMoatWalls()), lambert));
    const hasMoat = Moat.supports(theme);
    if (hasMoat) {
      this.moat = this.track(new Moat(theme, WATER_Y, PLATEAU_HALF, BOARD_HALF, MOAT_W, animated));
      this.group.add(this.moat.mesh);
      const life = this.buildMoatLife();
      if (life) this.group.add(new THREE.Mesh(this.track(life), lambert));
    }

    // Sea (or lava), with waves; a lighter grid on low quality.
    this.water = this.track(new Water(theme, WATER_Y, BOARD_HALF, (x, z) => this.groundHeight(x, z), TERRAIN_SIZE, animated ? 200 : 110, hasMoat ? MOAT_W : 0));
    this.group.add(this.water.mesh);

    // Ambient particles: pollen, dust, snow or embers.
    const n = animated ? 220 : 90;
    const pos = new Float32Array(n * 3);
    this.pVel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.resetParticle(pos, i, true);
    const pgeo = this.track(new THREE.BufferGeometry());
    pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pmat = this.track(new THREE.PointsMaterial({
      color: this.look.particle, size: this.look.particleMode === 'snow' ? 0.13 : 0.09, transparent: true,
      opacity: this.look.particleMode === 'dust' ? 0.55 : 0.85, depthWrite: false,
      blending: this.look.particleMode === 'embers' ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    this.particles = new THREE.Points(pgeo, pmat);
    this.particles.frustumCulled = false;
    this.group.add(this.particles);
  }

  private track<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  // --- Sky ----------------------------------------------------------------------

  private buildSky(): THREE.Mesh {
    const geo = this.track(new THREE.SphereGeometry(240, 32, 16));
    const top = new THREE.Color(this.theme.sky).offsetHSL(0, 0.12, -0.12);
    const horizon = new THREE.Color(this.theme.fog);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const k = smooth(-0.05, 0.6, pos.getY(i) / 240);
      c.copy(horizon).lerp(top, k);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = this.track(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    const sky = new THREE.Mesh(geo, mat);
    sky.renderOrder = -10;
    return sky;
  }

  /** A soft glow where the sun sits in the sky (picked up by the bloom on high quality). */
  private buildSunGlow(): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.12, 'rgba(255,248,225,0.95)');
    grad.addColorStop(0.35, 'rgba(255,230,170,0.35)');
    grad.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = this.track(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    const volcano = this.theme.id === 'volcano';
    const mat = this.track(new THREE.SpriteMaterial({
      map: tex, color: new THREE.Color(volcano ? '#ff9a5a' : this.theme.sun).multiplyScalar(volcano ? 1.2 : 1.6),
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    }));
    const sprite = new THREE.Sprite(mat);
    // Same direction as the scene's directional light, just above the horizon so it is in view.
    const dir = new THREE.Vector3(-6, 3.2, 7).normalize();
    sprite.position.copy(dir.multiplyScalar(200));
    sprite.scale.setScalar(volcano ? 40 : 55);
    sprite.renderOrder = -9;
    return sprite;
  }

  /** Grass blades across the island's meadows. */
  private buildGrass(): void {
    const id = this.theme.id;
    const density = ({ meadow: 1, desert: 0.2, snow: 0.12, volcano: 0.08 } as const)[id];
    const base = new THREE.Color(id === 'desert' ? '#c9b26a' : id === 'snow' ? '#a9c2a0' : id === 'volcano' ? '#7a6a4a' : this.look.low);
    const spots: BladeSpot[] = [];
    const target = Math.round(16000 * density);
    for (let i = 0; i < target * 3 && spots.length < target; i++) {
      const a = hash(i, 0.71) * Math.PI * 2;
      const r = BOARD_HALF + 0.4 + Math.sqrt(hash(i, 1.93)) * 26;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < BOARD_HALF + 0.2 && Math.abs(z) < BOARD_HALF + 0.2) continue;
      const y = this.height(x, z);
      if (y < WATER_Y + 0.55 || y > 1.6) continue;
      // Skip steep slopes.
      if (Math.abs(this.height(x + 0.4, z) - y) + Math.abs(this.height(x, z + 0.4) - y) > 0.5) continue;
      // Patchy meadows rather than an even carpet.
      if (fbm(x * 0.2 + 5, z * 0.2) < 0.38) continue;
      spots.push({ x, y: y - 0.02, z, h: 0.9 + hash(i, 3.1) * 1.1, color: base.clone().multiplyScalar(0.78 * (0.85 + hash(i, 5.3) * 0.35)) });
    }
    if (!spots.length) return;
    this.grass = this.track(new Grass(spots, id === 'meadow' ? 1 : 0.6));
    this.group.add(this.grass.mesh);
  }

  // --- Moat -------------------------------------------------------------------------

  /** Walks a rounded square `dist` out from the board, calling fn(x, z, angleOfTangent) every `step`. */
  private aroundBoard(dist: number, step: number, fn: (x: number, z: number, ry: number, i: number) => void): void {
    const b = BOARD_HALF;
    let i = 0;
    for (let side = 0; side < 4; side++) {
      const a = (side * Math.PI) / 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // Straight run along this side.
      const n = Math.ceil((2 * b) / step);
      for (let k = 0; k < n; k++) {
        const u = -b + ((k + 0.5) / n) * 2 * b;
        // Side 0 is +X; rotate (b + dist, u) by a.
        const lx = b + dist, lz = u;
        fn(lx * ca - lz * sa, lx * sa + lz * ca, -a, i++);
      }
      // Rounded corner to the next side.
      const arc = (Math.PI / 2) * dist;
      const m = Math.max(1, Math.ceil(arc / step));
      for (let k = 0; k < m; k++) {
        const t = a + ((k + 0.5) / m) * (Math.PI / 2);
        // Corner centre between this side and the next.
        const ccx = (ca - sa) * b, ccz = (sa + ca) * b;
        fn(ccx + Math.cos(t) * dist, ccz + Math.sin(t) * dist, -t, i++);
      }
    }
  }

  /** Masonry retaining wall round the moat, and stone footings on the castle island side. */
  private buildMoatWalls(): THREE.BufferGeometry {
    const b = new MB();
    const id = this.theme.id;
    const stone = id === 'desert' ? '#c9a26a' : id === 'snow' ? '#8a9ab0' : id === 'volcano' ? '#3a3034' : '#9b958c';
    const coping = id === 'desert' ? '#d8b47a' : id === 'snow' ? '#a8b6c8' : id === 'volcano' ? '#4a3e42' : '#b0a99c';
    const moss = id === 'meadow' ? '#5f7d3a' : id === 'desert' ? '#8a7a4a' : null;
    const base = new THREE.Color(stone);
    const c = new THREE.Color();
    const rows = [-1.36, -1.18, -1.0];
    const rowH = 0.18;
    const thick = 0.3;
    // Outer wall: three courses of staggered blocks, then overhanging coping slabs.
    rows.forEach((y, r) => {
      this.aroundBoard(MOAT_W + thick / 2, 0.42, (x, z, ry, i) => {
        const j = hash(i * 1.7 + r * 13.1, r * 3.3);
        c.copy(base).multiplyScalar(0.82 + j * 0.3);
        // Wet and darker at the waterline; moss creeping on the lowest courses.
        if (y < WATER_Y + 0.12) c.multiplyScalar(0.62);
        if (moss && y < WATER_Y + 0.2 && hash(i, r + 7.7) > 0.55) c.lerp(new THREE.Color(moss), 0.55);
        b.box(0.4, rowH * 0.94, thick, c, { x, y, z, ry: ry + Math.PI / 2 });
      });
    });
    this.aroundBoard(MOAT_W + thick / 2 - 0.03, 0.55, (x, z, ry, i) => {
      c.set(coping).multiplyScalar(0.9 + hash(i, 4.4) * 0.18);
      b.box(0.54, 0.08, thick + 0.1, c, { x, y: WALL_TOP, z, ry: ry + Math.PI / 2 });
      if (id === 'snow') b.box(0.5, 0.04, thick + 0.06, '#f4f8fb', { x, y: WALL_TOP + 0.06, z, ry: ry + Math.PI / 2 });
      // Grass tufts or snow lumps along the top edge now and then.
      if (id === 'meadow' && hash(i, 9.1) > 0.7) b.cone(0.05, 0.1, 3, '#5fa44a', { x, y: WALL_TOP + 0.08, z });
    });
    // Footings: dressed stone round the castle island where it meets the water.
    for (let side = 0; side < 4; side++) {
      const a = (side * Math.PI) / 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const n = 40;
      for (let r = 0; r < 4; r++) {
        for (let k = 0; k < n; k++) {
          const u = -PLATEAU_HALF + ((k + 0.5 + (r % 2) * 0.5) / n) * 2 * PLATEAU_HALF;
          // Stop short of the corner so the four sides meet without stones jutting out.
          if (Math.abs(u) > PLATEAU_HALF - 0.08) continue;
          const lx = PLATEAU_HALF + 0.06, lz = u;
          const j = hash(k * 2.3 + side * 17, r);
          c.copy(base).multiplyScalar((0.75 + j * 0.25) * (r === 0 ? 0.62 : r === 3 ? 0.92 : 1));
          if (moss && r === 0 && hash(k, side + 3.1) > 0.5) c.lerp(new THREE.Color(moss), 0.5);
          b.box(0.42, 0.19, 0.14, c, { x: lx * ca - lz * sa, y: -1.3 + r * 0.19, z: lx * sa + lz * ca, ry: -a + Math.PI / 2 });
        }
      }
    }
    return b.build();
  }

  /** Lily pads and flowers on the water, reeds and cattails at the foot of the wall. */
  private buildMoatLife(): THREE.BufferGeometry | null {
    const id = this.theme.id;
    if (id !== 'meadow' && id !== 'desert') return null;
    const b = new MB();
    const y = WATER_Y + 0.012;
    let placed = 0;
    for (let i = 0; i < 400 && placed < 26; i++) {
      // A random point in the moat ring.
      const dist = 0.35 + hash(i, 0.77) * (MOAT_W - 0.7);
      const side = Math.floor(hash(i, 2.2) * 4);
      const u = (hash(i, 5.5) - 0.5) * 2 * BOARD_HALF;
      const ang = (side * Math.PI) / 2;
      const lx = BOARD_HALF + dist, lz = u;
      const x = lx * Math.cos(ang) - lz * Math.sin(ang), z = lx * Math.sin(ang) + lz * Math.cos(ang);
      if (id === 'meadow') {
        // A little raft of pads, sometimes with a water lily.
        const n = 2 + Math.floor(hash(i, 8.8) * 3);
        for (let k = 0; k < n; k++) {
          const px = x + (hash(i, k + 10) - 0.5) * 0.35, pz = z + (hash(i, k + 20) - 0.5) * 0.35;
          const r = 0.07 + hash(i, k + 30) * 0.06;
          const g = new THREE.Color('#4f8f3a').multiplyScalar(0.85 + hash(i, k + 40) * 0.3);
          b.cyl(r, r, 0.012, 12, g, { x: px, y, z: pz });
          b.box(r, 0.014, 0.012, '#2f5f2a', { x: px + r / 2, y: y + 0.001, z: pz, ry: hash(i, k + 50) * 6 });
          if (k === 0 && hash(i, 60) > 0.5) {
            const petal = hash(i, 61) > 0.5 ? '#ffd0e0' : '#ffffff';
            for (let p = 0; p < 6; p++) b.cone(0.022, 0.05, 3, petal, { x: px + Math.cos(p) * 0.025, y: y + 0.025, z: pz + Math.sin(p) * 0.025, rz: Math.cos(p) * 0.6, rx: -Math.sin(p) * 0.6 });
            b.ball(0.014, 0, '#ffd84a', { x: px, y: y + 0.04, z: pz });
          }
        }
      }
      placed++;
    }
    // Reeds and cattails hugging the outer wall.
    this.aroundBoard(MOAT_W - 0.08, 0.5, (x, z, _ry, i) => {
      if (hash(i, 77.7) < 0.55) return;
      const n = 3 + Math.floor(hash(i, 78) * 4);
      for (let k = 0; k < n; k++) {
        const px = x + (hash(i, k + 80) - 0.5) * 0.18, pz = z + (hash(i, k + 90) - 0.5) * 0.18;
        const h = 0.28 + hash(i, k + 100) * 0.25;
        const lean = (hash(i, k + 110) - 0.5) * 0.3;
        b.cyl(0.008, 0.014, h, 4, id === 'desert' ? '#8a9a4a' : '#5f8a3a', { x: px, y: WATER_Y + h / 2, z: pz, rz: lean });
        if (hash(i, k + 120) > 0.5) b.capsule(0.022, 0.07, '#6a4428', { x: px + Math.sin(-lean) * h * 0.85, y: WATER_Y + h * 0.88, z: pz });
      }
    });
    return b.build();
  }

  // --- Island terrain ---------------------------------------------------------------

  /** Terrain height around the board: low next to the plateau, hills further out, sinking into the sea. */
  private height(x: number, z: number): number {
    const dx = Math.max(0, Math.abs(x) - BOARD_HALF);
    const dz = Math.max(0, Math.abs(z) - BOARD_HALF);
    const d = Math.hypot(dx, dz);
    if (d < MOAT_W) return MOAT_FLOOR;
    // Behind the retaining wall the bank sits level with its coping, then rises into hills.
    const r = Math.hypot(x, z);
    const coast = 25 + fbm(Math.atan2(z, x) * 1.6 + 3, 1.7) * 10;
    const hills = fbm(x * 0.09 + 11, z * 0.09 + 7);
    if (d < MOAT_W + 0.45) return WALL_TOP - 0.06;
    let h = -0.92 + smooth(MOAT_W + 0.45, 8, d) * (hills * 3.6 - 0.4);
    // Beaches: the hills settle onto a gentle sandy shelf that runs out under the sea,
    // then the floor drops away into deep water.
    const shelf = smooth(coast - 8, coast - 2, r);
    h = h * (1 - shelf) + (WATER_Y + 0.3 - (r - (coast - 5)) * 0.09) * shelf;
    h -= smooth(coast + 1, coast + 10, r) * 3.6;
    return h;
  }

  /** Height the water sees: the board's plateau counts as solid ground. */
  private groundHeight(x: number, z: number): number {
    if (Math.abs(x) < BOARD_HALF && Math.abs(z) < BOARD_HALF) return 1;
    return this.height(x, z);
  }

  private buildTerrain(): THREE.BufferGeometry {
    const size = TERRAIN_SIZE;
    const seg = 96;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.height(pos.getX(i), pos.getZ(i)));
    const flat = geo.toNonIndexed();
    geo.dispose();
    const p = flat.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const L = this.look;
    const beach = new THREE.Color(L.beach), wet = new THREE.Color(L.wet), floor = new THREE.Color(L.floor);
    const low = new THREE.Color(L.low), high = new THREE.Color(L.high), rock = new THREE.Color(L.rock);
    const c = new THREE.Color(), g = new THREE.Color();
    // Colours are per vertex (faces stay flat-lit), so sand, wet sand and grass blend smoothly.
    for (let i = 0; i < p.count; i += 3) {
      const ys = [p.getY(i), p.getY(i + 1), p.getY(i + 2)];
      // Steep faces read as rock.
      const steep = Math.max(...ys) - Math.min(...ys) > 0.75;
      for (let j = 0; j < 3; j++) {
        const x = p.getX(i + j), y = ys[j], z = p.getZ(i + j);
        const n = noise(x * 0.7, z * 0.7);
        const above = y - WATER_Y;
        g.copy(low).lerp(high, smooth(-0.6, 1.4, y));
        if (steep || y > 1.6) g.copy(rock);
        if (above < 0) {
          // Under water: wet sand fading to the sea floor with depth.
          c.copy(wet).lerp(floor, smooth(0.05, 2.2, -above));
        } else {
          // Wet band at the waterline, dry sand, then grass with a ragged edge. Sea coasts get
          // wide beaches; the moat banks by the board just a thin strip.
          const coastal = smooth(3, 7, Math.hypot(Math.max(0, Math.abs(x) - BOARD_HALF), Math.max(0, Math.abs(z) - BOARD_HALF)));
          c.copy(wet).lerp(beach, smooth(0.0, 0.05 + (0.11 + n * 0.08) * coastal, above));
          const top = 0.06 + (0.24 + n * 0.25) * coastal;
          c.lerp(g, smooth(top, top + 0.06 + 0.2 * coastal, above));
        }
        // Slightly dimmer than the board so the playfield stays the focus.
        c.multiplyScalar((0.94 + hash(x * 3.1, z * 2.7) * 0.08) * 0.9);
        colors.set([c.r, c.g, c.b], (i + j) * 3);
      }
    }
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    flat.deleteAttribute('uv');
    flat.computeVertexNormals();
    return flat;
  }

  private buildProps(): THREE.BufferGeometry | null {
    const items: { geo: THREE.BufferGeometry; x: number; y: number; z: number; ry: number; s: number }[] = [];
    const types = this.theme.props;
    for (let i = 0; i < 900 && items.length < 170; i++) {
      const a = hash(i, 1.3) * Math.PI * 2;
      const r = 10 + hash(i, 7.7) * 22;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < BOARD_HALF + 0.6 && Math.abs(z) < BOARD_HALF + 0.6) continue;
      const y = this.height(x, z);
      if (y < WATER_Y + 0.6 || y > 2.2) continue;
      // Clump props into groves.
      if (fbm(x * 0.15 + 40, z * 0.15) < 0.45) continue;
      const type = types[Math.floor(hash(i, 3.3) * types.length)];
      items.push({ geo: propModel(type), x, y: y - 0.05, z, ry: hash(i, 9.1) * 6.28, s: 1.1 + hash(i, 5.5) * 0.9 });
    }
    return items.length ? mergeTransformed(items) : null;
  }

  private buildMountains(): THREE.BufferGeometry {
    const b = new ModelBuilder();
    const L = this.look;
    const id = this.theme.id;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + hash(i, 2) * 0.2;
      const r = 62 + hash(i, 4) * 26;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = 10 + hash(i, 6) * 18;
      const w = 9 + hash(i, 8) * 9;
      if (id === 'desert') {
        // Flat-topped mesas.
        b.cyl(w * 0.55, w * 0.75, h * 0.55, 7, L.rock, { x, y: WATER_Y + h * 0.27, z, ry: a });
        b.cyl(w * 0.5, w * 0.55, 0.6, 7, L.high, { x, y: WATER_Y + h * 0.55 + 0.3, z, ry: a });
        continue;
      }
      b.cone(w, h, 6, i % 2 ? L.rock : new THREE.Color(L.rock).multiplyScalar(0.85), { x, y: WATER_Y + h / 2, z, ry: a });
      if (L.peak) {
        const cap = h * 0.32;
        const col = id === 'volcano' ? new THREE.Color(L.peak).multiplyScalar(1.6) : new THREE.Color(L.peak);
        b.cone(w * 0.32 + 0.05, cap, 6, col, { x, y: WATER_Y + h - cap / 2 + 0.02, z, ry: a });
      }
    }
    if (id === 'volcano') {
      // One big smouldering volcano on the horizon.
      b.cyl(6, 22, 26, 9, L.rock, { x: -40, y: WATER_Y + 13, z: -70 });
      b.cyl(5.5, 6, 1, 9, new THREE.Color('#ff6a2a').multiplyScalar(1.8), { x: -40, y: WATER_Y + 26.2, z: -70 });
    }
    return b.build();
  }

  private buildClouds(mat: THREE.Material): void {
    const b = new ModelBuilder();
    const n = this.theme.id === 'volcano' ? 14 : 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash(i, 12) * 0.5;
      // Out on the horizon, never between the camera and the board.
      const r = 48 + hash(i, 13) * 40;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const cy = 9 + hash(i, 14) * 9;
      const puffs = 3 + Math.floor(hash(i, 15) * 3);
      for (let k = 0; k < puffs; k++) {
        const s = 2.6 + hash(i, k + 20) * 2.4;
        b.ball(s, 1, this.look.cloud, { x: cx + (k - puffs / 2) * 3.2, y: cy + hash(i, k + 30) * 0.8, z: cz + (hash(i, k + 40) - 0.5) * 2, sy: 0.6 });
      }
    }
    this.clouds.add(new THREE.Mesh(this.track(b.build()), mat));
  }

  // --- Animation ---------------------------------------------------------------------

  private resetParticle(pos: Float32Array, i: number, anywhere: boolean): void {
    const mode = this.look.particleMode;
    pos[i * 3] = (Math.random() - 0.5) * 26;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 26;
    pos[i * 3 + 1] = anywhere ? Math.random() * 9 : mode === 'snow' ? 9 : mode === 'embers' ? -0.5 : Math.random() * 6;
    const v = this.pVel;
    if (mode === 'snow') v.set([(Math.random() - 0.5) * 0.3, -0.6 - Math.random() * 0.5, (Math.random() - 0.5) * 0.3], i * 3);
    else if (mode === 'embers') v.set([(Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3], i * 3);
    else if (mode === 'dust') v.set([1.2 + Math.random() * 0.8, (Math.random() - 0.5) * 0.1, 0.3 + Math.random() * 0.3], i * 3);
    else v.set([(Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.25], i * 3);
  }

  update(dt: number): void {
    this.time += dt;
    this.clouds.rotation.y += dt * 0.006;
    this.water.update(this.time);
    this.moat?.update(this.time);
    this.grass?.update(this.time);
    if (!this.animated) return;
    const attr = this.particles.geometry.attributes.position as THREE.BufferAttribute;
    const pos = attr.array as Float32Array;
    const v = this.pVel;
    const n = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      pos[k] += (v[k] + Math.sin(this.time * 0.7 + i) * 0.15) * dt;
      pos[k + 1] += v[k + 1] * dt;
      pos[k + 2] += v[k + 2] * dt;
      if (pos[k + 1] < -0.5 || pos[k + 1] > 10 || Math.abs(pos[k]) > 14 || Math.abs(pos[k + 2]) > 14) this.resetParticle(pos, i, false);
    }
    attr.needsUpdate = true;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
