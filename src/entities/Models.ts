// All game models, built procedurally from primitives. Forward is +Z.

import * as THREE from 'three';
import { ModelBuilder, mergeTransformed } from './ModelBuilder';
import { MAX_TIER, BRANCH_TIER, materialFor, starsOf, type TowerId } from '../data/towers';
import type { EnemyId } from '../data/enemies';
import { HEROES, HERO_GEAR, type HeroId } from '../data/heroes';
import type { PropType } from '../data/themes';

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, fn: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    g = fn();
    cache.set(key, g);
  }
  return g;
}

const WOOD = '#9a6a3f';
const WOOD_D = '#74492a';
const ROOF = '#d9573f';
const GOLD = '#f2c94c';
/** Colour boosted above 1 so it glows under the bloom. */
const glowC = (c: string, k = 1.7) => new THREE.Color(c).multiplyScalar(k);

// --- Towers -------------------------------------------------------------------
// Every tier is a new building material (data/towers.ts TIER_MATERIALS) and adds ornaments:
// tier 2+ roof, 3+ flag, 4+ banners, 6+ trim bands, 8+ floating gem, 9+ spikes, 10 halo.

export interface TowerModel {
  base: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  headY: number;
}

interface Mat {
  body: THREE.Color;
  trim: THREE.Color;
  roof: THREE.Color;
  accent: THREE.Color;
  /** Glowing variant of the accent for gems/halos. */
  glow: THREE.Color;
}

function matFor(tier: number): Mat {
  const m = materialFor(tier);
  return {
    body: new THREE.Color(m.body),
    trim: new THREE.Color(m.trim),
    roof: new THREE.Color(m.roof),
    accent: new THREE.Color(m.accent),
    glow: new THREE.Color(m.accent).multiplyScalar(m.glow),
  };
}

const headYCache = new Map<string, number>();

export function towerModel(id: TowerId, level: number, branch: number): TowerModel {
  const tier = Math.min(level, MAX_TIER);
  const stars = Math.min(5, starsOf(level));
  const key = `${id}-${tier}-${branch}-${stars}`;
  const base = cached(`tb-${key}`, () => {
    const r = buildTowerBase(id, tier, branch);
    if (stars > 0) {
      // Star levels: little golden stars orbiting above the tower.
      const b = new ModelBuilder();
      for (let i = 0; i < stars; i++) {
        const a = (i / stars) * Math.PI * 2;
        b.octa(0.07, new THREE.Color('#fff2a8').multiplyScalar(1.8), { x: Math.cos(a) * 0.42, y: r.headY + 0.75, z: Math.sin(a) * 0.42, sy: 1.4 });
      }
      const merged = mergeTransformed([{ geo: r.geo, x: 0, y: 0, z: 0, ry: 0, s: 1 }, { geo: b.build(), x: 0, y: 0, z: 0, ry: 0, s: 1 }]);
      merged.computeVertexNormals();
      r.geo = merged;
    }
    headYCache.set(key, r.headY);
    return r.geo;
  });
  const head = cached(`th-${key}`, () => buildTowerHead(id, tier, branch));
  return { base, head, headY: headYCache.get(key) ?? 1 };
}

/** Plinth: wooden logs at tier 1, cut stone from tier 2. */
function plinth(b: ModelBuilder, tier: number, m: Mat, r = 0.44) {
  if (tier === 1) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.cyl(0.07, 0.08, 0.18, 5, i % 2 ? WOOD : WOOD_D, { x: Math.cos(a) * (r - 0.06), y: 0.09, z: Math.sin(a) * (r - 0.06) });
    }
    b.cyl(r - 0.02, r, 0.08, 8, WOOD_D, { y: 0.04 });
    return;
  }
  b.cyl(r, r + 0.06, 0.16, 8, m.trim, { y: 0.08 });
}

/** Ornaments shared by all tower types. `top` = y of the roof tip, `rad` = body radius. */
function ornaments(b: ModelBuilder, tier: number, m: Mat, top: number, rad: number, bodyTop: number) {
  if (tier >= 3) {
    b.cyl(0.015, 0.015, 0.36, 4, WOOD_D, { y: top + 0.14 });
    b.box(0.22, 0.12, 0.02, m.accent, { x: 0.11, y: top + 0.26 });
  }
  if (tier >= 4) {
    for (const sx of [-1, 1]) b.box(0.13, 0.26, 0.02, m.roof, { x: sx * (rad * 0.55), y: bodyTop - 0.18, z: rad + 0.015 });
  }
  if (tier >= 6) {
    b.torus(rad + 0.01, 0.025, 4, 12, m.accent, { y: bodyTop - 0.02, rx: Math.PI / 2 });
    b.torus(rad + 0.03, 0.025, 4, 12, m.accent, { y: 0.2, rx: Math.PI / 2 });
  }
  if (tier >= 8) b.octa(0.09, m.glow, { y: top + 0.55, sy: 1.5 });
  if (tier >= 9) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.cone(0.05, 0.22, 4, m.accent, { x: Math.cos(a) * (rad + 0.02), y: bodyTop + 0.08, z: Math.sin(a) * (rad + 0.02) });
    }
  }
  if (tier >= 10) b.torus(0.32, 0.03, 4, 18, m.glow, { y: top + 0.55, rx: Math.PI / 2 });
}

