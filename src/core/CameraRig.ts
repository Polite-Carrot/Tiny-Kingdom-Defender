// Tilted top-down camera that auto-frames the board inside the HUD-free safe area,
// for any aspect ratio, with pinch-zoom / pan limits and screen shake.

import * as THREE from 'three';

export interface SafeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const PITCH = THREE.MathUtils.degToRad(58);

export class CameraRig {
  zoom = 1;
  readonly minZoom = 1;
  readonly maxZoom = 2.4;
  pan = new THREE.Vector2();
  private baseDist = 20;
  private shakeAmt = 0;
  private shakeT = 0;
  private corners: THREE.Vector3[] = [];
  private targetZoom = 1;

  constructor(private camera: THREE.PerspectiveCamera, private half = 6.9) {
    this.setBounds(half);
  }

  setBounds(half: number): void {
    this.half = half;
    this.corners = [];
    for (const y of [-1.0, 0.9]) for (const x of [-half, half]) for (const z of [-half, half]) this.corners.push(new THREE.Vector3(x, y, z));
  }

  /** Recomputes the distance needed to fit the board in the safe area. */
  frame(width: number, height: number, safe: SafeRect): void {
    const cam = this.camera;
    const sw = Math.max(50, width - safe.left - safe.right);
    const sh = Math.max(50, height - safe.top - safe.bottom);
    cam.aspect = width / height;
    cam.clearViewOffset();
    cam.updateProjectionMatrix();
    const limX = (sw / width) * 0.97;
    const limY = (sh / height) * 0.97;
    // Binary search the distance at which every corner projects inside the limits.
    let lo = 4;
    let hi = 120;
    const v = new THREE.Vector3();
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      this.place(mid, 0, 0, 0);
      cam.updateMatrixWorld();
      // Centre the projected box: measure extents.
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const c of this.corners) {
        v.copy(c).project(cam);
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
      if (maxX - minX <= limX * 2 && maxY - minY <= limY * 2) hi = mid;
      else lo = mid;
    }
    this.baseDist = hi;
    // Vertical centring: the tilted board projects asymmetrically; compute the offset in NDC.
    this.place(hi, 0, 0, 0);
    cam.updateMatrixWorld();
    let minY = Infinity, maxY = -Infinity;
    for (const c of this.corners) {
      v.copy(c).project(cam);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
    const ndcCenterY = (minY + maxY) / 2;
    // Offset the projection so the axis sits at the centre of the safe rect, then compensate for the board's own asymmetry.
    const safeCx = safe.left + sw / 2;
    const safeCy = safe.top + sh / 2 + (ndcCenterY * height) / 2;
    cam.setViewOffset(width, height, width / 2 - safeCx, height / 2 - safeCy, width, height);
    cam.updateProjectionMatrix();
    this.clampPan();
  }

  /** Menu mode: slowly circle the kingdom. */
  orbit = false;
  private yaw = 0;
  /** Cinematic focus: glide to a point and zoom in, then ease back when cleared. */
  private focus: { x: number; z: number; zoom: number } | null = null;
  private focusK = 0;
  private lastFocus = { x: 0, z: 0, zoom: 1 };

  focusOn(x: number, z: number, zoom: number): void {
    this.focus = { x, z, zoom };
    this.lastFocus = { x, z, zoom };
  }

  clearFocus(): void {
    this.focus = null;
  }

  private place(dist: number, px: number, pz: number, extraY: number, yaw = 0, pitch = PITCH): void {
    const cam = this.camera;
    const h = Math.cos(pitch) * dist;
    cam.position.set(px + Math.sin(yaw) * h, Math.sin(pitch) * dist + extraY, pz + Math.cos(yaw) * h);
    cam.lookAt(px, extraY, pz);
  }

  /** Current base camera distance (board fit). */
  get distance(): number {
    return this.baseDist;
  }

  setZoom(z: number): void {
    this.targetZoom = THREE.MathUtils.clamp(z, this.minZoom, this.maxZoom);
  }

  get zoomTarget(): number {
    return this.targetZoom;
  }

  panBy(dx: number, dz: number): void {
    this.pan.x += dx;
    this.pan.y += dz;
    this.clampPan();
  }

  private clampPan(): void {
    const lim = this.half * (1 - 1 / this.zoom) * 1.1;
    this.pan.x = THREE.MathUtils.clamp(this.pan.x, -lim, lim);
    this.pan.y = THREE.MathUtils.clamp(this.pan.y, -lim, lim);
  }

  resetView(): void {
    this.targetZoom = 1;
  }

  shake(amount: number): void {
    this.shakeAmt = Math.min(0.35, Math.max(this.shakeAmt, amount));
  }

  /** World units per screen pixel at the board plane (approx). */
  unitsPerPixel(height: number): number {
    const dist = this.baseDist / this.zoom;
    return (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / height;
  }

  update(dt: number): void {
    this.zoom += (this.targetZoom - this.zoom) * Math.min(1, dt * 12);
    this.clampPan();
    this.shakeT += dt;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.2);
    const s = this.shakeAmt * this.shakeAmt * 2;
    const sx = Math.sin(this.shakeT * 53) * s;
    const sz = Math.cos(this.shakeT * 47) * s;
    if (this.orbit) {
      this.yaw += dt * 0.07;
    } else {
      // Ease back to the standard view.
      const target = Math.round(this.yaw / (Math.PI * 2)) * Math.PI * 2;
      this.yaw += (target - this.yaw) * Math.min(1, dt * 4);
    }
    const pitch = this.orbit ? PITCH - 0.42 : PITCH;
    // Smoothstep glide in and out of a cinematic focus.
    this.focusK += ((this.focus ? 1 : 0) - this.focusK) * Math.min(1, dt * 2.2);
    const k = this.focusK * this.focusK * (3 - 2 * this.focusK);
    const f = this.lastFocus;
    const zoom = this.zoom + (f.zoom - this.zoom) * k;
    const px = this.pan.x + (f.x - this.pan.x) * k;
    const pz = this.pan.y + (f.z - this.pan.y) * k;
    this.place(this.baseDist / zoom * (this.orbit ? 1.12 : 1), px + sx, pz + sz, 0, this.yaw, pitch);
    this.camera.updateMatrixWorld();
  }
}
