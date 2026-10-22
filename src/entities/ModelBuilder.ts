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

/**
 * How a tagged part moves when animated in the shader (enemies walk this way):
 * leg / arm swing forward and back about their hip or shoulder, a wing flaps, a wheel rolls,
 * a tail swishes, a sweep leg (beetles, scorpions) scuttles side to side.
 */
export const LIMB = { leg: 1, arm: 2, wing: 3, wheel: 4, tail: 5, sweep: 6 } as const;
export type LimbKind = keyof typeof LIMB;

export interface LimbTag {
  kind: LimbKind;
  /** Pivot: the hip, shoulder or axle the part turns about. */
  x?: number; y: number; z?: number;
  /** -1 left, 1 right (wings flap mirrored; legs and arms alternate by phase). */
  side?: number;
  /** Phase offset in radians (π puts it in step with the other side). */
  phase?: number;
  /** Multiplies the swing (or the roll rate for wheels). */
  amp?: number;
}

export class ModelBuilder {
  private parts: THREE.BufferGeometry[] = [];
  private tag: LimbTag | null = null;

  /** Tags the parts added inside `fn` as one moving limb. */
  limb(tag: LimbTag, fn: () => void): this {
    const prev = this.tag;
    this.tag = tag;
    fn();
    this.tag = prev;
    return this;
  }

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
    if (this.tag) {
      const t = this.tag;
      const a = new Float32Array(n * 4), pv = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        a.set([LIMB[t.kind], t.side ?? 1, t.phase ?? 0, t.amp ?? 1], i * 4);
        pv.set([t.x ?? 0, t.y, t.z ?? 0], i * 3);
      }
      g.setAttribute('limbA', new THREE.BufferAttribute(a, 4));
      g.setAttribute('limbP', new THREE.BufferAttribute(pv, 3));
    }
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

  /** Part of a torus (bows, horns, halos): `arc` radians. */
  arc(r: number, tube: number, arc: number, color: THREE.ColorRepresentation, o: PartOpts = {}): this {
    return this.add(new THREE.TorusGeometry(r, tube, 4, 12, arc), color, o);
  }

  /** Rounded limb. */
  capsule(r: number, len: number, color: THREE.ColorRepresentation, o: PartOpts = {}): this {
    return this.add(new THREE.CapsuleGeometry(r, len, 2, 8), color, o);
  }

  /** Merges with another builder's parts. */
  merge(other: ModelBuilder): this {
    this.parts.push(...other.parts.map((p) => p.clone()));
    return this;
  }

  build(): THREE.BufferGeometry {
    if (!this.parts.length) return new THREE.BufferGeometry();
    // Parts must share attributes to merge: give untagged parts a still (zero) limb tag.
    if (this.parts.some((p) => p.attributes.limbA)) {
      for (const p of this.parts) {
        if (p.attributes.limbA) continue;
        const n = p.attributes.position.count;
        p.setAttribute('limbA', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
        p.setAttribute('limbP', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      }
    }
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