function buildTowerBase(id: TowerId, tier: number, branch: number): { geo: THREE.BufferGeometry; headY: number } {
  const b = new ModelBuilder();
  const t = Math.min(tier, MAX_TIER);
  const m = matFor(t);
  const grow = 0.035 * (t - 1);
  let headY = 1;
  switch (id) {
    case 'archer': {
      plinth(b, t, m, 0.4);
      const h = 0.5 + grow;
      const top = 0.16 + h;
      if (t === 1) {
        // Wooden lookout on stilts.
        for (const [x, z] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) b.box(0.08, h + 0.1, 0.08, WOOD_D, { x, y: (h + 0.1) / 2 + 0.05, z });
        b.box(0.18, 0.05, 0.6, WOOD, { x: 0, y: h * 0.5, rx: 0, ry: 0, rz: 0.6 });
      } else {
        b.cyl(0.3, 0.36, h, 8, m.body, { y: 0.16 + h / 2 });
        b.cyl(0.33, 0.33, 0.05, 8, m.trim, { y: 0.16 + h * 0.5 });
      }
      b.box(0.68, 0.07, 0.68, t === 1 ? WOOD : m.trim, { y: top });
      for (const [x, z, w, d] of [[0, 0.32, 0.68, 0.05], [0, -0.32, 0.68, 0.05], [0.32, 0, 0.05, 0.68], [-0.32, 0, 0.05, 0.68]]) b.box(w, 0.14, d, t === 1 ? WOOD_D : m.body, { x, y: top + 0.1, z });
      let roofTop = top + 0.1;
      if (t >= 2) {
        const roofY = top + 0.48;
        for (const [x, z] of [[-0.29, -0.29], [0.29, -0.29], [-0.29, 0.29], [0.29, 0.29]]) b.box(0.05, 0.36, 0.05, m.trim, { x, y: roofY - 0.2, z });
        b.cone(0.52, 0.36, 4, branch === 0 ? '#3f7d4e' : m.roof, { y: roofY + 0.14, ry: Math.PI / 4 });
        roofTop = roofY + 0.32;
      }
      if (t > BRANCH_TIER && branch === 0) {
        b.cone(0.17, 0.55, 4, m.roof, { y: roofTop + 0.2, ry: Math.PI / 4 });
        roofTop += 0.4;
      }
      if (t > BRANCH_TIER && branch === 1) for (let i = 0; i < 3; i++) b.box(0.2, 0.2, 0.04, m.accent, { x: Math.cos(i * 2.1) * 0.43, y: top - 0.15, z: Math.sin(i * 2.1) * 0.43, ry: -i * 2.1 });
      ornaments(b, t, m, roofTop, 0.33, top);
      headY = top + 0.05;
      break;
    }
    case 'cannon': {
      plinth(b, t, m, 0.48);
      const h = 0.26 + grow * 0.8;
      if (t === 1) {
        // Log palisade ring.
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          b.cyl(0.06, 0.07, h + 0.12, 5, i % 2 ? WOOD : WOOD_D, { x: Math.cos(a) * 0.4, y: 0.08 + (h + 0.12) / 2, z: Math.sin(a) * 0.4 });
        }
        b.cyl(0.36, 0.36, 0.06, 10, WOOD, { y: 0.14 + h * 0.6 });
      } else {
        const big = t > BRANCH_TIER && branch === 0;
        b.cyl(0.42, 0.46, h, 10, m.body, { y: 0.14 + h / 2, sx: big ? 1.08 : 1, sz: big ? 1.08 : 1 });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          b.box(0.14, 0.14, 0.1, m.trim, { x: Math.cos(a) * 0.4, y: 0.14 + h + 0.07, z: Math.sin(a) * 0.4, ry: -a });
        }
      }
      if (t >= 2) b.box(0.2, 0.12, 0.2, WOOD, { x: 0.3, y: 0.2 + h, z: -0.25 });
      if (t >= 3) for (let i = 0; i < 3; i++) b.ball(0.07, 0, '#333740', { x: -0.28 + i * 0.08, y: 0.22 + h, z: -0.3 });
      if (t > BRANCH_TIER && branch === 1) b.torus(0.45, 0.04, 4, 12, m.accent, { y: 0.14 + h * 0.6, rx: Math.PI / 2 });
      ornaments(b, t, m, 0.3 + h, 0.44, 0.14 + h);
      headY = 0.16 + h * 0.75;
      break;
    }
    case 'frost': {
      plinth(b, t, m, 0.38);
      const h = 0.55 + grow;
      if (t === 1) {
        for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) b.box(0.08, h, 0.08, WOOD_D, { x, y: h / 2 + 0.08, z });
        b.box(0.5, 0.06, 0.5, WOOD, { y: h + 0.08 });
      } else {
        b.cyl(0.29, 0.35, h, 8, m.body, { y: 0.16 + h / 2 });
        b.cyl(0.33, 0.33, 0.06, 8, m.trim, { y: 0.16 + h * 0.55 });
        b.cyl(0.42, 0.3, 0.12, 8, m.trim, { y: 0.16 + h + 0.06 });
      }
      const n = 2 + Math.floor(t / 2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.4;
        b.octa(0.08 + t * 0.008, t >= 8 ? m.glow : '#9fdcf5', { x: Math.cos(a) * 0.33, y: 0.16 + h + 0.14, z: Math.sin(a) * 0.33, sy: 2 });
      }
      if (t > BRANCH_TIER && branch === 1) b.torus(0.52, 0.05, 4, 14, '#dff6ff', { y: 0.4, rx: Math.PI / 2 });
      ornaments(b, t, m, 0.16 + h + 0.4, 0.33, 0.16 + h);
      headY = 0.9 + grow;
      break;
    }
    case 'lightning': {
      plinth(b, t, m, 0.44);
      const h = 0.48 + grow * 1.2;
      b.cyl(0.18, 0.3, h, 6, t === 1 ? WOOD : m.body, { y: 0.18 + h / 2 });
      const rings = 1 + Math.min(t, 6);
      for (let i = 0; i < rings; i++) b.torus(0.24 - i * 0.02, 0.035, 4, 10, t >= 6 ? m.accent : '#d48a3a', { y: 0.3 + (i * h) / rings, rx: Math.PI / 2 });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        b.box(0.06, 0.4, 0.06, m.trim, { x: Math.cos(a) * 0.32, y: 0.3, z: Math.sin(a) * 0.32, rz: Math.cos(a) * 0.3, rx: -Math.sin(a) * 0.3 });
      }
      b.cyl(0.05, 0.08, 0.35, 5, '#d48a3a', { y: 0.18 + h + 0.17 });
      if (t > BRANCH_TIER && branch === 0) for (let i = 0; i < 3; i++) b.cyl(0.03, 0.04, 0.5, 4, m.accent, { x: Math.cos(i * 2.1) * 0.3, y: 0.55 + h * 0.5, z: Math.sin(i * 2.1) * 0.3 });
      ornaments(b, t, m, 0.18 + h + 0.55, 0.26, 0.18 + h * 0.7);
      headY = 0.2 + h + 0.38;
      break;
    }
    case 'mage': {
      plinth(b, t, m, 0.38);
      const h = 0.75 + grow * 1.3;
      const wall = t === 1 ? WOOD : m.body;
      b.cyl(0.24, 0.31, h, 8, wall, { y: 0.16 + h / 2 });
      // Window slits and a balcony.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        b.box(0.06, 0.16, 0.04, '#2b2340', { x: Math.sin(a) * 0.27, y: 0.16 + h * 0.55, z: Math.cos(a) * 0.27, ry: a });
      }
      b.cyl(0.34, 0.3, 0.07, 8, t === 1 ? WOOD_D : m.trim, { y: 0.16 + h });
      // Tall wizard roof, slightly bent at the tip.
      const roof = t > BRANCH_TIER && branch === 1 ? '#3a5fd1' : t === 1 ? '#6a4fb0' : m.roof;
      b.cone(0.33, 0.55 + t * 0.02, 8, roof, { y: 0.16 + h + 0.3 + t * 0.01 });
      b.cone(0.1, 0.22, 6, roof, { x: 0.05, y: 0.16 + h + 0.66 + t * 0.02, rz: -0.35 });
      // Orb pedestals around the balcony.
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        b.cyl(0.025, 0.03, 0.12, 4, t === 1 ? WOOD_D : m.trim, { x: Math.cos(a) * 0.3, y: 0.16 + h + 0.08, z: Math.sin(a) * 0.3 });
        b.ball(0.04, 0, t >= 5 ? m.glow : '#b9a2ff', { x: Math.cos(a) * 0.3, y: 0.16 + h + 0.17, z: Math.sin(a) * 0.3 });
      }
      if (t > BRANCH_TIER && branch === 0) b.torus(0.4, 0.03, 4, 16, '#c8a6ff', { y: 0.16 + h * 0.4, rx: Math.PI / 2 });
      ornaments(b, t, m, 0.16 + h + 0.7, 0.28, 0.16 + h);
      // The orb floats above the roof tip.
      headY = 0.16 + h + 0.62 + t * 0.02;
      break;
    }
    case 'ballista': {
      plinth(b, t, m, 0.48);
      const h = 0.22 + grow * 0.6;
      if (t === 1) {
        // Timber deck on short posts.
        for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) b.box(0.09, h + 0.12, 0.09, WOOD_D, { x, y: (h + 0.12) / 2 + 0.06, z });
        for (let i = 0; i < 5; i++) b.box(0.15, 0.05, 0.74, i % 2 ? WOOD : WOOD_D, { x: -0.3 + i * 0.15, y: h + 0.16 });
      } else {
        b.box(0.8, h, 0.8, m.body, { y: 0.14 + h / 2 });
        b.box(0.86, 0.06, 0.86, m.trim, { y: 0.14 + h });
        // Corner merlons.
        for (const [x, z] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]]) b.box(0.14, 0.16, 0.14, m.trim, { x, y: 0.22 + h, z });
        // Stone courses.
        b.box(0.82, 0.03, 0.82, m.trim, { y: 0.14 + h * 0.5 });
      }
      // Bolt rack.
      for (let i = 0; i < 3; i++) b.cyl(0.015, 0.015, 0.5, 4, WOOD, { x: -0.3 + i * 0.05, y: 0.25 + h, z: -0.25, rz: Math.PI / 2 - 0.2 });
      if (t > BRANCH_TIER && branch === 1) b.box(0.2, 0.18, 0.2, WOOD_D, { x: 0.28, y: 0.3 + h, z: -0.28 });
      ornaments(b, t, m, 0.3 + h, 0.42, 0.14 + h);
      headY = 0.2 + h;
      break;
    }
    case 'flame': {
      plinth(b, t, m, 0.42);
      const h = 0.38 + grow;
      const wall = t === 1 ? '#8a7a6a' : m.body;
      b.cyl(0.26, 0.36, h, 8, wall, { y: 0.16 + h / 2 });
      // Iron bands and glowing vents.
      b.cyl(0.33, 0.33, 0.05, 8, t === 1 ? '#4a4048' : m.trim, { y: 0.16 + h * 0.3 });
      b.cyl(0.3, 0.3, 0.05, 8, t === 1 ? '#4a4048' : m.trim, { y: 0.16 + h * 0.75 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        b.box(0.08, 0.06, 0.03, new THREE.Color('#ff8a2a').multiplyScalar(1.6), { x: Math.sin(a) * 0.32, y: 0.16 + h * 0.52, z: Math.cos(a) * 0.32, ry: a });
      }
      // Fuel barrels.
      b.cyl(0.08, 0.08, 0.18, 7, WOOD_D, { x: 0.36, y: 0.24, z: -0.24 });
      b.cyl(0.085, 0.085, 0.02, 7, '#4a4048', { x: 0.36, y: 0.3, z: -0.24 });
      if (t > BRANCH_TIER && branch === 0) for (let i = 0; i < 4; i++) b.cone(0.05, 0.2, 4, '#ffb347', { x: Math.cos(i * 1.57 + 0.78) * 0.3, y: 0.24 + h, z: Math.sin(i * 1.57 + 0.78) * 0.3 });
      ornaments(b, t, m, 0.3 + h + 0.35, 0.3, 0.16 + h);
      headY = 0.16 + h;
      break;
    }
    case 'alchemist': {
      plinth(b, t, m, 0.44);
      const h = 0.45 + grow;
      const wall = t === 1 ? WOOD : m.body;
      // A crooked workshop: square body, sloped roof, chimney.
      b.box(0.56, h, 0.56, wall, { y: 0.16 + h / 2 });
      b.box(0.6, 0.05, 0.6, t === 1 ? WOOD_D : m.trim, { y: 0.16 + h });
      b.box(0.14, 0.2, 0.04, '#2b2340', { y: 0.16 + h * 0.45, z: 0.29 });
      b.box(0.1, 0.1, 0.03, '#9cff6a', { x: 0.29, y: 0.16 + h * 0.6, ry: Math.PI / 2 });
      b.cyl(0.06, 0.07, 0.36, 6, t === 1 ? '#7a6a5a' : m.trim, { x: -0.2, y: 0.16 + h + 0.18, z: -0.2 });
      // Shelf of flasks.
      const flask = ['#7fd65a', '#c86af0', '#ffcf3f'];
      for (let i = 0; i < 3; i++) {
        b.ball(0.045, 0, flask[i], { x: -0.12 + i * 0.12, y: 0.24, z: 0.36 });
        b.cyl(0.012, 0.012, 0.05, 4, '#e8e0d0', { x: -0.12 + i * 0.12, y: 0.29, z: 0.36 });
      }
      b.box(0.42, 0.03, 0.1, WOOD_D, { y: 0.19, z: 0.36 });
      if (t > BRANCH_TIER && branch === 0) b.ball(0.12, 1, new THREE.Color('#7fd65a').multiplyScalar(1.4), { x: 0.3, y: 0.16 + h + 0.15, z: 0.3, sy: 0.6 });
      if (t > BRANCH_TIER && branch === 1) for (let i = 0; i < 2; i++) b.cyl(0.04, 0.04, 0.4, 5, '#5d6470', { x: 0.3 - i * 0.6, y: 0.16 + h * 0.5, z: -0.32 });
      ornaments(b, t, m, 0.16 + h + 0.4, 0.3, 0.16 + h);
      headY = 0.16 + h + 0.03;
      break;
    }
    case 'mine': {
      plinth(b, t, m, 0.44);
      const h = 0.3 + grow * 0.7;
      // A mine shaft: timber head-frame over a dark pit, ore cart and gold nuggets.
      const wall = t === 1 ? WOOD : m.body;
      b.box(0.7, h, 0.7, wall, { y: 0.14 + h / 2 });
      b.box(0.74, 0.05, 0.74, t === 1 ? WOOD_D : m.trim, { y: 0.14 + h });
      b.box(0.36, 0.04, 0.36, '#1a1410', { y: 0.165 + h });
      const fy = 0.16 + h;
      for (const sx of [-1, 1]) {
        b.box(0.06, 0.62, 0.06, t >= 4 ? m.trim : WOOD_D, { x: sx * 0.24, y: fy + 0.28, z: -0.05, rz: sx * 0.12 });
      }
      b.box(0.56, 0.06, 0.07, t >= 4 ? m.trim : WOOD_D, { y: fy + 0.56, z: -0.05 });
      // Ore cart on rails.
      b.box(0.5, 0.02, 0.05, '#5d6470', { x: 0.05, y: 0.18, z: 0.42 });
      b.box(0.2, 0.12, 0.16, '#6a4a2e', { x: 0.12, y: 0.25, z: 0.42 });
      for (let i = 0; i < 3; i++) b.dodec(0.05, glowC('#ffd84a', 1.25), { x: 0.07 + i * 0.05, y: 0.33, z: 0.42 + (i - 1) * 0.03 });
      for (let i = 0; i < 4; i++) b.dodec(0.045, glowC('#f2c94c', 1.15), { x: -0.32 + (i % 2) * 0.08, y: 0.2, z: 0.3 + Math.floor(i / 2) * 0.08 });
      if (t > BRANCH_TIER && branch === 0) b.cyl(0.05, 0.05, 0.4, 6, m.trim, { x: -0.3, y: fy + 0.2, z: 0.25 });
      if (t > BRANCH_TIER && branch === 1) b.box(0.18, 0.24, 0.03, '#f3e6cc', { x: 0.38, y: 0.4, z: -0.2, ry: 0.4 });
      ornaments(b, t, m, fy + 0.62, 0.36, 0.14 + h);
      headY = fy + 0.5;
      break;
    }
    case 'catapult': {
      plinth(b, t, m, 0.48);
      const h = 0.2 + grow * 0.6;
      if (t === 1) {
        for (let i = 0; i < 5; i++) b.box(0.15, 0.06, 0.8, i % 2 ? WOOD : WOOD_D, { x: -0.3 + i * 0.15, y: 0.16 + h * 0.5 });
      } else {
        b.cyl(0.46, 0.5, h, 10, m.body, { y: 0.14 + h / 2 });
        b.cyl(0.48, 0.48, 0.05, 10, m.trim, { y: 0.14 + h });
      }
      // A pile of boulders.
      for (let i = 0; i < 4; i++) b.dodec(0.08, '#8a8378', { x: -0.3 + (i % 2) * 0.12, y: 0.22 + h + Math.floor(i / 2) * 0.08, z: -0.3 });
      if (t > BRANCH_TIER && branch === 1) for (let i = 0; i < 2; i++) b.cyl(0.07, 0.06, 0.12, 7, '#9a4a2a', { x: 0.3, y: 0.22 + h, z: -0.3 + i * 0.16 });
      ornaments(b, t, m, 0.35 + h, 0.46, 0.14 + h);
      headY = 0.16 + h;
      break;
    }
    case 'gale': {
      plinth(b, t, m, 0.4);
      const h = 0.55 + grow;
      // An open shrine: four pillars, a domed roof, prayer flags fluttering in the wind.
      const wall = t === 1 ? WOOD : m.body;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        b.cyl(0.045, 0.055, h, 6, wall, { x: Math.cos(a) * 0.27, y: 0.16 + h / 2, z: Math.sin(a) * 0.27 });
      }
      b.cyl(0.36, 0.36, 0.06, 8, t === 1 ? WOOD_D : m.trim, { y: 0.16 + h });
      b.ball(0.3, 1, t === 1 ? '#6a9a8a' : m.roof, { y: 0.19 + h, sy: 0.55 });
      b.cyl(0.32, 0.36, 0.08, 8, t === 1 ? WOOD_D : m.trim, { y: 0.2 });
      const flags = ['#ef5b4c', '#ffcf3f', '#59e05a', '#5a9fe0', '#f3ead6'];
      for (let i = 0; i < 5; i++) b.box(0.07, 0.09, 0.01, flags[i], { x: -0.34 + i * 0.17, y: 0.16 + h * 0.85 - Math.abs(i - 2) * 0.03, z: 0.3 });
      if (t > BRANCH_TIER && branch === 0) b.torus(0.45, 0.03, 4, 16, '#bff3e4', { y: 0.16 + h * 0.5, rx: Math.PI / 2 });
      ornaments(b, t, m, 0.16 + h + 0.35, 0.3, 0.16 + h);
      headY = 0.16 + h * 0.45;
      break;
    }
    case 'beacon': {
      plinth(b, t, m, 0.38);
      const h = 0.95 + grow * 1.4;
      // A slender lighthouse spire with a brazier at the top.
      const wall = t === 1 ? WOOD : m.body;
      b.cyl(0.17, 0.3, h, 8, wall, { y: 0.16 + h / 2 });
      for (let i = 1; i <= 3; i++) b.cyl(0.32 - i * 0.04, 0.32 - i * 0.04, 0.04, 8, t === 1 ? WOOD_D : m.trim, { y: 0.16 + (h * i) / 4 });
      b.cyl(0.28, 0.22, 0.1, 8, t === 1 ? WOOD_D : m.trim, { y: 0.21 + h });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        b.box(0.03, 0.3, 0.03, t === 1 ? WOOD_D : m.trim, { x: Math.cos(a) * 0.2, y: 0.4 + h, z: Math.sin(a) * 0.2 });
      }
      b.cone(0.28, 0.2, 8, t === 1 ? '#8a5a3a' : m.roof, { y: 0.64 + h });
      if (t > BRANCH_TIER && branch === 0) b.box(0.18, 0.26, 0.015, '#c23a4a', { x: 0.27, y: 0.16 + h * 0.6, z: 0, ry: Math.PI / 2 });
      if (t > BRANCH_TIER && branch === 1) b.torus(0.3, 0.025, 4, 14, glowC('#ffb347', 1.6), { y: 0.3 + h, rx: Math.PI / 2 });
      ornaments(b, t, m, 0.74 + h, 0.24, 0.16 + h);
      headY = 0.32 + h;
      break;
    }
  }
  return { geo: b.build(), headY };
}

