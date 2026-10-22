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
/** How far the view can be tilted towards the horizon (a low, close look at the castle) and back. */
const MIN_PITCH = THREE.MathUtils.degToRad(18);
const MAX_PITCH = THREE.MathUtils.degToRad(72);

/** The siege opens this far in from the whole-board view (1), so the board fills the screen. */
const DEFAULT_ZOOM = 1.3;

export class CameraRig {
  zoom = DEFAULT_ZOOM;
  readonly minZoom = 1;
  readonly maxZoom = 2.6;
  pan = new THREE.Vector2();
  private baseDist = 20;
  private shakeAmt = 0;
  private shakeT = 0;
  private corners: THREE.Vector3[] = [];
  private targetZoom = DEFAULT_ZOOM;
  /** Glide after a flick (world units per second), slowing to a stop. */
  private vel = new THREE.Vector2();
  /** Viewing angle down at the board (radians): the player tilts it; eases towards the target. */
  private pitch = PITCH;
  private pitchTarget = PITCH;

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
  /** The player's chosen viewing angle around the kingdom (radians; 0 = the standard view). */
  private yawTarget = 0;

  /** Turns the view around the kingdom. */
  rotateBy(da: number): void {
    this.yawTarget += da;
  }

  /** The current viewing angle (0 = standard). */
  get viewYaw(): number {
    return this.yaw;
  }

  /** Whether the player has turned, zoomed or panned away from the standard view. */
  isMoved(): boolean {
    const a = Math.atan2(Math.sin(this.yawTarget), Math.cos(this.yawTarget));
    return Math.abs(a) > 0.02 || Math.abs(this.targetZoom - DEFAULT_ZOOM) > 0.03 || Math.hypot(this.pan.x, this.pan.y) > 0.05 || Math.abs(this.pitchTarget - PITCH) > 0.02;
  }

  /** Back to the standard view: facing the gate, zoomed out and centred. */
  recentre(): void {
    // Turn back the short way.
    this.yawTarget = Math.round(this.yawTarget / (Math.PI * 2)) * Math.PI * 2;
    this.targetZoom = DEFAULT_ZOOM;
    this.pan.set(0, 0);
    this.vel.set(0, 0);
    this.pitchTarget = PITCH;
  }

  /** Tilts the view: negative looks flatter, towards the horizon; positive looks more top-down. */
  tiltBy(d: number): void {
    this.pitchTarget = THREE.MathUtils.clamp(this.pitchTarget + d, MIN_PITCH, MAX_PITCH);
  }

  /** How far the view is tilted from the standard angle (0 = standard, 1 = as flat as it goes). */
  get tilt(): number {
    return Math.max(0, (PITCH - this.pitchTarget) / (PITCH - MIN_PITCH));
  }
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

  /** Zooms at once (fingers on the screen), not eased. */
  setZoomNow(z: number): void {
    this.setZoom(z);
    this.zoom = this.targetZoom;
  }

  /** Moves the view by a world-space amount, at once. */
  panWorld(dx: number, dz: number): void {
    this.pan.x += dx;
    this.pan.y += dz;
    this.clampPan();
  }

  /** Keeps gliding after the finger lifts (world units per second). */
  fling(vx: number, vz: number): void {
    this.vel.set(vx, vz);
  }

  /** A finger landed: stop any glide. */
  stopFling(): void {
    this.vel.set(0, 0);
  }

  /** Places the camera for the current pan and zoom right away, so the next touch reads the view it sees. */
  apply(): void {
    this.update(0);
  }

  get zoomTarget(): number {
    return this.targetZoom;
  }

  /** Pans by a screen-relative amount (x = right, z = down the screen), whichever way the view faces. */
  panBy(dx: number, dz: number): void {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    this.pan.x += dx * c + dz * s;
    this.pan.y += -dx * s + dz * c;
    this.clampPan();
  }

  private clampPan(): void {
    // Zoomed right out you can still nudge the view a little; zoomed in, reach every edge.
    const lim = this.half * (1 - 1 / this.zoom) * 1.15 + this.half * 0.12;
    this.pan.x = THREE.MathUtils.clamp(this.pan.x, -lim, lim);
    this.pan.y = THREE.MathUtils.clamp(this.pan.y, -lim, lim);
  }

  resetView(): void {
    this.targetZoom = this.zoom = DEFAULT_ZOOM;
    this.pan.set(0, 0);
    this.vel.set(0, 0);
    this.pitch = this.pitchTarget = PITCH;
    this.yawTarget = Math.round(this.yaw / (Math.PI * 2)) * Math.PI * 2;
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
    this.pitch += (this.pitchTarget - this.pitch) * Math.min(1, dt * 10);
    if (dt > 0 && (this.vel.x || this.vel.y)) {
      this.pan.x += this.vel.x * dt;
      this.pan.y += this.vel.y * dt;
      this.vel.multiplyScalar(Math.exp(-dt * 5));
      if (this.vel.length() < 0.05) this.vel.set(0, 0);
    }
    this.clampPan();
    this.shakeT += dt;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.2);
    const s = this.shakeAmt * this.shakeAmt * 2;
    const sx = Math.sin(this.shakeT * 53) * s;
    const sz = Math.cos(this.shakeT * 47) * s;
    if (this.orbit) {
      this.yaw += dt * 0.07;
    } else {
      // Ease to the player's chosen angle (after the menu's orbit, the nearest turn of it).
      const target = this.yawTarget + Math.round((this.yaw - this.yawTarget) / (Math.PI * 2)) * Math.PI * 2;
      this.yaw += (target - this.yaw) * Math.min(1, dt * 6);
    }
    const pitch = this.orbit ? PITCH - 0.42 : this.pitch;
    // Smoothstep glide in and out of a cinematic focus.
    this.focusK += ((this.focus ? 1 : 0) - this.focusK) * Math.min(1, dt * 2.2);
    const k = this.focusK * this.focusK * (3 - 2 * this.focusK);
    const f = this.lastFocus;
    // The menu's slow orbit always shows the whole kingdom.
    const base = this.orbit ? 1 : this.zoom;
    const zoom = base + (f.zoom - base) * k;
    const px = this.pan.x + (f.x - this.pan.x) * k;
    const pz = this.pan.y + (f.z - this.pan.y) * k;
    this.place(this.baseDist / zoom * (this.orbit ? 1.12 : 1), px + sx, pz + sz, 0, this.yaw, pitch);
    this.camera.updateMatrixWorld();
  }
}
