// Builds flat-shaded, vertex-coloured low-poly models by merging primitives.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

export interface PartOpts {
  x?: number; y?: number; z?: number;
  rx?: number; ry?: number; rz?: number;
  sx?: number; sy?: number; sz?: number;
}

export class ModelBuilder {
  private parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, o: PartOpts = {}): this {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    _q.setFromEuler(_e);
    _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    _p.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    _c.set(color);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    // Tiny per-face brightness variation for a hand-made look.
    for (let i = 0; i < n; i += 3) {
      const k = 0.94 + ((i * 7919) % 13) / 100;
      for (let j = 0; j < 3 && i + j < n; j++) {
        colors[(i + j) * 3] = _c.r * k;
        colors[(i + j) * 3 + 1] = _c.g * k;
        colors[(i + j) * 3 + 2] = _c.b * k;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'color') g.deleteAttribute(key);
    this.parts.push(g);
    geo.dispose();
    return this;
  }

  box(w: number, h: number, d: number, color: THREE.ColorRepresentation, o: PartOpts = {}): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, o);
  }

  cyl(rt: number, rb: number, h: number, seg: number, color: THREE.ColorRepresentation, o: PartOpts = {}): this {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, o);
  }

  cone(r: number, h: number, seg: number, color: THREE.ColorRepresentation, o: PartOpts = {}): this {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, o);
  }

  ball(r: number, detail: number, color: THREE.ColorRepresentation, o: PartOpts = {}): this {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, o);
  }

  dodec(r: number, color: THREE.ColorRepresentation, o: PartOpts = {}): this {
    return this.add(new THREE.DodecahedronGeometry(r, 0), color, o);
  }

  octa(r: number, color: THREE.ColorRepresentation, o: PartOpts = {}): this {
    return this.add(new THREE.OctahedronGeometry(r, 0), color, o);
  }

  torus(r: number, tube: number, rs: number, ts: number, color: THREE.ColorRepresentation, o: PartOpts = {}): this {
    return this.add(new THREE.TorusGeometry(r, tube, rs, ts), color, o);
  }

  /** Merges with another builder's parts. */
  merge(other: ModelBuilder): this {
    this.parts.push(...other.parts.map((p) => p.clone()));
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false) ?? new THREE.BufferGeometry();
    g.computeVertexNormals();
    g.computeBoundingSphere();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return g;
  }
}

/** Merges geometries that each already carry position+color attributes, with per-instance transforms. */
export function mergeTransformed(items: { geo: THREE.BufferGeometry; x: number; y: number; z: number; ry: number; s: number }[]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const it of items) {
    const g = it.geo.clone();
    _e.set(0, it.ry, 0);
    _q.setFromEuler(_e);
    _s.set(it.s, it.s, it.s);
    _p.set(it.x, it.y, it.z);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    parts.push(g);
  }
  const out = parts.length ? mergeGeometries(parts, false) ?? new THREE.BufferGeometry() : new THREE.BufferGeometry();
  for (const p of parts) p.dispose();
  out.computeBoundingSphere();
  return out;
}