function buildTowerHead(id: TowerId, tier: number, branch: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const t = Math.min(tier, MAX_TIER);
  const m = matFor(t);
  const spec = t > BRANCH_TIER;
  switch (id) {
    case 'archer': {
      b.cyl(0.08, 0.1, 0.2, 6, spec && branch === 0 ? '#2f5f3c' : t >= 5 ? m.roof : '#4f8f45', { y: 0.1 });
      b.ball(0.08, 0, '#f1c9a0', { y: 0.27 });
      b.cone(0.1, 0.14, 6, t >= 5 ? m.trim : '#3d7a37', { y: 0.37 });
      b.torus(0.14, 0.015, 3, 8, t >= 6 ? m.accent : WOOD_D, { z: 0.12, y: 0.16, ry: Math.PI / 2, sx: 1, sy: 1.4 });
      if (spec && branch === 1) b.box(0.06, 0.06, 0.25, WOOD, { x: 0.12, y: 0.15, z: 0.05 });
      break;
    }
    case 'cannon': {
      const big = spec && branch === 0;
      const len = 0.42 + t * 0.02 + (big ? 0.1 : 0);
      const r = 0.1 + t * 0.006 + (big ? 0.05 : 0);
      const barrel = t >= 4 ? m.trim : '#3a3f49';
      b.box(0.36, 0.12, 0.4, t === 1 ? WOOD_D : WOOD, { y: 0.06 });
      b.cyl(r, r * 1.2, len, 8, barrel, { y: 0.2, z: 0.12, rx: Math.PI / 2 - 0.35 });
      b.torus(r * 1.15, 0.025, 4, 8, m.accent, { y: 0.2 + Math.cos(Math.PI / 2 - 0.35) * len * 0.45, z: 0.12 + len * 0.45 * Math.sin(Math.PI / 2 - 0.35) });
      for (const x of [-0.17, 0.17]) b.cyl(0.09, 0.09, 0.04, 8, WOOD_D, { x, y: 0.08, rz: Math.PI / 2 });
      if (spec && branch === 1) b.cyl(r * 0.8, r, len * 0.9, 6, barrel, { x: 0.14, y: 0.18, z: 0.1, rx: Math.PI / 2 - 0.35 });
      break;
    }
    case 'frost': {
      const big = 0.16 + t * 0.012;
      const ice = t >= 8 ? m.glow : spec && branch === 1 ? '#e6f9ff' : '#7fd0f0';
      b.octa(big, ice, { y: big * 1.4, sy: 1.6 });
      b.octa(big * 0.45, '#d8f4ff', { y: big * 1.4 + 0.02, x: big * 0.9, sy: 1.5 });
      b.octa(big * 0.45, '#d8f4ff', { y: big * 1.4 + 0.02, x: -big * 0.9, sy: 1.5 });
      if (spec && branch === 0) b.octa(big * 0.5, '#5ab8e6', { y: big * 3, sy: 1.8 });
      break;
    }
    case 'lightning': {
      const r = 0.11 + t * 0.012;
      b.ball(r, 1, t >= 7 ? m.glow : spec && branch === 1 ? '#ffd76a' : '#c8a6ff', { y: r });
      b.torus(r * 1.4, 0.02, 3, 10, '#ffe9a8', { y: r, rx: 1.2 });
      if (t >= 5) b.torus(r * 1.6, 0.018, 3, 10, m.accent, { y: r, rx: -0.8, ry: 1 });
      break;
    }
    case 'mage': {
      // Floating arcane orb inside rune rings.
      const r = 0.1 + t * 0.01 + (spec && branch === 0 ? 0.04 : 0);
      const orb = new THREE.Color(t >= 7 ? m.accent : '#a98bff').multiplyScalar(1.5);
      b.ball(r, 1, orb, { y: 0.32 });
      b.torus(r * 1.7, 0.016, 3, 14, '#e6dcff', { y: 0.32, rx: Math.PI / 2 });
      b.torus(r * 1.9, 0.014, 3, 14, t >= 5 ? m.accent : '#c8a6ff', { y: 0.32, rx: 0.5 });
      if (spec && branch === 1) for (let i = 0; i < 3; i++) b.ball(0.045, 0, orb, { x: Math.cos(i * 2.1) * r * 2.4, y: 0.32, z: Math.sin(i * 2.1) * r * 2.4 });
      break;
    }
    case 'ballista': {
      // Crossbow on a swivel: stock, bow arms, string and a loaded bolt.
      const big = spec && branch === 0 ? 1.25 : 1;
      const wood = t === 1 ? WOOD : t >= 4 ? m.trim : WOOD;
      b.cyl(0.1, 0.13, 0.12, 6, WOOD_D, { y: 0.06 });
      b.box(0.12 * big, 0.1, 0.7 * big, wood, { y: 0.17, z: 0.02 });
      for (const sx of [-1, 1]) {
        b.box(0.36 * big, 0.05, 0.06, t >= 3 ? m.body : WOOD_D, { x: sx * 0.18 * big, y: 0.2, z: 0.3 * big, ry: sx * 0.35 });
        b.cyl(0.012, 0.012, 0.42 * big, 3, '#f3e6cc', { x: sx * 0.17 * big, y: 0.2, z: 0.1 * big, rx: Math.PI / 2, rz: sx * 0.8 });
      }
      b.cyl(0.02, 0.02, 0.62 * big, 4, '#6e4527', { y: 0.24, z: 0.08, rx: Math.PI / 2 });
      b.cone(0.04, 0.1, 4, t >= 6 ? m.accent : '#8a929e', { y: 0.24, z: 0.42 * big, rx: Math.PI / 2 });
      if (spec && branch === 1) b.box(0.16, 0.12, 0.2, WOOD_D, { y: 0.3, z: -0.12 });
      break;
    }
    case 'flame': {
      // Brazier with a dragon-head nozzle.
      const bowl = t >= 4 ? m.trim : '#4a4048';
      b.cyl(0.24, 0.15, 0.14, 8, bowl, { y: 0.07 });
      const fire = new THREE.Color('#ff6a1a').multiplyScalar(1.8);
      const hot = new THREE.Color('#ffd36a').multiplyScalar(2);
      b.cone(0.17, 0.3, 6, fire, { y: 0.28 });
      b.cone(0.09, 0.24, 5, hot, { y: 0.3, x: 0.04 });
      const dragon = spec && branch === 1;
      b.box(0.12, 0.12, 0.3, dragon ? '#a8452a' : bowl, { y: 0.12, z: 0.22 });
      b.cone(0.07, 0.14, 5, dragon ? '#a8452a' : bowl, { y: 0.12, z: 0.42, rx: Math.PI / 2 });
      if (dragon) for (const sx of [-1, 1]) b.cone(0.03, 0.12, 4, '#f3e6cc', { x: sx * 0.05, y: 0.22, z: 0.18, rx: -0.6 });
      break;
    }
    case 'alchemist': {
      // Cauldron of bubbling poison with a flask-flinging arm.
      const pot = t >= 4 ? m.trim : '#3a3f49';
      b.cyl(0.2, 0.15, 0.2, 9, pot, { y: 0.1 });
      b.cyl(0.18, 0.18, 0.02, 9, new THREE.Color('#7fd65a').multiplyScalar(1.5), { y: 0.19 });
      for (let i = 0; i < 3; i++) b.ball(0.035, 0, new THREE.Color('#b8ff8a').multiplyScalar(1.4), { x: Math.cos(i * 2) * 0.09, y: 0.22, z: Math.sin(i * 2) * 0.09 });
      b.box(0.05, 0.05, 0.4, WOOD, { y: 0.28, z: -0.02, rx: -0.6 });
      b.ball(0.06, 0, spec && branch === 1 ? '#c86af0' : '#7fd65a', { y: 0.42, z: 0.15 });
      break;
    }
    case 'mine': {
      // The winch wheel (turns slowly; jolts when gold comes up).
      b.torus(0.17, 0.03, 4, 12, t >= 4 ? m.accent : WOOD, {});
      for (let i = 0; i < 4; i++) b.box(0.32, 0.025, 0.025, t >= 4 ? m.trim : WOOD_D, { rz: (i / 4) * Math.PI });
      b.cyl(0.04, 0.04, 0.12, 6, '#3a3f49', { rx: Math.PI / 2 });
      break;
    }
    case 'catapult': {
      // Frame, throwing arm and a loaded sling.
      const wood = t >= 4 ? m.trim : WOOD;
      for (const sx of [-1, 1]) {
        b.box(0.06, 0.06, 0.62, WOOD_D, { x: sx * 0.2, y: 0.06 });
        b.box(0.06, 0.4, 0.06, wood, { x: sx * 0.16, y: 0.24, z: -0.02, rz: sx * 0.25 });
        b.cyl(0.07, 0.07, 0.04, 8, WOOD_D, { x: sx * 0.25, y: 0.06, z: 0.22, rz: Math.PI / 2 });
        b.cyl(0.07, 0.07, 0.04, 8, WOOD_D, { x: sx * 0.25, y: 0.06, z: -0.22, rz: Math.PI / 2 });
      }
      b.cyl(0.03, 0.03, 0.4, 6, '#5d6470', { y: 0.4, rz: Math.PI / 2 });
      const big = spec && branch === 0 ? 1.3 : 1;
      b.box(0.06, 0.06, 0.62 * big, wood, { y: 0.48, z: -0.12, rx: -0.75 });
      b.ball(0.08, 0, spec && branch === 1 ? glowC('#ff7a2a', 1.5) : '#8a8378', { y: 0.7 + (big - 1) * 0.15, z: -0.36 * big });
      b.box(0.14, 0.12, 0.12, '#6a5e50', { y: 0.1, z: 0.22 });
      break;
    }
    case 'gale': {
      // A spinning pinwheel of wind vanes around a glowing jade core.
      const n = spec && branch === 1 ? 6 : 4;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        b.box(0.05, 0.03, 0.24, t >= 5 ? m.accent : '#dff8f0', { x: Math.sin(a) * 0.15, z: Math.cos(a) * 0.15, ry: a + 0.5, rx: 0.4 });
      }
      b.ball(0.08, 1, glowC('#9fe3d0', 1.5), {});
      b.torus(0.2, 0.012, 3, 14, '#ffffff', { rx: Math.PI / 2 });
      break;
    }
    case 'beacon': {
      // The light: a glowing crystal over the brazier, with a halo.
      const r = 0.1 + t * 0.008;
      b.octa(r, t >= 7 ? m.accent.clone().multiplyScalar(2.2) : glowC('#ffe08a', 2.2), { y: r * 1.3, sy: 1.5 });
      b.cone(0.12, 0.16, 6, glowC('#ffb347', 1.8), { y: -0.02 });
      b.torus(r * 1.9, 0.014, 3, 16, glowC('#fff3b0', 1.6), { y: r * 1.3, rx: Math.PI / 2 });
      break;
    }
  }
  return b.build();
}

// --- Enemies ------------------------------------------------------------------

export function enemyModel(id: EnemyId): THREE.BufferGeometry {
  return cached(`enemy-${id}`, () => buildEnemy(id));
}

function humanoid(b: ModelBuilder, body: string, skin: string, o: { h?: number; w?: number; eyes?: boolean } = {}) {
  const h = o.h ?? 1;
  const w = o.w ?? 1;
  const dark = '#' + new THREE.Color(body).multiplyScalar(0.7).getHexString();
  // Legs with boots.
  for (const sx of [-1, 1]) {
    b.cyl(0.035 * w, 0.04 * w, 0.12 * h, 6, '#4a3a2a', { x: sx * 0.07 * w, y: 0.09 * h });
    b.box(0.08 * w, 0.05, 0.11, '#2e241c', { x: sx * 0.07 * w, y: 0.025, z: 0.015 });
  }
  // Tapered torso, belt with buckle, shoulders.
  b.cyl(0.12 * w, 0.14 * w, 0.24 * h, 8, body, { y: 0.27 * h, sz: 0.75 });
  b.cyl(0.145 * w, 0.145 * w, 0.035, 8, '#3a2a1e', { y: 0.17 * h, sz: 0.78 });
  b.box(0.04, 0.03, 0.02, GOLD, { y: 0.17 * h, z: 0.11 });
  for (const sx of [-1, 1]) {
    b.ball(0.05 * w, 0, dark, { x: sx * 0.14 * w, y: 0.36 * h });
    // Arms and hands.
    b.cyl(0.028, 0.032, 0.17 * h, 5, body, { x: sx * 0.165 * w, y: 0.28 * h, rz: sx * 0.15 });
    b.ball(0.035, 0, skin, { x: sx * 0.18 * w, y: 0.19 * h, z: 0.01 });
  }
  // Head on a short neck, with eyes.
  b.cyl(0.04, 0.05, 0.04, 6, skin, { y: 0.39 * h });
  b.ball(0.13, 1, skin, { y: 0.48 * h });
  if (o.eyes !== false) {
    for (const sx of [-1, 1]) {
      b.ball(0.028, 0, '#ffffff', { x: sx * 0.05, y: 0.5 * h, z: 0.11 });
      b.ball(0.016, 0, '#1a1218', { x: sx * 0.05, y: 0.5 * h, z: 0.132 });
    }
  }
}

