// Touch-first pointer input: tap, drag-to-pan, pinch/wheel zoom, two-finger twist to turn the view.
// Mouse: right-drag (or shift-drag) turns, Q/E turn too.
//
// Dragging and pinching keep the ground under your fingers: the spot you grabbed stays under the
// finger as you drag, and a pinch zooms in on the point between your fingers (and pans with it).

import * as THREE from 'three';
import type { CameraRig } from './CameraRig';

export interface InputHandlers {
  onTap(x: number, z: number, sx: number, sy: number): void;
  onHover?(x: number, z: number): void;
}

const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
/** How far (px) a finger may wander and how long (ms) it may stay down and still count as a tap. */
const TAP_SLOP = 14;
const TAP_MS = 900;
/** A two-finger twist must turn this far (radians) before the view starts turning, so pinching doesn't spin it. */
const TWIST_START = 0.3;
/** How far (px) two fingers move before deciding whether it's a pinch or a tilt. */
const GESTURE_DECIDE = 10;
/** Tilt per pixel of a two-finger slide (radians). */
const TILT_PER_PX = 0.0045;

export class Input {
  enabled = true;
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private pinchDist = 0;
  private pinchZoom = 1;
  private twistAngle = 0;
  /** How far the fingers have twisted since the pinch began, and whether the view is turning with them. */
  private twistTotal = 0;
  private twisting = false;
  /** Two fingers: a pinch (zoom, pan, twist) or a tilt (both sliding up or down together). */
  private twoMode: 'undecided' | 'pinch' | 'tilt' = 'undecided';
  /** Recent drag velocity on the ground (world units per second), for the glide on release. */
  private velX = 0;
  private velZ = 0;
  private lastMoveT = 0;
  /** Mouse drag that turns the view (right button or shift). */
  private turning = false;
  private moved = false;
  private multi = false;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private hit = new THREE.Vector3();

