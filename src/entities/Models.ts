// All game models, built procedurally from primitives. Forward is +Z.

import * as THREE from 'three';
import { ModelBuilder, mergeTransformed } from './ModelBuilder';
import { MAX_TIER, BRANCH_TIER, materialFor, starsOf, type TowerId } from '../data/towers';
import type { EnemyId } from '../data/enemies';
import type { HeroId } from '../data/heroes';
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

export function heroModel(id: HeroId | 'champion'): THREE.BufferGeometry {
  return cached(`hero-${id}`, () => {
    const b = new ModelBuilder();
    b.box(0.09, 0.16, 0.09, '#3b3026', { x: -0.07, y: 0.08 });
    b.box(0.09, 0.16, 0.09, '#3b3026', { x: 0.07, y: 0.08 });
    switch (id) {
      case 'ranger':
        b.box(0.28, 0.26, 0.18, '#3f7d3a', { y: 0.29 });
        b.ball(0.12, 0, '#f1c9a0', { y: 0.52 });
        b.cone(0.16, 0.24, 6, '#2f6a2c', { y: 0.62 });
        b.box(0.32, 0.3, 0.03, '#2f6a2c', { y: 0.3, z: -0.11 });
        b.torus(0.18, 0.018, 3, 8, WOOD_D, { x: 0.18, y: 0.32, z: 0.05, ry: Math.PI / 2, sy: 1.5 });
        break;
      case 'knight':
        b.box(0.32, 0.28, 0.2, '#5a7fd1', { y: 0.3 });
        b.cyl(0.13, 0.13, 0.18, 8, '#c9d2df', { y: 0.53 });
        b.box(0.18, 0.03, 0.03, '#222', { y: 0.55, z: 0.13 });
        b.cone(0.04, 0.16, 4, '#f2c94c', { y: 0.7 });
        b.box(0.04, 0.48, 0.04, '#e8ecf2', { x: 0.21, y: 0.42, z: 0.08 });
        b.box(0.14, 0.04, 0.05, GOLD, { x: 0.21, y: 0.22, z: 0.08 });
        b.box(0.26, 0.32, 0.05, '#3a5fb1', { x: -0.2, y: 0.3, z: 0.08, ry: 0.3 });
        break;
      case 'mage':
        b.cone(0.22, 0.5, 7, '#7d43b3', { y: 0.25 });
        b.ball(0.12, 0, '#f1c9a0', { y: 0.53 });
        b.cone(0.17, 0.32, 7, '#5e2f8a', { y: 0.75, rz: 0.15 });
        b.cyl(0.02, 0.02, 0.7, 4, WOOD, { x: 0.2, y: 0.35 });
        b.octa(0.07, '#ff9b4a', { x: 0.2, y: 0.74 });
        break;
      case 'champion':
        b.box(0.36, 0.32, 0.22, '#e8c547', { y: 0.32 });
        b.cyl(0.14, 0.14, 0.2, 8, '#f6dc7a', { y: 0.58 });
        b.cone(0.06, 0.24, 4, '#e84a3a', { y: 0.78 });
        b.box(0.05, 0.55, 0.05, '#ffffff', { x: 0.24, y: 0.46, z: 0.08 });
        b.box(0.4, 0.4, 0.04, '#c0392b', { y: 0.36, z: -0.13 });
        break;
    }
    return b.build();
  });
}

// --- Map pieces ---------------------------------------------------------------

export function castleModel(wall: string): THREE.BufferGeometry {
  return cached(`castle-${wall}`, () => {
    const b = new ModelBuilder();
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
    b.cyl(0.012, 0.012, 0.45, 4, WOOD_D, { y: 2.25 });
    b.box(0.28, 0.16, 0.015, '#e84a3a', { x: 0.14, y: 2.38 });
    b.box(0.08, 0.08, 0.02, GOLD, { x: 0.14, y: 2.38, z: 0.006 });
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
