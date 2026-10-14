// The world around the board: an island of rolling hills with trees, animated water (or sand,
// ice, lava), distant mountains, a sky dome, drifting clouds and floating ambient particles.
// Everything is low-poly, vertex-coloured and built in code. One instance per Age theme.

import * as THREE from 'three';
import { ModelBuilder, mergeTransformed } from '../entities/ModelBuilder';
import { propModel } from '../entities/Models';
import type { Theme } from '../data/themes';

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
  beach: string;
  low: string;
  high: string;
  rock: string;
  peak: string | null;
  cloud: string;
  particle: string;
  particleMode: 'pollen' | 'dust' | 'snow' | 'embers';
}

const LOOKS: Record<Theme['id'], Look> = {
  meadow: { beach: '#ead9a2', low: '#7fc057', high: '#5fa44a', rock: '#8d8577', peak: '#f4f8fb', cloud: '#ffffff', particle: '#fff3a6', particleMode: 'pollen' },
  desert: { beach: '#f2d8a0', low: '#e8c47e', high: '#d7a462', rock: '#b9773f', peak: null, cloud: '#fff8ec', particle: '#f0d8a8', particleMode: 'dust' },
  snow: { beach: '#dfe9f2', low: '#eef5fb', high: '#dce7f1', rock: '#7d8fa6', peak: '#ffffff', cloud: '#f4f8ff', particle: '#ffffff', particleMode: 'snow' },
  volcano: { beach: '#3a2e30', low: '#5e4c50', high: '#4a3a3f', rock: '#241b1f', peak: '#ff7a2a', cloud: '#5b4b52', particle: '#ffb347', particleMode: 'embers' },
};

/** Half-size of the board's square footprint (the plateau). */
const BOARD_HALF = 8.6;
const WATER_Y = -1.18;

export class Scenery {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private water: THREE.Mesh;
  private waterBase: Float32Array;
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

    // Water / sand sea / ice / lava.
    const wgeo = this.track(new THREE.PlaneGeometry(260, 260, 56, 56));
    wgeo.rotateX(-Math.PI / 2);
    this.waterBase = (wgeo.attributes.position.array as Float32Array).slice();
    const wmat = this.track(theme.groundGlow
      ? new THREE.MeshBasicMaterial({ color: theme.ground })
      : new THREE.MeshLambertMaterial({ color: theme.ground, flatShading: true }));
    this.water = new THREE.Mesh(wgeo, wmat);
    this.water.position.y = WATER_Y;
    this.group.add(this.water);
    this.animateWater();

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

  // --- Island terrain ---------------------------------------------------------------

  /** Terrain height around the board: low next to the plateau, hills further out, sinking into the sea. */
  private height(x: number, z: number): number {
    const dx = Math.max(0, Math.abs(x) - BOARD_HALF);
    const dz = Math.max(0, Math.abs(z) - BOARD_HALF);
    const d = Math.hypot(dx, dz);
    if (d <= 0) return -1.6;
    const r = Math.hypot(x, z);
    const coast = 25 + fbm(Math.atan2(z, x) * 1.6 + 3, 1.7) * 10;
    const hills = fbm(x * 0.09 + 11, z * 0.09 + 7);
    // A moat right around the plateau, then a bank rising into hills.
    if (d < 1.7) return -1.6 + smooth(1.1, 1.7, d) * 0.62;
    let h = -0.98 + smooth(1.7, 8, d) * (hills * 3.6 - 0.4);
    h -= smooth(coast - 6, coast + 2, r) * 4.5;
    return h;
  }

  private buildTerrain(): THREE.BufferGeometry {
    const size = 84;
    const seg = 84;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.height(pos.getX(i), pos.getZ(i)));
    const flat = geo.toNonIndexed();
    geo.dispose();
    const p = flat.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const L = this.look;
    const beach = new THREE.Color(L.beach), low = new THREE.Color(L.low), high = new THREE.Color(L.high), rock = new THREE.Color(L.rock);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i += 3) {
      const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const x = p.getX(i), z = p.getZ(i);
      // Slope: steep faces read as rock.
      const ys = [p.getY(i), p.getY(i + 1), p.getY(i + 2)];
      const slope = Math.max(...ys) - Math.min(...ys);
      if (y < WATER_Y + 0.1) c.copy(beach);
      else if (slope > 0.75 || y > 1.6) c.copy(rock);
      else c.copy(low).lerp(high, smooth(-0.6, 1.4, y));
      // Slightly dimmer than the board so the playfield stays the focus.
      c.multiplyScalar((0.93 + hash(x * 3.1, z * 2.7) * 0.12) * 0.88);
      for (let j = 0; j < 3; j++) colors.set([c.r, c.g, c.b], (i + j) * 3);
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
      if (y < WATER_Y + 0.35 || y > 2.2) continue;
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

  private animateWater(): void {
    const pos = this.water.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const base = this.waterBase;
    const t = this.time;
    const amp = this.theme.id === 'desert' ? 0.05 : this.theme.id === 'snow' ? 0.03 : 0.12;
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i], z = base[i + 2];
      arr[i + 1] = Math.sin(x * 0.35 + t * 1.1) * amp + Math.cos(z * 0.42 + t * 0.8) * amp;
    }
    pos.needsUpdate = true;
  }

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
    if (!this.animated) return;
    this.animateWater();
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