function buildEnemy(id: EnemyId): THREE.BufferGeometry {
  const b = new ModelBuilder();
  const SKIN = '#7fb24f';
  switch (id) {
    case 'grunt':
      humanoid(b, '#a8643a', SKIN);
      b.cone(0.04, 0.12, 4, SKIN, { x: -0.13, y: 0.5, rz: 1.2 });
      b.cone(0.04, 0.12, 4, SKIN, { x: 0.13, y: 0.5, rz: -1.2 });
      // Spiked club.
      b.cyl(0.035, 0.06, 0.3, 6, WOOD_D, { x: 0.2, y: 0.3, z: 0.08, rx: 0.6 });
      for (let k = 0; k < 4; k++) b.cone(0.015, 0.05, 3, '#d9dde3', { x: 0.2 + Math.cos(k * 1.57) * 0.05, y: 0.42, z: 0.17 + Math.sin(k * 1.57) * 0.05, rz: Math.cos(k * 1.57) * -1.2, rx: Math.sin(k * 1.57) * 1.2 });
      // Little tusks.
      for (const sx of [-1, 1]) b.cone(0.012, 0.04, 3, '#f4f0e0', { x: sx * 0.04, y: 0.44, z: 0.12 });
      break;
    case 'runner':
      humanoid(b, '#e0913a', '#c7d36a', { h: 0.95, w: 0.85 });
      b.cone(0.1, 0.22, 4, '#d2452f', { y: 0.62, rx: -0.6, z: -0.04 });
      b.box(0.3, 0.04, 0.06, '#d2452f', { y: 0.3, z: -0.1 });
      break;
    case 'knight':
      humanoid(b, '#8a93a3', '#b9c2cf', { w: 1.15 });
      b.cyl(0.14, 0.15, 0.16, 8, '#9ea7b7', { y: 0.52 });
      b.box(0.2, 0.03, 0.03, '#2a2d33', { y: 0.53, z: 0.14 });
      b.cone(0.03, 0.14, 4, '#c73a3a', { y: 0.66 });
      b.box(0.04, 0.4, 0.04, '#d9dde3', { x: 0.2, y: 0.38, z: 0.06 });
      b.box(0.36, 0.06, 0.2, '#6f7888', { y: 0.37 });
      break;
    case 'bat':
      b.ball(0.13, 0, '#5b3f73', { y: 0, sy: 1.1 });
      b.cone(0.04, 0.1, 3, '#5b3f73', { x: -0.07, y: 0.15 });
      b.cone(0.04, 0.1, 3, '#5b3f73', { x: 0.07, y: 0.15 });
      b.box(0.36, 0.02, 0.18, '#3e2952', { x: -0.24, y: 0.03, rz: 0.3 });
      b.box(0.36, 0.02, 0.18, '#3e2952', { x: 0.24, y: 0.03, rz: -0.3 });
      b.ball(0.025, 0, '#ffde59', { x: -0.05, y: 0.04, z: 0.11 });
      b.ball(0.025, 0, '#ffde59', { x: 0.05, y: 0.04, z: 0.11 });
      break;
    case 'shaman':
      b.cone(0.2, 0.42, 6, '#6a4aa0', { y: 0.21 });
      b.ball(0.12, 0, SKIN, { y: 0.47 });
      b.cone(0.13, 0.2, 6, '#e0c050', { y: 0.62 });
      b.cyl(0.02, 0.02, 0.6, 4, WOOD, { x: 0.18, y: 0.3 });
      b.ball(0.06, 0, '#79f2a0', { x: 0.18, y: 0.63 });
      break;
    case 'shield':
      humanoid(b, '#7a5a3a', '#9fb070', { w: 1.2, h: 1.05 });
      b.box(0.5, 0.55, 0.06, '#b0884f', { y: 0.3, z: 0.18 });
      b.box(0.52, 0.06, 0.07, '#7b8494', { y: 0.55, z: 0.18 });
      b.box(0.52, 0.06, 0.07, '#7b8494', { y: 0.06, z: 0.18 });
      b.ball(0.07, 0, GOLD, { y: 0.3, z: 0.22 });
      break;
    case 'minion':
      humanoid(b, '#c0392b', '#e0634f', { h: 0.85, w: 0.85 });
      b.cone(0.03, 0.1, 4, '#3a1a1a', { x: -0.06, y: 0.55 });
      b.cone(0.03, 0.1, 4, '#3a1a1a', { x: 0.06, y: 0.55 });
      break;
    case 'boss_ogre':
      b.box(0.12, 0.18, 0.12, '#5a4632', { x: -0.1, y: 0.09 });
      b.box(0.12, 0.18, 0.12, '#5a4632', { x: 0.1, y: 0.09 });
      b.ball(0.26, 0, '#8aa05a', { y: 0.36, sy: 0.9 });
      b.box(0.4, 0.12, 0.3, '#7a4a2a', { y: 0.24 });
      b.ball(0.13, 0, '#9ab06a', { y: 0.6 });
      b.cone(0.03, 0.08, 4, '#f4f0e0', { x: -0.06, y: 0.57, z: 0.12, rx: -0.5 });
      b.cone(0.03, 0.08, 4, '#f4f0e0', { x: 0.06, y: 0.57, z: 0.12, rx: -0.5 });
      b.cyl(0.05, 0.1, 0.5, 6, WOOD_D, { x: 0.3, y: 0.4, z: 0.1, rx: 0.4 });
      b.cone(0.12, 0.12, 5, GOLD, { y: 0.74 });
      break;
    case 'boss_scorpion':
      b.dodec(0.28, '#c9a063', { y: 0.32 });
      b.dodec(0.16, '#b08a52', { y: 0.62 });
      b.box(0.14, 0.3, 0.14, '#a07a45', { x: -0.22, y: 0.15 });
      b.box(0.14, 0.3, 0.14, '#a07a45', { x: 0.22, y: 0.15 });
      b.dodec(0.12, '#a07a45', { x: -0.34, y: 0.36 });
      b.dodec(0.12, '#a07a45', { x: 0.34, y: 0.36 });
      b.ball(0.035, 0, '#4ff0ff', { x: -0.06, y: 0.64, z: 0.13 });
      b.ball(0.035, 0, '#4ff0ff', { x: 0.06, y: 0.64, z: 0.13 });
      break;
    case 'boss_yeti':
      b.ball(0.3, 1, '#eef3f7', { y: 0.36, sy: 1.05 });
      b.ball(0.15, 0, '#f6f9fb', { y: 0.7 });
      b.box(0.14, 0.06, 0.04, '#7aa0c4', { y: 0.68, z: 0.13 });
      b.ball(0.11, 0, '#e4ecf2', { x: -0.3, y: 0.3, sy: 1.6 });
      b.ball(0.11, 0, '#e4ecf2', { x: 0.3, y: 0.3, sy: 1.6 });
      b.cone(0.03, 0.1, 4, '#cfdce8', { x: -0.08, y: 0.83, rz: 0.4 });
      b.cone(0.03, 0.1, 4, '#cfdce8', { x: 0.08, y: 0.83, rz: -0.4 });
      break;
    case 'scarab': {
      // Armoured beetle: split shell, little head, six legs, glinting eyes.
      b.ball(0.15, 1, '#2f6f7a', { y: 0.12, sy: 0.6, sz: 1.2 });
      b.box(0.012, 0.05, 0.3, '#1d4a52', { y: 0.2 });
      b.ball(0.07, 1, '#1d3a40', { y: 0.1, z: 0.17 });
      for (const sx of [-1, 1]) {
        for (let k = 0; k < 3; k++) b.box(0.12, 0.015, 0.02, '#1d3a40', { x: sx * 0.15, y: 0.05, z: -0.08 + k * 0.08, rz: sx * -0.5 });
        b.ball(0.018, 0, glowC('#9fffe0', 1.4), { x: sx * 0.035, y: 0.13, z: 0.22 });
        b.cone(0.012, 0.08, 3, '#1d3a40', { x: sx * 0.03, y: 0.12, z: 0.27, rx: Math.PI / 2, rz: sx * 0.3 });
      }
      break;
    }
    case 'wraith': {
      // Hooded sand spirit with a ragged hem and glowing eyes.
      b.cone(0.2, 0.55, 9, '#d9c08a', { y: 0.3 });
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        b.cone(0.05, 0.12, 4, '#c4a870', { x: Math.cos(a) * 0.17, y: 0.04, z: Math.sin(a) * 0.17, rx: Math.PI });
      }
      b.ball(0.14, 1, '#c4a870', { y: 0.6 });
      b.ball(0.1, 1, '#2a2018', { y: 0.58, z: 0.06 });
      for (const sx of [-1, 1]) {
        b.ball(0.022, 0, glowC('#ffd36a', 1.8), { x: sx * 0.04, y: 0.6, z: 0.14 });
        b.cone(0.04, 0.2, 5, '#d9c08a', { x: sx * 0.17, y: 0.38, z: 0.05, rz: sx * 1.0 });
        for (let k = 0; k < 3; k++) b.cone(0.01, 0.06, 3, '#3a2a1a', { x: sx * (0.26 + k * 0.01), y: 0.3 - k * 0.015, z: 0.05 + (k - 1) * 0.025, rz: sx * 1.8 });
      }
      break;
    }
    case 'wolf': {
      // Four-legged snow wolf: body, chest ruff, snout, ears, bushy tail.
      const fur = '#dfe8f0', dark = '#9fb0c4';
      b.capsule(0.11, 0.24, fur, { y: 0.24, rx: Math.PI / 2 });
      b.ball(0.12, 1, '#f4f8fb', { y: 0.27, z: 0.13 });
      b.ball(0.1, 1, fur, { y: 0.36, z: 0.24 });
      b.box(0.08, 0.07, 0.12, fur, { y: 0.33, z: 0.34 });
      b.ball(0.022, 0, '#2a2a33', { y: 0.35, z: 0.4 });
      for (const sx of [-1, 1]) {
        b.cone(0.035, 0.09, 4, dark, { x: sx * 0.055, y: 0.46, z: 0.21 });
        b.ball(0.018, 0, glowC('#8fd8ff', 1.4), { x: sx * 0.045, y: 0.39, z: 0.31 });
        for (const z of [-0.14, 0.14]) b.capsule(0.03, 0.12, dark, { x: sx * 0.07, y: 0.1, z });
      }
      b.cone(0.06, 0.24, 6, fur, { y: 0.3, z: -0.27, rx: -1.9 });
      break;
    }
    case 'thief': {
      // Sneaky hooded goblin with a bulging loot sack and a dagger.
      humanoid(b, '#3a3550', '#8fbf5a', { h: 0.95, w: 0.85 });
      b.cone(0.15, 0.24, 7, '#2a2640', { y: 0.6, z: -0.02, rx: -0.25 });
      b.box(0.22, 0.05, 0.03, '#1a1626', { y: 0.5, z: 0.11 });
      for (const sx of [-1, 1]) b.ball(0.02, 0, glowC('#ffe066', 1.6), { x: sx * 0.045, y: 0.5, z: 0.125 });
      b.ball(0.13, 1, '#a07a4a', { y: 0.36, z: -0.15, sy: 1.15 });
      b.cyl(0.03, 0.05, 0.05, 6, '#7a5a34', { y: 0.5, z: -0.15 });
      b.cyl(0.06, 0.06, 0.02, 8, '#ffcf3f', { y: 0.53, z: -0.14 });
      b.box(0.02, 0.16, 0.035, '#d9dde3', { x: 0.19, y: 0.2, z: 0.07, rx: 0.4 });
      b.box(0.06, 0.02, 0.03, GOLD, { x: 0.19, y: 0.13, z: 0.04, rx: 0.4 });
      break;
    }
    case 'tunneler': {
      // Burly mole digger: miner's helmet with a lamp, big claws and a drill nose.
      b.ball(0.2, 1, '#6a5446', { y: 0.2, sy: 0.85, sz: 1.15 });
      b.ball(0.14, 1, '#7a6252', { y: 0.3, z: 0.12 });
      b.cone(0.07, 0.18, 8, '#c9d2df', { y: 0.27, z: 0.3, rx: Math.PI / 2 });
      for (let k = 0; k < 3; k++) b.torus(0.05 - k * 0.012, 0.01, 4, 10, '#8a92a0', { y: 0.27, z: 0.24 + k * 0.05 });
      b.cyl(0.13, 0.15, 0.08, 10, '#e0a030', { y: 0.42, z: 0.08 });
      b.ball(0.13, 1, '#e8b040', { y: 0.44, z: 0.08, sy: 0.55 });
      b.ball(0.035, 0, glowC('#fff3b0', 2.2), { y: 0.46, z: 0.21 });
      for (const sx of [-1, 1]) {
        b.ball(0.022, 0, '#1a1218', { x: sx * 0.06, y: 0.34, z: 0.24 });
        b.box(0.1, 0.05, 0.12, '#f0d8b8', { x: sx * 0.2, y: 0.08, z: 0.14, ry: sx * 0.4 });
        for (let k = 0; k < 3; k++) b.cone(0.012, 0.06, 3, '#e8e0d0', { x: sx * (0.17 + k * 0.03), y: 0.06, z: 0.22, rx: 1.4 });
      }
      break;
    }
    case 'siege': {
      // Goblin siege cart: wooden frame on four wheels, a throwing arm with a rock in its bucket.
      b.box(0.5, 0.08, 0.62, WOOD_D, { y: 0.16 });
      b.box(0.46, 0.05, 0.58, '#9a6a3f', { y: 0.22 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        b.cyl(0.11, 0.11, 0.05, 10, '#5a3a24', { x: sx * 0.28, y: 0.11, z: sz * 0.2, rz: Math.PI / 2 });
        b.cyl(0.04, 0.04, 0.07, 6, '#8a92a0', { x: sx * 0.28, y: 0.11, z: sz * 0.2, rz: Math.PI / 2 });
      }
      for (const sx of [-1, 1]) b.box(0.05, 0.34, 0.05, WOOD_D, { x: sx * 0.16, y: 0.4, z: -0.05 });
      b.cyl(0.03, 0.03, 0.38, 6, '#8a92a0', { y: 0.54, z: -0.05, rz: Math.PI / 2 });
      b.box(0.06, 0.06, 0.62, '#b5803f', { y: 0.62, z: -0.08, rx: -0.55 });
      b.cyl(0.09, 0.07, 0.06, 8, WOOD_D, { y: 0.8, z: -0.36 });
      b.dodec(0.08, '#8a8278', { y: 0.86, z: -0.36 });
      b.box(0.3, 0.12, 0.08, '#c73a3a', { y: 0.3, z: 0.29 });
      b.box(0.08, 0.08, 0.02, GOLD, { y: 0.3, z: 0.335 });
      b.ball(0.07, 0, '#8a8278', { x: 0.14, y: 0.3, z: -0.22 });
      b.ball(0.06, 0, '#7a7268', { x: 0.08, y: 0.28, z: -0.28 });
      break;
    }
    case 'golem': {
      // Hulking ice golem: crystal torso, block fists, glowing core and icicles.
      const ice = '#9fd6f0', deep = '#6fb4d8';
      for (const sx of [-1, 1]) b.box(0.12, 0.2, 0.14, deep, { x: sx * 0.1, y: 0.1 });
      b.dodec(0.24, ice, { y: 0.38, sy: 1.1 });
      b.octa(0.07, glowC('#e0faff', 1.7), { y: 0.42, z: 0.19 });
      b.dodec(0.11, deep, { y: 0.68, z: 0.04 });
      for (const sx of [-1, 1]) {
        b.ball(0.022, 0, glowC('#c8f4ff', 2), { x: sx * 0.04, y: 0.7, z: 0.13 });
        b.box(0.1, 0.26, 0.1, ice, { x: sx * 0.3, y: 0.34, rz: sx * 0.15 });
        b.dodec(0.09, deep, { x: sx * 0.33, y: 0.18 });
      }
      for (let k = 0; k < 5; k++) b.cone(0.04, 0.2, 4, '#e6f6ff', { x: (k - 2) * 0.08, y: 0.6, z: -0.15, rx: -0.6 });
      break;
    }
    case 'fireimp': {
      // Little flying fire devil: horns, bat wings, flaming tail.
      b.ball(0.11, 1, '#e0482a', { y: 0.05 });
      b.ball(0.08, 1, '#f06a3a', { y: 0.17, z: 0.04 });
      for (const sx of [-1, 1]) {
        b.cone(0.02, 0.08, 4, '#3a1a14', { x: sx * 0.05, y: 0.26, z: 0.03, rz: sx * -0.4 });
        b.ball(0.016, 0, glowC('#ffe066', 2), { x: sx * 0.03, y: 0.18, z: 0.11 });
        b.box(0.22, 0.012, 0.14, '#8a2418', { x: sx * 0.18, y: 0.1, z: -0.03, rz: sx * 0.35 });
      }
      b.cone(0.05, 0.18, 6, glowC('#ffb347', 1.8), { y: -0.04, z: -0.14, rx: -2.2 });
      b.cone(0.03, 0.12, 5, glowC('#ffe066', 2), { y: -0.07, z: -0.2, rx: -2.2 });
      break;
    }
    case 'magmaslug':
    case 'slugling': {
      // Molten slug: crusted plates over glowing magma, eye stalks.
      b.capsule(0.12, 0.26, glowC('#ff6a1a', 1.5), { y: 0.11, rx: Math.PI / 2, sx: 1.1 });
      b.capsule(0.08, 0.2, glowC('#ffd36a', 1.8), { y: 0.06, rx: Math.PI / 2, sx: 1.3 });
      // Cooled crust plates with glowing gaps between them.
      for (let k = 0; k < 4; k++) b.dodec(0.075, '#3a2420', { x: (k % 2 ? 0.03 : -0.03), y: 0.2, z: -0.16 + k * 0.105, sy: 0.45, sx: 1.4 });
      for (const sx of [-1, 1]) {
        b.cyl(0.012, 0.012, 0.12, 4, '#3a2420', { x: sx * 0.05, y: 0.25, z: 0.2, rz: sx * -0.3 });
        b.ball(0.028, 0, glowC('#ffe066', 1.8), { x: sx * 0.07, y: 0.31, z: 0.2 });
      }
      break;
    }
    case 'boss_dragon':
      b.ball(0.26, 0, '#b8322a', { y: 0.32, sz: 1.3 });
      b.ball(0.14, 0, '#c8443a', { y: 0.5, z: 0.32 });
      b.cone(0.06, 0.2, 4, '#f2c94c', { x: -0.07, y: 0.62, z: 0.28, rx: -0.6 });
      b.cone(0.06, 0.2, 4, '#f2c94c', { x: 0.07, y: 0.62, z: 0.28, rx: -0.6 });
      b.box(0.5, 0.03, 0.3, '#7d1f1a', { x: -0.36, y: 0.48, rz: 0.4 });
      b.box(0.5, 0.03, 0.3, '#7d1f1a', { x: 0.36, y: 0.48, rz: -0.4 });
      b.cone(0.1, 0.4, 4, '#a02a22', { y: 0.28, z: -0.4, rx: -Math.PI / 2 });
      for (const x of [-0.14, 0.14]) for (const z of [-0.12, 0.14]) b.box(0.08, 0.16, 0.08, '#7d1f1a', { x, y: 0.08, z });
      b.ball(0.03, 0, '#ffe066', { x: -0.06, y: 0.54, z: 0.44 });
      b.ball(0.03, 0, '#ffe066', { x: 0.06, y: 0.54, z: 0.44 });
      break;
  }
  return b.build();
}

// --- Heroes -------------------------------------------------------------------

// --- Heroes -------------------------------------------------------------------
// Chibi proportions (big expressive heads) so heroes read clearly at phone size. Forward is +Z.

const SKIN = '#f1c9a0';

/** Face: eyes with irises and highlights, brows, cheeks, mouth, ears. */
function heroFace(b: ModelBuilder, y: number, o: { skin?: string; iris?: string; brow?: string; mask?: boolean; r?: number } = {}) {
  const r = o.r ?? 0.15;
  const skin = o.skin ?? SKIN;
  b.ball(r, 1, skin, { y });
  for (const sx of [-1, 1]) {
    b.ball(r * 0.17, 0, skin, { x: sx * r * 0.98, y: y - 0.01, sz: 0.7 });
    b.ball(r * 0.25, 1, '#ffffff', { x: sx * r * 0.36, y: y + 0.005, z: r * 0.8, sz: 0.55 });
    b.ball(r * 0.16, 1, o.iris ?? '#3b2a20', { x: sx * r * 0.36, y: y + 0.0, z: r * 0.92, sz: 0.5 });
    b.ball(r * 0.06, 0, '#ffffff', { x: sx * r * 0.36 + 0.008, y: y + 0.014, z: r * 1.0 });
    b.box(r * 0.36, r * 0.07, r * 0.08, o.brow ?? '#5a3a24', { x: sx * r * 0.37, y: y + r * 0.38, z: r * 0.86, rz: sx * -0.15 });
    if (!o.mask) b.ball(r * 0.15, 0, '#f4a0a0', { x: sx * r * 0.62, y: y - r * 0.3, z: r * 0.72, sz: 0.4 });
  }
  if (!o.mask) b.box(r * 0.28, r * 0.06, r * 0.05, '#9a4a3a', { y: y - r * 0.42, z: r * 0.9 });
}

// Heroes are rigged: body (torso, head, gear), two legs and two arms, each a separate mesh that
// pivots at the hip or shoulder. Held weapons are built into the arm that holds them, so swings,
// bow draws and casts move them naturally. Parts are authored in model space; the rig moves each
// part so its pivot sits at the origin.

export type HeroPart = 'body' | 'legL' | 'legR' | 'armL' | 'armR';

class HeroRigBuilder {
  readonly body = new ModelBuilder();
  readonly legL = new ModelBuilder();
  readonly legR = new ModelBuilder();
  readonly armL = new ModelBuilder();
  readonly armR = new ModelBuilder();
  /** Body width scale (moves hips and shoulders out). */
  w = 1;
  leg(sx: number): ModelBuilder {
    return sx < 0 ? this.legL : this.legR;
  }
  arm(sx: number): ModelBuilder {
    return sx < 0 ? this.armL : this.armR;
  }
}

export const HIP_Y = 0.19;
export const SHOULDER_Y = 0.37;

export interface HeroRigPart {
  name: HeroPart;
  /** Geometry with its pivot at the origin. */
  geo: THREE.BufferGeometry;
  pivot: THREE.Vector3;
}