  constructor(private el: HTMLElement, private camera: THREE.PerspectiveCamera, private rig: CameraRig, private handlers: InputHandlers) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancel);
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // A finger lifted anywhere (even if the browser dropped the capture) must be forgotten,
    // or every later tap would look like a second finger and be ignored.
    window.addEventListener('pointerup', this.forget, true);
    window.addEventListener('pointercancel', this.forget, true);
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'q' || e.key === 'Q') this.rig.rotateBy(-Math.PI / 4);
      if (e.key === 'e' || e.key === 'E') this.rig.rotateBy(Math.PI / 4);
    });
  }

  /** Screen -> board plane (y = 0). */
  toWorld(sx: number, sy: number): THREE.Vector3 | null {
    const r = this.el.getBoundingClientRect();
    this.ndc.set(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray.ray.intersectPlane(plane, this.hit) ? this.hit.clone() : null;
  }

  private forget = (e: PointerEvent) => {
    // Runs in the capture phase, before `up`: keep the record for `up` to read on the canvas.
    if (e.target !== this.el) this.pointers.delete(e.pointerId);
  };

  private down = (e: PointerEvent) => {
    if (!this.enabled) return;
    // The first finger of a new gesture: anything still recorded is stale.
    if (e.isPrimary) this.pointers.clear();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* Some browsers refuse capture for an already-ending pointer; the tap still counts. */
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    this.rig.stopFling();
    this.velX = this.velZ = 0;
    this.lastMoveT = performance.now();
    if (this.pointers.size === 1) {
      this.moved = false;
      this.multi = false;
      this.turning = e.pointerType === 'mouse' && (e.button === 2 || e.shiftKey);
    }
    if (this.pointers.size === 2) {
      this.multi = true;
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchZoom = this.rig.zoom;
      this.twistAngle = Math.atan2(b.y - a.y, b.x - a.x);
      this.twistTotal = 0;
      this.twisting = false;
      this.twoMode = 'undecided';
      // Measure each finger's slide from here.
      for (const q of this.pointers.values()) {
        q.sx = q.x;
        q.sy = q.y;
      }
    }
  };

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse' && this.handlers.onHover) {
        const w = this.toWorld(e.clientX, e.clientY);
        if (w) this.handlers.onHover(w.x, w.z);
      }
      return;
    }
    let px = p.x, py = p.y;
    const dx = e.clientX - px;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!this.moved && Math.hypot(p.x - p.sx, p.y - p.sy) > TAP_SLOP) {
      this.moved = true;
      // The first few pixels were held back to tell a drag from a tap: catch up from where the finger landed.
      px = p.sx;
      py = p.sy;
    }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      if (this.twoMode === 'undecided') {
        const ma = Math.hypot(a.x - a.sx, a.y - a.sy), mb = Math.hypot(b.x - b.sx, b.y - b.sy);
        // Fingers report one at a time: wait until both have moved (or one has clearly gone alone).
        if (Math.max(ma, mb) < GESTURE_DECIDE || (Math.min(ma, mb) < GESTURE_DECIDE * 0.5 && Math.max(ma, mb) < GESTURE_DECIDE * 3)) return;
        const dya = a.y - a.sy, dyb = b.y - b.sy;
        const spread = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, this.pinchDist);
        // Both fingers sliding the same way up or down, mostly vertically, staying the same distance apart.
        const tilt = Math.sign(dya) === Math.sign(dyb) && Math.abs(dya) > Math.abs(a.x - a.sx) * 1.4 && Math.abs(dyb) > Math.abs(b.x - b.sx) * 1.4
          && Math.min(Math.abs(dya), Math.abs(dyb)) > GESTURE_DECIDE * 0.5 && spread > 0.88 && spread < 1.12;
        this.twoMode = tilt ? 'tilt' : 'pinch';
        if (!tilt) {
          // Start the pinch from here, so the decision distance doesn't jump the zoom.
          this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
          this.pinchZoom = this.rig.zoom;
          this.twistAngle = Math.atan2(b.y - a.y, b.x - a.x);
        }
        return;
      }
      if (this.twoMode === 'tilt') {
        // Fingers up: look flatter, towards the horizon. Down: back towards top-down.
        this.rig.tiltBy((p.y - py) * 0.5 * TILT_PER_PX);
        return;
      }
      // The midpoint before this finger moved, and now.
      const other = a === p ? b : a;
      const mx0 = (px + other.x) / 2, my0 = (py + other.y) / 2;
      const mx1 = (a.x + b.x) / 2, my1 = (a.y + b.y) / 2;
      const grab = this.toWorld(mx0, my0);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist > 0) this.rig.setZoomNow(this.pinchZoom * (d / this.pinchDist));
      // Twisting turns the kingdom, once it is clearly a twist and not a wobbly pinch.
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      let da = ang - this.twistAngle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.twistAngle = ang;
      this.twistTotal += da;
      if (!this.twisting && Math.abs(this.twistTotal) > TWIST_START) this.twisting = true;
      if (this.twisting && Math.abs(da) < 0.5) this.rig.rotateBy(-da);
      this.rig.apply();
      // Keep the ground that was between the fingers between them (zooms on that spot, pans with it).
      const now = this.toWorld(mx1, my1);
      if (grab && now) {
        this.rig.panWorld(grab.x - now.x, grab.z - now.z);
        this.rig.apply();
      }
      return;
    }
    if (this.turning) {
      // Right-drag: sideways turns the view, up and down tilts it.
      if (this.moved) {
        this.rig.rotateBy(-dx * 0.008);
        this.rig.tiltBy((p.y - py) * TILT_PER_PX);
      }
      return;
    }
    if (this.moved && this.pointers.size === 1) {
      // The ground under the finger stays under the finger.
      const from = this.toWorld(px, py);
      const to = this.toWorld(p.x, p.y);
      if (from && to) {
        const wx = from.x - to.x, wz = from.z - to.z;
        this.rig.panWorld(wx, wz);
        this.rig.apply();
        const t = performance.now();
        const dt = Math.max(0.008, (t - this.lastMoveT) / 1000);
        this.lastMoveT = t;
        // Smoothed velocity for the glide on release.
        this.velX = this.velX * 0.6 + (wx / dt) * 0.4;
        this.velZ = this.velZ * 0.6 + (wz / dt) * 0.4;
      }
    }
  };

  private up = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p || !this.enabled) return;
    // A flick keeps the view gliding (only if the finger was still moving when it lifted).
    if (this.moved && !this.multi && !this.turning && performance.now() - this.lastMoveT < 80) {
      const speed = Math.hypot(this.velX, this.velZ);
      const max = 40;
      const k = speed > max ? max / speed : 1;
      if (speed > 1.5) this.rig.fling(this.velX * k, this.velZ * k);
    }
    if (!this.moved && !this.multi && performance.now() - p.t < TAP_MS) {
      const w = this.toWorld(e.clientX, e.clientY);
      if (w) this.handlers.onTap(w.x, w.z, e.clientX, e.clientY);
    }
  };

  private cancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!this.enabled) return;
    // Zoom towards the mouse pointer.
    const grab = this.toWorld(e.clientX, e.clientY);
    this.rig.setZoomNow(this.rig.zoom * (e.deltaY > 0 ? 0.9 : 1.1));
    this.rig.apply();
    const now = this.toWorld(e.clientX, e.clientY);
    if (grab && now) {
      this.rig.panWorld(grab.x - now.x, grab.z - now.z);
      this.rig.apply();
    }
  };
}
