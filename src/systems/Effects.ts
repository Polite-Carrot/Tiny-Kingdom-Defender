// Pooled visual effects: instanced particles, shockwave rings, lightning bolts.

import * as THREE from 'three';

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number;
  gravity: number;
  r: number; g: number; b: number;
  spin: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private list: Particle[] = [];
  private free: Particle[] = [];

  constructor(private capacity: number) {
    const geo = new THREE.OctahedronGeometry(0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < capacity; i++) this.free.push({} as Particle);
  }

  burst(x: number, y: number, z: number, color: THREE.ColorRepresentation, count: number, o: { speed?: number; up?: number; size?: number; life?: number; gravity?: number; spread?: number } = {}): void {
    _c.set(color);
    const speed = o.speed ?? 2;
    for (let i = 0; i < count; i++) {
      if (this.list.length >= this.capacity) return;
      const p = this.free.pop();
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.6);
      const spread = o.spread ?? 0.1;
      p.x = x + (Math.random() - 0.5) * spread;
      p.y = y;
      p.z = z + (Math.random() - 0.5) * spread;
      p.vx = Math.cos(a) * sp;
      p.vz = Math.sin(a) * sp;
      p.vy = (o.up ?? 2) * (0.5 + Math.random());
      p.max = p.life = (o.life ?? 0.6) * (0.7 + Math.random() * 0.6);
      p.size = (o.size ?? 0.08) * (0.6 + Math.random() * 0.8);
      p.gravity = o.gravity ?? 7;
      const k = 0.85 + Math.random() * 0.3;
      p.r = _c.r * k; p.g = _c.g * k; p.b = _c.b * k;
      p.spin = Math.random() * 6;
      this.list.push(p);
    }
  }

  update(dt: number): void {
    let n = 0;
    const colors = this.mesh.instanceColor!.array as Float32Array;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.list[i] = this.list[this.list.length - 1];
        this.list.pop();
        this.free.push(p);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02) {
        p.y = 0.02;
        p.vy *= -0.3;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
      const k = Math.min(1, (p.life / p.max) * 2);
      _e.set(p.spin * p.life, p.spin * p.life * 0.7, 0);
      _q.setFromEuler(_e);
      _p.set(p.x, p.y, p.z);
      _s.setScalar(p.size * k);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(n, _m);
      colors[n * 3] = p.r;
      colors[n * 3 + 1] = p.g;
      colors[n * 3 + 2] = p.b;
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }

  clear(): void {
    for (const p of this.list) this.free.push(p);
    this.list.length = 0;
    this.mesh.count = 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  radius: number;
  active: boolean;
}

export class Rings {
  readonly group = new THREE.Group();
  private rings: Ring[] = [];

  constructor(count = 24) {
    const geo = new THREE.RingGeometry(0.82, 1, 32);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.rings.push({ mesh, life: 0, max: 1, radius: 1, active: false });
    }
  }

  spawn(x: number, z: number, radius: number, color: THREE.ColorRepresentation, life = 0.45, y = 0.06): void {
    const r = this.rings.find((o) => !o.active) ?? this.rings[0];
    r.active = true;
    r.life = r.max = life;
    r.radius = radius;
    r.mesh.position.set(x, y, z);
    (r.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    r.mesh.visible = true;
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const k = 1 - r.life / r.max;
      const s = r.radius * (0.3 + 0.7 * Math.sqrt(k));
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.85;
    }
  }

  clear(): void {
    for (const r of this.rings) {
      r.active = false;
      r.mesh.visible = false;
    }
  }

  dispose(): void {
    this.rings[0]?.mesh.geometry.dispose();
    for (const r of this.rings) (r.mesh.material as THREE.Material).dispose();
  }
}

export class Bolts {
  readonly group = new THREE.Group();
  private bolts: { line: THREE.Line; life: number; active: boolean; attr: THREE.BufferAttribute }[] = [];
  private static readonly MAX_POINTS = 64;

  constructor(count = 16) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(new Float32Array(Bolts.MAX_POINTS * 3), 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', attr);
      const mat = new THREE.LineBasicMaterial({ color: '#e9d8ff', transparent: true, opacity: 1, toneMapped: false });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      this.group.add(line);
      this.bolts.push({ line, life: 0, active: false, attr });
    }
  }

  /** points: flat [x,y,z, x,y,z, ...] */
  spawn(points: number[], color: THREE.ColorRepresentation = '#e9d8ff'): void {
    for (let pass = 0; pass < 2; pass++) {
      const b = this.bolts.find((o) => !o.active) ?? this.bolts[0];
      const arr = b.attr.array as Float32Array;
      let n = 0;
      for (let i = 0; i + 5 < points.length && n < Bolts.MAX_POINTS - 1; i += 3) {
        const ax = points[i], ay = points[i + 1], az = points[i + 2];
        const bx = points[i + 3], by = points[i + 4], bz = points[i + 5];
        const segs = 5;
        for (let s = 0; s < segs && n < Bolts.MAX_POINTS - 1; s++) {
          const t = s / segs;
          const j = s === 0 ? 0 : 0.18;
          arr[n * 3] = ax + (bx - ax) * t + (Math.random() - 0.5) * j;
          arr[n * 3 + 1] = ay + (by - ay) * t + (Math.random() - 0.5) * j;
          arr[n * 3 + 2] = az + (bz - az) * t + (Math.random() - 0.5) * j;
          n++;
        }
      }
      const L = points.length;
      arr[n * 3] = points[L - 3];
      arr[n * 3 + 1] = points[L - 2];
      arr[n * 3 + 2] = points[L - 1];
      n++;
      b.line.geometry.setDrawRange(0, n);
      b.attr.needsUpdate = true;
      (b.line.material as THREE.LineBasicMaterial).color.set(pass === 0 ? color : '#ffffff');
      b.active = true;
      b.life = 0.18;
      b.line.visible = true;
    }
  }

  update(dt: number): void {
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.life -= dt;
      (b.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, b.life / 0.18);
      if (b.life <= 0) {
        b.active = false;
        b.line.visible = false;
      }
    }
  }

  clear(): void {
    for (const b of this.bolts) {
      b.active = false;
      b.line.visible = false;
    }
  }

  dispose(): void {
    for (const b of this.bolts) {
      b.line.geometry.dispose();
      (b.line.material as THREE.Material).dispose();
    }
  }
}