/** Legs with boots, torso, arms with hands/gloves. */
function heroBody(R: HeroRigBuilder, o: { pants: string; boots: string; torso: string; arms?: string; hands?: string; w?: number; belt?: string; buckle?: string }) {
  const w = o.w ?? 1;
  R.w = w;
  for (const sx of [-1, 1]) {
    const L = R.leg(sx);
    L.capsule(0.045 * w, 0.1, o.pants, { x: sx * 0.065 * w, y: 0.13 });
    L.box(0.09 * w, 0.06, 0.13, o.boots, { x: sx * 0.065 * w, y: 0.03, z: 0.015 });
    L.cyl(0.05 * w, 0.05 * w, 0.03, 8, o.boots, { x: sx * 0.065 * w, y: 0.075 });
  }
  R.body.cyl(0.115 * w, 0.13 * w, 0.2, 10, o.torso, { y: 0.29, sz: 0.8 });
  if (o.belt) {
    R.body.cyl(0.133 * w, 0.133 * w, 0.035, 10, o.belt, { y: 0.21, sz: 0.82 });
    R.body.box(0.045, 0.035, 0.02, o.buckle ?? GOLD, { y: 0.21, z: 0.11 });
  }
  for (const sx of [-1, 1]) {
    const A = R.arm(sx);
    A.capsule(0.033, 0.11, o.arms ?? o.torso, { x: sx * 0.15 * w, y: 0.3, rz: sx * 0.18 });
    A.ball(0.04, 1, o.hands ?? SKIN, { x: sx * 0.168 * w, y: 0.21, z: 0.01 });
  }
}

/** Valkyrie wing, built pointing out to +X from the shoulder. Animated separately in game. */
export function heroWingModel(): THREE.BufferGeometry {
  return cached('hero-wing', () => {
    const b = new ModelBuilder();
    // Flat feathered panel in the XY plane: rows of overlapping feathers, longest at the top.
    const feathers = ['#ffffff', '#f6f8ff', '#eceffb', '#e2e7f7', '#f8f3e4'].map((c) => new THREE.Color(c).multiplyScalar(1.25));
    for (let k = 0; k < 5; k++) {
      const len = 0.34 - k * 0.045;
      // Rounded feather ends: a stretched ball at the tip of each row.
      b.ball(0.04, 0, feathers[k], { x: 0.04 + len * Math.cos(0.42 - k * 0.14), y: 0.12 - k * 0.06 + len * Math.sin(0.42 - k * 0.14), z: -0.004 * k, sz: 0.25 });
      b.box(len, 0.075, 0.014, feathers[k], { x: 0.04 + len / 2, y: 0.12 - k * 0.06, z: -0.004 * k, rz: 0.42 - k * 0.14 });
    }
    b.box(0.16, 0.05, 0.03, GOLD, { x: 0.1, y: 0.14, rz: 0.42 });
    return b.build();
  });
}

function buildHeroRig(id: HeroId, R: HeroRigBuilder): void {
  const B = R.body;
  switch (id) {
    case 'ranger': {
      // Robin: green hood and cloak, leather jerkin, quiver of arrows, longbow.
      heroBody(R, { pants: '#5b4a33', boots: '#4a3424', torso: '#7a5a38', arms: '#3f7d3a', hands: '#8a6a44', belt: '#3b2a1c' });
      B.box(0.2, 0.15, 0.02, '#3f7d3a', { y: 0.3, z: 0.105 });
      B.box(0.05, 0.05, 0.03, '#8a6a44', { x: 0.09, y: 0.19, z: 0.1 });
      B.box(0.3, 0.3, 0.025, '#2f6a2c', { y: 0.28, z: -0.115, rx: 0.12 });
      B.box(0.22, 0.04, 0.03, '#2f6a2c', { y: 0.42, z: -0.09 });
      heroFace(B, 0.55, { iris: '#3f8a3a', brow: '#8a4a24' });
      B.ball(0.155, 1, '#a0522d', { y: 0.6, z: -0.01, sy: 0.75 });
      B.cone(0.17, 0.2, 10, '#3f7d3a', { y: 0.7, z: -0.03, rx: -0.35 });
      B.ball(0.165, 1, '#3f7d3a', { y: 0.58, z: -0.03, sy: 0.95, sz: 0.95 });
      B.cyl(0.165, 0.17, 0.05, 12, '#2f6a2c', { y: 0.47, z: -0.01 });
      B.box(0.03, 0.06, 0.01, '#e84a3a', { x: 0.1, y: 0.73, z: -0.02, rz: -0.5 });
      B.cyl(0.045, 0.04, 0.24, 8, '#8a5a34', { x: -0.06, y: 0.34, z: -0.15, rz: 0.4 });
      for (let k = 0; k < 3; k++) {
        B.cyl(0.006, 0.006, 0.12, 3, '#d9c8a0', { x: -0.12 + k * 0.02, y: 0.5, z: -0.15, rz: 0.4 });
        B.box(0.03, 0.04, 0.005, k === 1 ? '#e84a3a' : '#ffffff', { x: -0.14 + k * 0.02, y: 0.55, z: -0.15, rz: 0.4 });
      }
      // Longbow in the left hand (it rises to aim); string drawn by the right.
      const A = R.armL;
      A.arc(0.24, 0.014, Math.PI * 0.85, WOOD, { x: -0.19, y: 0.22, z: 0.08, ry: Math.PI / 2, rz: -Math.PI / 2 + Math.PI * 0.425 });
      A.cyl(0.004, 0.004, 0.46, 3, '#f4efe0', { x: -0.19, y: 0.22, z: 0.0 });
      A.box(0.03, 0.06, 0.03, '#5b3a22', { x: -0.19, y: 0.22, z: 0.2 });
      R.armR.cyl(0.006, 0.006, 0.26, 3, '#d9c8a0', { x: 0.17, y: 0.21, z: 0.1, rx: Math.PI / 2 });
      break;
    }
    case 'knight': {
      // Sir Bramble: plate armour under a royal tabard, open helm with plume, sword and kite shield.
      const steel = '#c9d2df';
      heroBody(R, { pants: '#8a93a3', boots: '#5d6470', torso: steel, arms: steel, hands: '#8a93a3', belt: '#4a3424', w: 1.12 });
      B.box(0.17, 0.22, 0.02, '#3a5fb1', { y: 0.27, z: 0.112 });
      B.box(0.05, 0.12, 0.022, GOLD, { y: 0.29, z: 0.115 });
      B.box(0.11, 0.03, 0.022, GOLD, { y: 0.31, z: 0.115 });
      for (const sx of [-1, 1]) {
        R.arm(sx).ball(0.07, 1, '#aeb8c8', { x: sx * 0.16, y: 0.39, sy: 0.7 });
        R.arm(sx).torus(0.06, 0.012, 4, 10, GOLD, { x: sx * 0.16, y: 0.37, rx: Math.PI / 2 });
      }
      B.box(0.34, 0.28, 0.02, '#3a5fb1', { y: 0.28, z: -0.13, rx: 0.1 });
      heroFace(B, 0.55, { iris: '#3a6fd1', brow: '#6a4a2a' });
      B.ball(0.168, 1, steel, { y: 0.6, z: -0.015, sy: 0.85 });
      B.cyl(0.17, 0.17, 0.04, 12, '#aeb8c8', { y: 0.55, z: -0.02 });
      for (const sx of [-1, 1]) B.box(0.03, 0.12, 0.08, '#aeb8c8', { x: sx * 0.15, y: 0.5, z: 0.04 });
      B.box(0.26, 0.05, 0.05, '#aeb8c8', { y: 0.7, z: 0.1, rx: -0.6 });
      for (let k = 0; k < 5; k++) B.cone(0.03, 0.16, 5, k % 2 ? '#3a5fb1' : '#5a7fd1', { y: 0.78 + k * 0.01, z: -0.05 - k * 0.035, rx: -0.5 - k * 0.2 });
      // Sword in the right hand.
      const S = R.armR;
      S.box(0.03, 0.42, 0.012, '#eef2f8', { x: 0.2, y: 0.42, z: 0.08 });
      S.box(0.14, 0.03, 0.04, GOLD, { x: 0.2, y: 0.21, z: 0.08 });
      S.cyl(0.015, 0.015, 0.08, 6, '#5b3a22', { x: 0.2, y: 0.16, z: 0.08 });
      S.ball(0.022, 0, GOLD, { x: 0.2, y: 0.11, z: 0.08 });
      // Kite shield on the left arm.
      const H = R.armL;
      H.box(0.24, 0.26, 0.035, '#3a5fb1', { x: -0.21, y: 0.3, z: 0.09, ry: 0.35 });
      H.cone(0.12, 0.12, 4, '#3a5fb1', { x: -0.21, y: 0.12, z: 0.09, rx: Math.PI, ry: 0.35 + Math.PI / 4, sz: 0.25 });
      H.box(0.26, 0.025, 0.04, GOLD, { x: -0.21, y: 0.43, z: 0.09, ry: 0.35 });
      H.box(0.04, 0.2, 0.04, GOLD, { x: -0.205, y: 0.29, z: 0.105, ry: 0.35 });
      H.box(0.14, 0.04, 0.04, GOLD, { x: -0.205, y: 0.32, z: 0.105, ry: 0.35 });
      break;
    }
    case 'mage': {
      // Elowen: starry robe (no visible legs), long silver hair, huge bent hat, glowing staff.
      const robe = '#7d43b3';
      B.cone(0.24, 0.42, 12, robe, { y: 0.21 });
      B.cyl(0.24, 0.245, 0.03, 12, GOLD, { y: 0.015 });
      B.cyl(0.11, 0.13, 0.12, 10, robe, { y: 0.36, sz: 0.85 });
      B.box(0.05, 0.36, 0.02, GOLD, { y: 0.2, z: 0.13, rx: -0.3 });
      for (let k = 0; k < 7; k++) {
        const a = k * 0.9;
        B.octa(0.018, '#ffe680', { x: Math.sin(a) * 0.17, y: 0.07 + (k % 3) * 0.08, z: Math.cos(a) * 0.17 });
      }
      for (const sx of [-1, 1]) {
        R.arm(sx).cone(0.06, 0.18, 8, robe, { x: sx * 0.15, y: 0.31, rz: sx * 0.5 });
        R.arm(sx).ball(0.035, 1, SKIN, { x: sx * 0.2, y: 0.24, z: 0.02 });
      }
      heroFace(B, 0.54, { iris: '#a15bd1', brow: '#c8c8d8' });
      B.ball(0.16, 1, '#e6e8f2', { y: 0.57, z: -0.03, sy: 0.9 });
      for (const sx of [-1, 1]) B.capsule(0.045, 0.2, '#e6e8f2', { x: sx * 0.12, y: 0.42, z: -0.02 });
      B.box(0.22, 0.22, 0.05, '#e6e8f2', { y: 0.42, z: -0.12 });
      B.cyl(0.26, 0.26, 0.02, 16, '#5e2f8a', { y: 0.66 });
      B.cyl(0.14, 0.15, 0.05, 12, GOLD, { y: 0.69 });
      B.cone(0.14, 0.26, 12, '#5e2f8a', { y: 0.84 });
      B.cone(0.07, 0.18, 8, '#5e2f8a', { x: 0.06, y: 1.0, rz: -0.6 });
      B.octa(0.035, glowC('#ffe680', 1.6), { x: 0.14, y: 1.03 });
      const S = R.armR;
      S.cyl(0.016, 0.02, 0.78, 6, WOOD, { x: 0.22, y: 0.38, z: 0.04 });
      for (let k = 0; k < 3; k++) S.cone(0.012, 0.08, 4, GOLD, { x: 0.22 + Math.cos(k * 2.1) * 0.035, y: 0.8, z: 0.04 + Math.sin(k * 2.1) * 0.035, rz: -Math.cos(k * 2.1) * 0.5, rx: Math.sin(k * 2.1) * 0.5 });
      S.octa(0.06, glowC('#c8a6ff', 1.9), { x: 0.22, y: 0.84, z: 0.04, sy: 1.5 });
      break;
    }
    case 'dwarf': {
      // Brokk: broad and stocky, horned helm with goggles, braided ginger beard, giant hammer.
      heroBody(R, { pants: '#6a4a2a', boots: '#3b2a1c', torso: '#a8452a', arms: '#a8452a', hands: '#7a5a3a', belt: '#3b2a1c', buckle: '#c9d2df', w: 1.3 });
      B.box(0.22, 0.2, 0.02, '#7a5a3a', { y: 0.25, z: 0.13 });
      for (const sx of [-1, 1]) R.arm(sx).ball(0.07, 1, '#8a93a3', { x: sx * 0.19, y: 0.38, sy: 0.7 });
      heroFace(B, 0.52, { iris: '#4a7ab8', brow: '#c8642a', r: 0.155 });
      B.ball(0.05, 1, '#e8a888', { y: 0.5, z: 0.15 });
      B.ball(0.15, 1, '#d2702e', { y: 0.42, z: 0.06, sy: 0.9, sz: 0.7 });
      B.cone(0.12, 0.22, 10, '#d2702e', { y: 0.28, z: 0.1, rx: Math.PI });
      for (const sx of [-1, 1]) {
        for (let k = 0; k < 3; k++) B.ball(0.028, 0, '#c0602a', { x: sx * 0.07, y: 0.24 - k * 0.045, z: 0.13 });
        B.box(0.03, 0.025, 0.03, '#c9d2df', { x: sx * 0.07, y: 0.12, z: 0.13 });
        B.ball(0.06, 1, '#d2702e', { x: sx * 0.07, y: 0.47, z: 0.13, sx: 1.4, sy: 0.6 });
      }
      B.ball(0.165, 1, '#9ea7b7', { y: 0.58, sy: 0.75 });
      B.cyl(0.168, 0.168, 0.04, 12, '#c9a24a', { y: 0.57 });
      for (const sx of [-1, 1]) {
        B.cone(0.045, 0.14, 8, '#f4efe0', { x: sx * 0.19, y: 0.64, rz: sx * -1.1 });
        B.cone(0.03, 0.12, 8, '#e8e0c8', { x: sx * 0.27, y: 0.71, rz: sx * -0.35 });
        B.cyl(0.05, 0.05, 0.03, 8, '#c9a24a', { x: sx * 0.15, y: 0.62, rz: sx * -1.1 });
        B.torus(0.035, 0.012, 4, 10, '#5d4a3a', { x: sx * 0.055, y: 0.67, z: 0.12, rx: 0.3 });
        B.ball(0.028, 0, glowC('#8fd8ff', 1.3), { x: sx * 0.055, y: 0.67, z: 0.12 });
      }
      const S = R.armR;
      S.cyl(0.018, 0.022, 0.62, 6, WOOD_D, { x: 0.24, y: 0.36, z: 0.06, rz: -0.05 });
      S.box(0.22, 0.13, 0.13, '#8a93a3', { x: 0.26, y: 0.68, z: 0.06, rz: -0.05 });
      for (const dx of [-0.07, 0.07]) S.box(0.03, 0.14, 0.14, '#c9a24a', { x: 0.26 + dx, y: 0.68 - dx * 0.05, z: 0.06, rz: -0.05 });
      S.ball(0.03, 0, glowC('#ff8a3d', 1.6), { x: 0.26, y: 0.68, z: 0.13 });
      break;
    }
    case 'valkyrie': {
      // Seraphine: white-and-gold armour, flowing golden hair, winged helm, halo, spear.
      heroBody(R, { pants: '#f4f6ff', boots: '#c9a24a', torso: '#f4f6ff', arms: '#f4f6ff', hands: '#f1c9a0', belt: GOLD, buckle: '#8fd8ff' });
      B.cone(0.17, 0.2, 12, '#e8ecfa', { y: 0.13 });
      B.box(0.18, 0.15, 0.02, GOLD, { y: 0.31, z: 0.105 });
      B.octa(0.03, glowC('#8fd8ff', 1.5), { y: 0.32, z: 0.12 });
      for (const sx of [-1, 1]) R.arm(sx).ball(0.065, 1, GOLD, { x: sx * 0.155, y: 0.39, sy: 0.65 });
      heroFace(B, 0.55, { iris: '#3a8ad8', brow: '#c8a04a' });
      B.ball(0.16, 1, '#f2d16b', { y: 0.58, z: -0.02, sy: 0.9 });
      B.box(0.26, 0.3, 0.06, '#f2d16b', { y: 0.42, z: -0.12 });
      for (const sx of [-1, 1]) B.capsule(0.04, 0.18, '#f2d16b', { x: sx * 0.13, y: 0.44, z: 0.0 });
      B.ball(0.163, 1, '#f4f6ff', { y: 0.62, z: -0.02, sy: 0.6 });
      B.box(0.04, 0.05, 0.03, GOLD, { y: 0.66, z: 0.14 });
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) B.box(0.13 - k * 0.025, 0.012, 0.04, k ? '#ffffff' : GOLD, { x: sx * (0.18 + k * 0.01), y: 0.65 + k * 0.035, z: -0.02, rz: sx * (0.5 + k * 0.2) });
      B.torus(0.12, 0.014, 4, 20, glowC('#fff2a8', 2.0), { y: 0.84, rx: Math.PI / 2 });
      const S = R.armR;
      S.cyl(0.013, 0.013, 0.8, 6, '#c9a24a', { x: 0.19, y: 0.4, z: 0.07 });
      S.cone(0.035, 0.14, 4, glowC('#ffffff', 1.3), { x: 0.19, y: 0.86, z: 0.07 });
      S.box(0.08, 0.02, 0.02, GOLD, { x: 0.19, y: 0.78, z: 0.07 });
      break;
    }
    case 'ninja': {
      // Kage: midnight garb, masked face, red headband and scarf, katana in hand and on the back.
      const navy = '#2b2a4a';
      heroBody(R, { pants: navy, boots: '#1a1a2a', torso: navy, arms: navy, hands: '#1a1a2a', belt: '#c0392b', buckle: '#c0392b' });
      B.box(0.03, 0.2, 0.02, '#3d3c66', { x: 0.03, y: 0.3, z: 0.105, rz: 0.4 });
      heroFace(B, 0.55, { iris: '#c0392b', brow: '#1a1a2a', mask: true });
      B.ball(0.162, 1, navy, { y: 0.57, z: -0.02, sy: 0.95 });
      B.box(0.3, 0.12, 0.2, navy, { y: 0.49, z: 0.05 });
      B.cyl(0.165, 0.165, 0.035, 12, '#c0392b', { y: 0.63 });
      B.box(0.06, 0.04, 0.02, '#c9d2df', { y: 0.63, z: 0.16 });
      for (const sx of [-1, 1]) B.box(0.03, 0.2, 0.01, '#c0392b', { x: sx * 0.04, y: 0.55, z: -0.18, rx: 0.6, rz: sx * 0.2 });
      B.cyl(0.13, 0.13, 0.05, 10, '#c0392b', { y: 0.42 });
      B.box(0.07, 0.24, 0.015, '#c0392b', { x: -0.08, y: 0.3, z: -0.14, rx: 0.5, rz: 0.3 });
      B.box(0.03, 0.5, 0.025, '#1a1a2a', { y: 0.36, z: -0.14, rz: 0.75 });
      B.box(0.07, 0.015, 0.06, GOLD, { x: 0.13, y: 0.53, z: -0.14, rz: 0.75 });
      for (let k = 0; k < 4; k++) B.box(0.05, 0.006, 0.014, '#c9d2df', { x: -0.1, y: 0.21, z: 0.1, ry: (k * Math.PI) / 4 });
      const S = R.armR;
      S.box(0.018, 0.4, 0.008, '#eef2f8', { x: 0.18, y: 0.4, z: 0.12, rx: 0.3 });
      S.box(0.06, 0.012, 0.05, GOLD, { x: 0.18, y: 0.21, z: 0.07, rx: 0.3 });
      S.cyl(0.014, 0.014, 0.08, 5, '#c0392b', { x: 0.18, y: 0.17, z: 0.05, rx: 0.3 });
      break;
    }
  }
}

const rigCache = new Map<string, { parts: HeroRigPart[]; rest: THREE.BufferGeometry[] }>();

/** Where a Legend crown sits on each hero's head (height and radius). */
const CROWN_AT: Record<HeroId, [number, number]> = {
  ranger: [0.69, 0.16], knight: [0.72, 0.165], mage: [0.76, 0.13], dwarf: [0.68, 0.16], valkyrie: [0.7, 0.16], ninja: [0.68, 0.162],
};

/** Gear earned by levelling: pauldron rims, a cape, a glowing weapon gem, a crown. */
function addHeroGear(id: HeroId, R: HeroRigBuilder, tier: number): void {
  if (tier <= 0) return;
  const g = HERO_GEAR[tier];
  // Legend's prismatic colour is for glows; its metalwork is gold.
  const metal = tier >= 4 ? GOLD : g.color;
  const w = R.w;
  const hero = HEROES[id];
  for (const sx of [-1, 1]) {
    R.arm(sx).torus(0.062 * w, 0.016, 4, 12, metal, { x: sx * 0.15 * w, y: 0.375, rx: Math.PI / 2, sz: 0.8 });
    R.arm(sx).ball(0.03, 0, metal, { x: sx * 0.2 * w, y: 0.36 });
  }
  if (tier >= 2) {
    // Cape in the hero's colour, trimmed in the gear colour.
    R.body.box(0.3 * w, 0.32, 0.018, hero.color, { y: 0.25, z: -0.155, rx: 0.16 });
    R.body.box(0.3 * w, 0.03, 0.02, metal, { y: 0.1, z: -0.18, rx: 0.16 });
    for (const sx of [-1, 1]) R.body.ball(0.025, 0, GOLD, { x: sx * 0.12 * w, y: 0.41, z: -0.1 });
  }
  if (tier >= 3) {
    R.armR.octa(0.035, glowC(g.color, 1.9), { x: 0.17 * w, y: 0.15, z: 0.08, sy: 1.4 });
    R.body.torus(0.135 * w, 0.014, 4, 14, metal, { y: 0.205, rx: Math.PI / 2, sy: 0.82 });
  }
  if (tier >= 4) {
    // A crown seated on the head.
    const [y, r] = CROWN_AT[id];
    R.body.cyl(r, r, 0.05, 14, GOLD, { y });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      R.body.cone(0.026, 0.07, 4, GOLD, { x: Math.cos(a) * r, y: y + 0.055, z: Math.sin(a) * r });
      R.body.ball(0.016, 0, glowC(k % 2 ? '#ff6a9a' : '#8fd8ff', 1.8), { x: Math.cos(a) * (r + 0.004), y, z: Math.sin(a) * (r + 0.004) });
    }
  }
}

/** The rigged hero: pivot-centred parts for animation plus the rest-pose pieces. */
export function heroRig(id: HeroId, gear = 0): { parts: HeroRigPart[]; rest: THREE.BufferGeometry[] } {
  const key = `${id}-${gear}`;
  let r = rigCache.get(key);
  if (r) return r;
  const R = new HeroRigBuilder();
  buildHeroRig(id, R);
  addHeroGear(id, R, gear);
  const w = R.w;
  const pivots: Record<HeroPart, THREE.Vector3> = {
    body: new THREE.Vector3(0, 0, 0),
    legL: new THREE.Vector3(-0.065 * w, HIP_Y, 0),
    legR: new THREE.Vector3(0.065 * w, HIP_Y, 0),
    armL: new THREE.Vector3(-0.15 * w, SHOULDER_Y, 0),
    armR: new THREE.Vector3(0.15 * w, SHOULDER_Y, 0),
  };
  const parts: HeroRigPart[] = [];
  const rest: THREE.BufferGeometry[] = [];
  for (const name of ['body', 'legL', 'legR', 'armL', 'armR'] as HeroPart[]) {
    const geo = R[name].build();
    if (!geo.attributes.position) continue;
    rest.push(geo);
    const g = geo.clone();
    g.translate(-pivots[name].x, -pivots[name].y, -pivots[name].z);
    g.computeBoundingSphere();
    parts.push({ name, geo: g, pivot: pivots[name] });
  }
  r = { parts, rest };
  rigCache.set(key, r);
  return r;
}

/** Merged rest pose (UI portraits, and anything that doesn't animate limbs). */
export function heroModel(id: HeroId | 'champion', withWings = true): THREE.BufferGeometry {
  return cached(`hero-${id}-${withWings}`, () => {
    if (id === 'champion') {
      const b = new ModelBuilder();
      b.box(0.36, 0.32, 0.22, '#e8c547', { y: 0.32 });
      b.cyl(0.14, 0.14, 0.2, 8, '#f6dc7a', { y: 0.58 });
      b.cone(0.06, 0.24, 4, '#e84a3a', { y: 0.78 });
      b.box(0.05, 0.55, 0.05, '#ffffff', { x: 0.24, y: 0.46, z: 0.08 });
      b.box(0.4, 0.4, 0.04, '#c0392b', { y: 0.36, z: -0.13 });
      return b.build();
    }
    const pieces = heroRig(id).rest.map((g) => ({ geo: g, x: 0, y: 0, z: 0, ry: 0, s: 1 }));
    if (id === 'valkyrie' && withWings) {
      pieces.push({ geo: heroWingModel(), x: 0.06, y: 0.36, z: -0.12, ry: -0.35, s: 1 });
      pieces.push({ geo: heroWingModel(), x: -0.06, y: 0.36, z: -0.12, ry: Math.PI + 0.35, s: 1 });
    }
    const g = mergeTransformed(pieces);
    g.computeVertexNormals();
    return g;
  });
}

// --- Map pieces ---------------------------------------------------------------

/** `banner`: a Style banner flies from the keep instead of the plain red flag. */
export function castleModel(wall: string, tier = 0, archers = false, banner = false): THREE.BufferGeometry {
  return cached(`castle-${wall}-${tier}-${archers}-${banner}`, () => {
    const b = new ModelBuilder();
    castleGrowth(b, wall, tier, archers);
    const c = new THREE.Color(wall);
    const dark = '#' + c.clone().multiplyScalar(0.78).getHexString();
    const light = '#' + c.clone().lerp(new THREE.Color('#ffffff'), 0.18).getHexString();
    const slit = '#2b2340';
    // Stepped stone foundation.
    b.box(1.36, 0.08, 1.36, '#7d7468', { y: 0.04 });
    b.box(1.24, 0.06, 1.24, '#8f8576', { y: 0.11 });
    // Curtain walls with a walkway, crenellations and a stone course.
    b.box(1.0, 0.6, 1.0, wall, { y: 0.44 });
    b.box(1.04, 0.04, 1.04, dark, { y: 0.3 });
    b.box(1.06, 0.05, 1.06, light, { y: 0.76 });
    for (const side of [0, 1, 2, 3]) {
      const a = (side * Math.PI) / 2;
      for (let k = 0; k < 4; k++) {
        const along = -0.33 + k * 0.22;
        const nx = Math.sin(a), nz = Math.cos(a);
        b.box(0.11, 0.1, 0.07, wall, { x: nx * 0.5 + nz * along, y: 0.83, z: nz * 0.5 - nx * along, ry: a });
      }
      // Arrow slits.
      if (side !== 0) for (const along of [-0.2, 0.2]) b.box(0.04, 0.14, 0.02, slit, { x: Math.sin(a) * 0.505 + Math.cos(a) * along, y: 0.5, z: Math.cos(a) * 0.505 - Math.sin(a) * along, ry: a });
    }
    // Corner turrets: banded, windowed, with conical roofs and pennants.
    const pennant = ['#e84a3a', '#f2c94c', '#e84a3a', '#f2c94c'];
    [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].forEach(([x, z], i) => {
      b.cyl(0.2, 0.23, 0.95, 10, wall, { x, y: 0.6, z });
      b.cyl(0.235, 0.235, 0.04, 10, dark, { x, y: 0.35, z });
      b.cyl(0.25, 0.22, 0.08, 10, light, { x, y: 1.06, z });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        b.box(0.07, 0.08, 0.06, wall, { x: x + Math.cos(a) * 0.22, y: 1.13, z: z + Math.sin(a) * 0.22, ry: -a });
      }
      const out = Math.atan2(x, z);
      b.box(0.05, 0.12, 0.02, slit, { x: x + Math.sin(out) * 0.215, y: 0.78, z: z + Math.cos(out) * 0.215, ry: out });
      b.cone(0.27, 0.42, 10, ROOF, { x, y: 1.37, z });
      b.cyl(0.008, 0.008, 0.22, 3, WOOD_D, { x, y: 1.65, z });
      b.box(0.13, 0.07, 0.01, pennant[i], { x: x + 0.065, y: 1.72, z });
    });
    // Keep: windows, a balcony ring and a tall blue spire with the royal banner.
    b.box(0.52, 0.95, 0.52, wall, { y: 0.93 });
    b.box(0.56, 0.05, 0.56, dark, { y: 1.1 });
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      const nx = Math.sin(a), nz = Math.cos(a);
      b.box(0.1, 0.16, 0.02, '#ffd36a', { x: nx * 0.265, y: 1.22, z: nz * 0.265, ry: a });
      b.box(0.14, 0.03, 0.04, light, { x: nx * 0.27, y: 1.13, z: nz * 0.27, ry: a });
      for (const along of [-0.18, 0, 0.18]) b.box(0.09, 0.09, 0.07, wall, { x: nx * 0.26 + nz * along, y: 1.45, z: nz * 0.26 - nx * along, ry: a });
    }
    b.box(0.56, 0.05, 0.56, light, { y: 1.41 });
    b.cone(0.38, 0.62, 4, '#3f6fd1', { y: 1.72, ry: Math.PI / 4 });
    b.ball(0.04, 0, GOLD, { y: 2.05 });
    if (!banner) {
      b.cyl(0.012, 0.012, 0.45, 4, WOOD_D, { y: 2.25 });
      b.box(0.28, 0.16, 0.015, '#e84a3a', { x: 0.14, y: 2.38 });
      b.box(0.08, 0.08, 0.02, GOLD, { x: 0.14, y: 2.38, z: 0.006 });
    }
    // Gatehouse: arch, portcullis, lanterns and hanging banners.
    b.box(0.42, 0.52, 0.12, dark, { y: 0.36, z: 0.5 });
    b.box(0.26, 0.34, 0.03, '#1a1218', { y: 0.28, z: 0.565 });
    b.cyl(0.13, 0.13, 0.03, 10, '#1a1218', { y: 0.45, z: 0.565, rx: Math.PI / 2, sy: 1 });
    for (let k = 0; k < 4; k++) b.box(0.015, 0.36, 0.015, '#5d6470', { x: -0.09 + k * 0.06, y: 0.3, z: 0.585 });
    for (let k = 0; k < 3; k++) b.box(0.24, 0.015, 0.015, '#5d6470', { y: 0.18 + k * 0.1, z: 0.585 });
    for (const sx of [-1, 1]) {
      b.box(0.12, 0.3, 0.012, '#3f6fd1', { x: sx * 0.32, y: 0.56, z: 0.51 });
      b.cone(0.06, 0.06, 3, '#3f6fd1', { x: sx * 0.32, y: 0.38, z: 0.51, rx: Math.PI });
      b.box(0.05, 0.05, 0.012, GOLD, { x: sx * 0.32, y: 0.6, z: 0.518 });
      b.ball(0.035, 0, new THREE.Color('#ffc46a').multiplyScalar(1.8), { x: sx * 0.19, y: 0.5, z: 0.6 });
    }
    // Steps up to the gate.
    b.box(0.34, 0.04, 0.14, '#8f8576', { y: 0.16, z: 0.66 });
    b.box(0.3, 0.04, 0.1, '#9a9184', { y: 0.2, z: 0.6 });
    return b.build();
  });
}

/** Castle upgrades show on the model: an outer wall, extra turrets and banners, gold and glowing windows, archers. */
function castleGrowth(b: ModelBuilder, wall: string, tier: number, archers: boolean): void {
  const c = new THREE.Color(wall);
  const dark = '#' + c.clone().multiplyScalar(0.78).getHexString();
  const trim = tier >= 3 ? GOLD : dark;
  if (tier >= 1) {
    // Low outer curtain wall with merlons and corner posts (leaves the front open for the gate).
    for (const [x, z, w, d] of [[0, -0.78, 1.5, 0.1], [-0.78, 0, 0.1, 1.5], [0.78, 0, 0.1, 1.5]] as const) {
      b.box(w, 0.22, d, wall, { x, y: 0.11, z });
      b.box(w + 0.02, 0.03, d + 0.02, trim, { x, y: 0.235, z });
      const n = 6;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n - 0.5;
        b.box(w > d ? 0.1 : 0.12, 0.07, w > d ? 0.12 : 0.1, wall, { x: x + (w > d ? t * w : 0), y: 0.28, z: z + (w > d ? 0 : t * d) });
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.cyl(0.1, 0.11, 0.36, 8, wall, { x: sx * 0.78, y: 0.18, z: sz * 0.78 });
      b.cone(0.13, 0.18, 8, tier >= 3 ? GOLD : ROOF, { x: sx * 0.78, y: 0.45, z: sz * 0.78 });
    }
    for (const sx of [-1, 1]) b.box(0.4, 0.2, 0.1, wall, { x: sx * 0.58, y: 0.1, z: 0.78 });
  }
  if (tier >= 2) {
    // Banners on the outer wall and two watchtowers at the back.
    for (const sx of [-1, 1]) {
      b.box(0.1, 0.24, 0.012, '#3f6fd1', { x: sx * 0.84, y: 0.2, z: 0.3 });
      b.box(0.1, 0.24, 0.012, '#3f6fd1', { x: sx * 0.84, y: 0.2, z: -0.3 });
      b.cyl(0.13, 0.15, 0.9, 10, wall, { x: sx * 0.42, y: 0.45, z: -0.86 });
      b.cyl(0.155, 0.155, 0.04, 10, trim, { x: sx * 0.42, y: 0.92, z: -0.86 });
      b.cone(0.18, 0.32, 10, ROOF, { x: sx * 0.42, y: 1.1, z: -0.86 });
      b.cyl(0.008, 0.008, 0.2, 3, WOOD_D, { x: sx * 0.42, y: 1.34, z: -0.86 });
      b.box(0.12, 0.07, 0.01, '#f2c94c', { x: sx * 0.42 + 0.06, y: 1.4, z: -0.86 });
    }
  }
  if (tier >= 3) {
    // Gilded: glowing windows and a huge royal standard.
    for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) b.box(0.05, 0.09, 0.02, glowC('#ffd36a', 1.6), { x: x + (x > 0 ? -0.0 : 0), y: 0.95, z: z + (z > 0 ? 0.215 : -0.215) });
    b.cyl(0.015, 0.015, 0.9, 5, GOLD, { x: -0.62, y: 1.2, z: -0.62 });
    b.box(0.42, 0.26, 0.015, '#c0392b', { x: -0.4, y: 1.5, z: -0.62 });
    b.box(0.12, 0.12, 0.02, GOLD, { x: -0.4, y: 1.5, z: -0.612 });
  }
  if (archers) {
    // Little archers peeking over the front wall.
    for (const sx of [-1, 1]) {
      b.box(0.08, 0.1, 0.06, '#3f7d3a', { x: sx * 0.24, y: 0.87, z: 0.42 });
      b.ball(0.045, 0, '#f1c9a0', { x: sx * 0.24, y: 0.95, z: 0.42 });
      b.cone(0.05, 0.06, 6, '#2f6a2c', { x: sx * 0.24, y: 1.0, z: 0.42 });
      b.arc(0.07, 0.008, Math.PI * 0.85, WOOD, { x: sx * 0.24 + 0.05, y: 0.9, z: 0.46, ry: Math.PI / 2, rz: -Math.PI / 2 + Math.PI * 0.425 });
    }
  }
}

/** Road barricade, long axis on X (placed across the road). Tier 1 wood, 2 iron-bound, 3 stone and steel. */
export function barricadeModel(tier: number): THREE.BufferGeometry {
  return cached(`barricade-${tier}`, () => {
    const b = new ModelBuilder();
    const wood = tier >= 3 ? '#7a5636' : WOOD;
    if (tier >= 3) {
      for (let i = 0; i < 4; i++) b.dodec(0.14, i % 2 ? '#9b958c' : '#8a847a', { x: -0.36 + i * 0.24, y: 0.08, sy: 0.6 });
    }
    // Stacked logs with sharpened ends.
    for (let k = 0; k < 3; k++) {
      const y = 0.1 + k * 0.13 + (tier >= 3 ? 0.06 : 0);
      b.cyl(0.06, 0.06, 0.9, 7, k % 2 ? wood : WOOD_D, { y, z: (k - 1) * 0.02, rz: Math.PI / 2 });
      for (const sx of [-1, 1]) b.cone(0.06, 0.1, 7, k % 2 ? wood : WOOD_D, { x: sx * 0.5, y, z: (k - 1) * 0.02, rz: sx * -Math.PI / 2 });
    }
    // Cross braces.
    for (const sx of [-1, 1]) b.box(0.05, 0.5, 0.05, WOOD_D, { x: sx * 0.22, y: 0.24, z: -0.08, rz: sx * 0.5 });
    // Spikes facing the enemy (both ways: roads can approach from either side).
    for (let i = 0; i < 4; i++) {
      for (const sz of [-1, 1]) b.cone(0.025, 0.24, 5, tier >= 2 ? '#c9d2df' : '#d9c8a0', { x: -0.3 + i * 0.2, y: 0.24, z: sz * 0.12, rx: sz * (Math.PI / 2 - 0.35) });
    }
    if (tier >= 2) for (const x of [-0.3, 0.3]) b.torus(0.075, 0.015, 4, 10, '#5d6470', { x, y: 0.23, rz: Math.PI / 2, ry: Math.PI / 2 });
    if (tier >= 3) b.box(0.12, 0.16, 0.02, '#c0392b', { y: 0.5, z: 0.04 });
    return b.build();
  });
}

export function spawnModel(theme: string): THREE.BufferGeometry {
  return cached(`spawn-${theme}`, () => {
    const b = new ModelBuilder();
    const rock = theme === 'volcano' ? '#2a2024' : theme === 'snow' ? '#8a9ab0' : '#7a6a58';
    b.dodec(0.38, rock, { x: -0.5, y: 0.2, sy: 1.5 });
    b.dodec(0.38, rock, { x: 0.5, y: 0.2, sy: 1.5 });
    b.box(1.3, 0.28, 0.4, rock, { y: 0.7 });
    b.box(0.7, 0.55, 0.05, '#1a1218', { y: 0.32, z: -0.1 });
    return b.build();
  });
}

export function padModel(): THREE.BufferGeometry {
  return cached('pad', () => {
    const b = new ModelBuilder();
    b.cyl(0.44, 0.47, 0.1, 8, '#9a9184', { y: 0.05 });
    b.cyl(0.38, 0.4, 0.04, 8, '#ffffff', { y: 0.11 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.box(0.1, 0.05, 0.1, '#7d7468', { x: Math.cos(a) * 0.3, y: 0.14, z: Math.sin(a) * 0.3, ry: a });
    }
    return b.build();
  });
}

/** Stone foundations laid on open ground: a square dressed-stone footing with corner blocks. */
export function foundationModel(): THREE.BufferGeometry {
  return cached('foundation', () => {
    const b = new ModelBuilder();
    b.box(0.9, 0.08, 0.9, '#8a8276', { y: 0.04 });
    b.box(0.84, 0.05, 0.84, '#a49b8c', { y: 0.1 });
    // Flagstone top (white so the pad colour tints it, like a pad).
    for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2]) b.box(0.36, 0.03, 0.36, '#ffffff', { x, y: 0.135, z });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.14, 0.09, 0.14, '#7d7468', { x: sx * 0.38, y: 0.15, z: sz * 0.38 });
    // Mortar lines along the footing.
    for (const sx of [-1, 1]) b.box(0.012, 0.05, 0.86, '#6a6258', { x: sx * 0.45, y: 0.05 });
    for (const sz of [-1, 1]) b.box(0.86, 0.05, 0.012, '#6a6258', { y: 0.05, z: sz * 0.45 });
    return b.build();
  });
}

export function propModel(type: PropType): THREE.BufferGeometry {
  return cached(`prop-${type}`, () => {
    const b = new ModelBuilder();
    switch (type) {
      case 'tree': {
        // Trunk with a root flare and two branches, under a lumpy crown of leaf clusters.
        b.cyl(0.045, 0.075, 0.36, 6, WOOD, { y: 0.18 });
        b.cyl(0.09, 0.0, 0.06, 6, WOOD_D, { y: 0.03 });
        b.cyl(0.018, 0.028, 0.18, 4, WOOD, { x: 0.06, y: 0.36, rz: -0.7 });
        b.cyl(0.016, 0.026, 0.16, 4, WOOD, { x: -0.05, y: 0.33, z: 0.03, rz: 0.8 });
        const leaves = ['#4f9d3f', '#5fae4a', '#6fbe55', '#58a646'];
        const clusters: [number, number, number, number][] = [
          [0, 0.5, 0, 0.22], [0.13, 0.46, 0.05, 0.15], [-0.12, 0.47, -0.04, 0.15], [0.02, 0.48, 0.14, 0.14],
          [-0.03, 0.47, -0.14, 0.14], [0.04, 0.66, 0.02, 0.16], [-0.06, 0.6, 0.08, 0.11], [0.08, 0.6, -0.08, 0.11],
        ];
        clusters.forEach(([x, y, z, r], k) => b.ball(r, 1, leaves[k % leaves.length], { x, y, z }));
        b.ball(0.05, 0, '#79c95c', { x: 0.05, y: 0.76, z: 0.03 });
        break;
      }
      case 'pine':
        b.cyl(0.035, 0.06, 0.24, 6, WOOD_D, { y: 0.12 });
        b.cone(0.3, 0.32, 8, '#3a7254', { y: 0.32 });
        b.cone(0.25, 0.3, 8, '#3f7a5a', { y: 0.48 });
        b.cone(0.19, 0.27, 8, '#468462', { y: 0.63 });
        b.cone(0.13, 0.22, 7, '#4f8f6c', { y: 0.77 });
        // Snow on the tips of each tier.
        b.cone(0.31, 0.06, 8, '#f4f8fb', { y: 0.2 });
        b.cone(0.255, 0.05, 8, '#f4f8fb', { y: 0.36 });
        b.cone(0.09, 0.12, 7, '#f4f8fb', { y: 0.86 });
        break;
      case 'rock':
        b.dodec(0.18, '#9b958c', { y: 0.1, sy: 0.7, ry: 0.4 });
        b.dodec(0.1, '#aaa49a', { x: 0.16, y: 0.06, z: 0.06, sy: 0.7 });
        b.dodec(0.07, '#8d877d', { x: -0.14, y: 0.04, z: -0.08, sy: 0.6 });
        // Moss cap.
        b.dodec(0.12, '#6f9a4a', { y: 0.17, x: -0.02, sy: 0.25 });
        break;
      case 'cactus':
        b.cyl(0.07, 0.08, 0.5, 8, '#4f9d4a', { y: 0.25 });
        b.ball(0.07, 1, '#4f9d4a', { y: 0.5, sy: 0.6 });
        b.cyl(0.045, 0.05, 0.2, 8, '#56a650', { x: 0.13, y: 0.33 });
        b.ball(0.045, 1, '#56a650', { x: 0.13, y: 0.43, sy: 0.6 });
        b.cyl(0.045, 0.05, 0.1, 8, '#4f9d4a', { x: 0.08, y: 0.22, rz: Math.PI / 2 });
        b.cyl(0.04, 0.045, 0.14, 8, '#56a650', { x: -0.12, y: 0.27 });
        b.cyl(0.04, 0.045, 0.08, 8, '#4f9d4a', { x: -0.08, y: 0.2, rz: Math.PI / 2 });
        // Ribs.
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          b.box(0.012, 0.46, 0.012, '#3f8a3c', { x: Math.cos(a) * 0.075, y: 0.25, z: Math.sin(a) * 0.075 });
        }
        b.ball(0.04, 0, '#f07aa0', { y: 0.55 });
        break;
      case 'bush':
        b.ball(0.16, 1, '#4f9a3f', { y: 0.1 });
        b.ball(0.12, 1, '#5aa848', { x: 0.14, y: 0.08 });
        b.ball(0.11, 1, '#478f39', { x: -0.12, y: 0.07, z: 0.05 });
        b.ball(0.09, 1, '#62b24e', { x: 0.03, y: 0.2, z: -0.04 });
        for (const [x, y, z] of [[0.05, 0.22, 0.1], [-0.1, 0.15, 0.1], [0.17, 0.15, 0.04], [-0.02, 0.12, -0.15]]) b.ball(0.028, 0, '#e8463a', { x, y, z });
        break;
      case 'flower':
        for (let i = 0; i < 3; i++) {
          const x = (i - 1) * 0.12;
          b.cyl(0.01, 0.01, 0.14, 3, '#3f8a3a', { x, y: 0.07 });
          b.ball(0.045, 0, ['#ff8fb0', '#ffe066', '#ffffff'][i], { x, y: 0.15 });
        }
        break;
      case 'dune':
        b.ball(0.35, 1, '#e6be78', { y: -0.05, sy: 0.35 });
        break;
      case 'snowman':
        b.ball(0.16, 1, '#f8fbff', { y: 0.14 });
        b.ball(0.11, 1, '#f8fbff', { y: 0.36 });
        b.cone(0.025, 0.1, 4, '#f08a2a', { y: 0.37, z: 0.12, rx: Math.PI / 2 });
        b.cyl(0.07, 0.07, 0.08, 6, '#333', { y: 0.5 });
        break;
      case 'crystal':
        b.octa(0.12, '#9fe0ff', { y: 0.18, sy: 2 });
        b.octa(0.07, '#c7b3ff', { x: 0.12, y: 0.1, sy: 2, rz: -0.4 });
        break;
      case 'lavarock':
        b.dodec(0.22, '#2c2226', { y: 0.12, sy: 0.8 });
        b.octa(0.06, '#ff7a2a', { x: 0.08, y: 0.24, z: 0.08 });
        break;
      case 'deadtree':
        b.cyl(0.04, 0.07, 0.5, 5, '#5a4636', { y: 0.25 });
        b.cyl(0.02, 0.03, 0.24, 4, '#5a4636', { x: 0.08, y: 0.4, rz: -0.8 });
        b.cyl(0.02, 0.03, 0.2, 4, '#5a4636', { x: -0.07, y: 0.32, rz: 0.9 });
        break;
      case 'mushroom':
        b.cyl(0.03, 0.04, 0.12, 5, '#f4eedc', { y: 0.06 });
        b.cone(0.11, 0.08, 7, '#e8463a', { y: 0.15 });
        break;
    }
    return b.build();
  });
}

/**
 * Tower mastery marks, standing on the tower's plinth: rank 1 (Veteran) a silver pennant on a
 * pole, rank 2 (Master) a gold banner, a gold ring round the plinth and a little crown.
 */
export function masteryModel(rank: number): THREE.BufferGeometry {
  return cached(`mastery-${rank}`, () => {
    const b = new ModelBuilder();
    const metal = rank >= 2 ? '#f2cf5b' : '#dfe5ec';
    const cloth = rank >= 2 ? '#c23a4a' : '#3f6fd1';
    // Pole at the back-left of the plinth with a swallow-tailed pennant.
    const px = -0.36, pz = -0.3;
    b.cyl(0.018, 0.022, 0.95, 5, '#5a3a22', { x: px, y: 0.5, z: pz });
    b.octa(0.04, metal, { x: px, y: 1.0, z: pz, sy: 1.4 });
    b.box(0.26, 0.15, 0.015, cloth, { x: px + 0.14, y: 0.86, z: pz });
    b.box(0.26, 0.022, 0.018, metal, { x: px + 0.14, y: 0.79, z: pz });
    b.cone(0.06, 0.1, 3, cloth, { x: px + 0.28, y: 0.86, z: pz, rz: -Math.PI / 2, sx: 0.15 });
    if (rank >= 2) {
      b.torus(0.47, 0.022, 4, 20, metal, { y: 0.17, rx: Math.PI / 2 });
      // A small crown resting on the pennant pole's tip.
      b.cyl(0.07, 0.065, 0.05, 8, metal, { x: px, y: 1.1, z: pz });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.cone(0.022, 0.06, 4, metal, { x: px + Math.cos(a) * 0.06, y: 1.15, z: pz + Math.sin(a) * 0.06 });
      }
      b.octa(0.022, '#ff5a6a', { x: px, y: 1.12, z: pz + 0.07 });
    }
    return b.build();
  });
}

// --- Kingdom buildings (on the land beyond the moat) ---------------------------------------

/** A 45° gable roof along X over walls `w` deep, ridge at y = top + w/2. */
function gable(b: ModelBuilder, len: number, w: number, top: number, color: THREE.ColorRepresentation, o: { x?: number; z?: number; ry?: number } = {}) {
  const a = (w / 2 + 0.07) * Math.SQRT2;
  b.box(len + 0.12, a, a, color, { x: o.x ?? 0, y: top, z: o.z ?? 0, rx: Math.PI / 4, ry: o.ry ?? 0 });
}

/** Mullioned window, facing +Z on a wall at z. */
function windowAt(b: ModelBuilder, x: number, y: number, z: number, glow = false) {
  b.box(0.13, 0.17, 0.02, glow ? glowC('#ffcf6a', 1.4) : '#2b2f3a', { x, y, z });
  b.box(0.16, 0.025, 0.035, '#e8dcc0', { x, y: y - 0.1, z });
}

/**
 * Building `id` for the kingdom around the castle. Footprint about 1.6 × 1.6, front faces +Z,
 * sitting on a stone foundation that runs down into the ground. `snow` adds snow on the roofs.
 * The windmill's sails are separate (windmillSails) so they can turn.
 */
export function buildingModel(id: string, snow = false): THREE.BufferGeometry {
  return cached(`bld-${id}-${snow}`, () => {
    const b = new ModelBuilder();
    const roofC = (c: string) => (snow ? new THREE.Color(c).lerp(new THREE.Color('#f4f8fb'), 0.7) : c);
    const found = (w: number, d: number) => b.box(w, 0.5, d, '#aaa496', { y: -0.2 });
    if (id === 'farm') {
      found(1.6, 1.3);
      b.box(1.1, 0.55, 0.8, '#c8553a', { x: -0.2, y: 0.33 });
      b.box(0.36, 0.42, 0.03, '#f3ead6', { x: -0.2, y: 0.27, z: 0.41 });
      b.box(0.03, 0.42, 0.03, '#f3ead6', { x: -0.2, y: 0.27, z: 0.42, rz: 0.75 });
      b.box(0.03, 0.42, 0.03, '#f3ead6', { x: -0.2, y: 0.27, z: 0.42, rz: -0.75 });
      gable(b, 1.1, 0.8, 0.6, roofC('#8a5a3a'), { x: -0.2 });
      b.box(0.12, 0.1, 0.03, '#f3ead6', { x: -0.2, y: 0.82, z: 0.41 });
      // Silo and hay.
      b.cyl(0.2, 0.2, 0.9, 10, '#c8c0b0', { x: 0.55, y: 0.45, z: -0.15 });
      b.ball(0.2, 1, roofC('#7a5a3a'), { x: 0.55, y: 0.9, z: -0.15, sy: 0.7 });
      for (const [hx, hz] of [[0.5, 0.42], [0.72, 0.38], [0.6, 0.55]]) b.cyl(0.11, 0.11, 0.16, 8, snow ? '#e8e4d0' : '#e2c35a', { x: hx, y: 0.14, z: hz, rx: Math.PI / 2 });
      // Fence and a crop patch.
      for (let i = 0; i < 6; i++) b.box(0.03, 0.18, 0.03, WOOD, { x: -0.8 + i * 0.16, y: 0.09, z: 0.62 });
      b.box(0.85, 0.025, 0.025, WOOD, { x: -0.4, y: 0.14, z: 0.62 });
      for (let r = 0; r < 3; r++) b.box(0.6, 0.06, 0.08, snow ? '#e8eef2' : '#6a9a3a', { x: -0.35, y: 0.04, z: -0.5 + (r - 1) * 0.12 });
    } else if (id === 'blacksmith') {
      found(1.2, 1.25);
      b.box(1.0, 0.55, 0.85, '#bdb5a5', { y: 0.33 });
      gable(b, 1.0, 0.85, 0.6, roofC('#6f7d92'));
      // Chimney with a glowing forge mouth and an open lean-to with the anvil.
      b.box(0.24, 0.85, 0.24, '#7a756c', { x: 0.36, y: 0.75, z: -0.2 });
      b.box(0.28, 0.06, 0.28, '#5d5850', { x: 0.36, y: 1.19, z: -0.2 });
      b.box(0.22, 0.16, 0.02, glowC('#ff8a3d', 2.2), { x: 0.2, y: 0.2, z: 0.43 });
      b.box(0.3, 0.3, 0.03, '#5a3a22', { x: -0.22, y: 0.2, z: 0.43 });
      windowAt(b, -0.22, 0.45, 0.43, true);
      b.box(0.6, 0.03, 0.4, WOOD_D, { x: 0, y: 0.62, z: 0.62, rx: 0.3 });
      for (const sx of [-0.27, 0.27]) b.cyl(0.025, 0.025, 0.6, 5, WOOD_D, { x: sx, y: 0.3, z: 0.8 });
      b.box(0.1, 0.12, 0.08, '#3a3a40', { x: 0.05, y: 0.06, z: 0.62 });
      b.box(0.2, 0.06, 0.09, '#4a4a52', { x: 0.05, y: 0.15, z: 0.62 });
      b.cyl(0.08, 0.08, 0.12, 8, WOOD, { x: -0.18, y: 0.06, z: 0.66 });
    } else if (id === 'market') {
      found(1.75, 0.8);
      // Three stalls with striped awnings, crates of produce.
      const stripes = [['#d9573f', '#f3ead6'], ['#3f8fd1', '#f3ead6'], ['#e8b13f', '#f3ead6']];
      for (let i = 0; i < 3; i++) {
        const x = -0.55 + i * 0.55;
        b.box(0.45, 0.22, 0.32, WOOD, { x, y: 0.11 });
        for (const sx of [-0.2, 0.2]) b.cyl(0.018, 0.018, 0.5, 4, WOOD_D, { x: x + sx, y: 0.25, z: 0.14 });
        for (let k = 0; k < 4; k++) b.box(0.12, 0.025, 0.42, roofC(stripes[i][k % 2]), { x: x - 0.18 + k * 0.12, y: 0.52, z: 0.04, rx: -0.35 });
        const goods = ['#e84a3f', '#f2a63f', '#7ac84a'][i];
        for (let k = 0; k < 4; k++) b.ball(0.035, 0, goods, { x: x - 0.12 + k * 0.08, y: 0.25, z: 0.06 });
      }
      for (const [cx, cz] of [[0.75, -0.35], [0.62, -0.42], [-0.75, -0.38]]) b.box(0.15, 0.13, 0.15, WOOD, { x: cx, y: 0.065, z: cz, ry: cx * 2 });
      b.cyl(0.12, 0.14, 0.18, 8, '#6a4a2a', { x: 0, y: 0.09, z: -0.42 });
    } else if (id === 'chapel') {
      found(0.95, 1.45);
      b.box(0.75, 0.6, 1.1, '#efe8da', { y: 0.36, z: 0.05 });
      gable(b, 1.1, 0.75, 0.66, roofC('#5a7fd1'), { ry: Math.PI / 2, z: 0.05 });
      // Steeple with a bell and a golden spire.
      b.box(0.36, 0.7, 0.36, '#efe8da', { y: 0.8, z: 0.5 });
      b.box(0.22, 0.2, 0.38, '#3a3a48', { y: 1.0, z: 0.5 });
      b.cyl(0.06, 0.08, 0.1, 8, GOLD, { y: 0.98, z: 0.5 });
      b.cone(0.28, 0.6, 4, roofC('#5a7fd1'), { y: 1.45, z: 0.5, ry: Math.PI / 4 });
      b.box(0.02, 0.2, 0.02, GOLD, { y: 1.85, z: 0.5 });
      b.box(0.12, 0.02, 0.02, GOLD, { y: 1.88, z: 0.5 });
      b.box(0.24, 0.36, 0.03, '#6a4428', { y: 0.24, z: 0.69 });
      b.cyl(0.12, 0.12, 0.03, 12, glowC('#9fd0ff', 1.2), { y: 0.65, z: 0.69, rx: Math.PI / 2 });
      for (const sz of [-0.25, 0.15]) for (const sx of [-0.38, 0.38]) b.box(0.02, 0.24, 0.12, glowC('#ffd27a', 1.2), { x: sx, y: 0.42, z: sz });
    } else if (id === 'wizard') {
      found(1.1, 1.1);
      b.cyl(0.36, 0.44, 1.5, 9, '#b4aed0', { y: 0.75 });
      b.cyl(0.42, 0.38, 0.12, 9, '#6a6488', { y: 1.52 });
      b.cone(0.5, 0.9, 9, roofC('#7a52c8'), { y: 2.03 });
      b.octa(0.11, glowC('#c08cff', 2.4), { y: 2.65, sy: 1.4 });
      for (let i = 0; i < 6; i++) b.ball(0.025, 0, glowC('#ffe08a', 2), { x: Math.cos(i) * 0.4, y: 1.95 + (i % 2) * 0.12, z: Math.sin(i) * 0.4 });
      for (const y of [0.55, 1.05]) windowAt(b, 0, y, 0.4, true);
      b.box(0.24, 0.34, 0.03, '#3a2a4a', { y: 0.17, z: 0.43 });
      b.torus(0.4, 0.02, 4, 18, '#d9c27a', { y: 1.3, rx: Math.PI / 2 });
    } else if (id === 'windmill') {
      found(1.1, 1.1);
      b.cyl(0.3, 0.45, 1.35, 8, '#e8dcc0', { y: 0.67 });
      b.cone(0.42, 0.5, 8, roofC('#7a4a2a'), { y: 1.6 });
      b.box(0.2, 0.32, 0.03, '#6a4428', { y: 0.16, z: 0.42 });
      windowAt(b, 0, 0.75, 0.37);
      b.cyl(0.05, 0.05, 0.2, 6, WOOD_D, { y: 1.3, z: 0.4, rx: Math.PI / 2 });
      for (let i = 0; i < 3; i++) b.box(0.12 + i * 0.03, 0.1, 0.1, '#d9c27a', { x: 0.4 + i * 0.12, y: 0.05, z: 0.3 });
    } else if (id === 'barracks') {
      found(1.5, 1.35);
      b.box(1.3, 0.5, 0.75, '#a8865e', { y: 0.3, z: -0.15 });
      for (let i = 0; i < 9; i++) b.box(0.03, 0.5, 0.02, '#6a4a2a', { x: -0.6 + i * 0.15, y: 0.3, z: 0.235 });
      gable(b, 1.3, 0.75, 0.55, roofC('#b0473a'), { z: -0.15 });
      b.box(0.26, 0.34, 0.03, '#4a3020', { y: 0.2, z: 0.24 });
      for (const sx of [-0.4, 0.4]) windowAt(b, sx, 0.36, 0.24);
      // Flags and a training yard with straw dummies.
      for (const sx of [-0.68, 0.68]) {
        b.cyl(0.015, 0.015, 0.9, 4, WOOD_D, { x: sx, y: 0.45, z: 0.32 });
        b.box(0.2, 0.13, 0.01, '#c23a4a', { x: sx + 0.1 * Math.sign(sx), y: 0.82, z: 0.32 });
      }
      for (const dx of [-0.3, 0.3]) {
        b.cyl(0.02, 0.02, 0.36, 4, WOOD_D, { x: dx, y: 0.18, z: 0.55 });
        b.box(0.26, 0.03, 0.03, WOOD_D, { x: dx, y: 0.3, z: 0.55 });
        b.capsule(0.07, 0.1, snow ? '#e8e4d0' : '#d9b85a', { x: dx, y: 0.32, z: 0.55 });
        b.ball(0.055, 0, '#d9b85a', { x: dx, y: 0.46, z: 0.55 });
      }
      b.box(0.08, 0.32, 0.02, '#8a8a92', { x: 0.62, y: 0.16, z: 0.56, rz: 0.2 });
    }
    return b.build();
  });
}

/** Windmill sails, centred on their hub (turn them about Z). */
export function windmillSails(): THREE.BufferGeometry {
  return cached('windmill-sails', () => {
    const b = new ModelBuilder();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      b.box(0.04, 0.62, 0.03, WOOD_D, { x: -s * 0.33, y: c * 0.33, rz: a });
      b.box(0.15, 0.48, 0.015, '#f3ead6', { x: -s * 0.38 + c * 0.09, y: c * 0.38 + s * 0.09, rz: a });
    }
    b.cyl(0.07, 0.07, 0.08, 8, WOOD, { rx: Math.PI / 2 });
    return b.build();
  });
}

/** A great banner for the castle: a tall pole with a swallow-tailed flag (flies along +X). */
export function castleBannerModel(color: string): THREE.BufferGeometry {
  return cached(`castle-banner-${color}`, () => {
    const b = new ModelBuilder();
    b.cyl(0.025, 0.03, 1.1, 6, '#4a3424', { y: 0.55 });
    b.ball(0.05, 0, GOLD, { y: 1.12 });
    const c = new THREE.Color(color);
    const dark = c.clone().multiplyScalar(0.7);
    b.box(0.5, 0.3, 0.015, c, { x: 0.27, y: 0.9 });
    b.box(0.5, 0.04, 0.02, dark, { x: 0.27, y: 1.03 });
    // Swallow tail and an emblem.
    b.cone(0.11, 0.16, 3, c, { x: 0.58, y: 0.84, rz: -Math.PI / 2, sz: 0.1 });
    b.cone(0.11, 0.16, 3, c, { x: 0.58, y: 0.96, rz: -Math.PI / 2, sz: 0.1 });
    b.octa(0.07, '#fff3c4', { x: 0.25, y: 0.9, z: 0.012, sz: 0.2 });
    return b.build();
  });
}
