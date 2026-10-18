// Touch-first pointer input: tap, drag-to-pan, pinch/wheel zoom, two-finger twist to turn the view.
// Mouse: right-drag (or shift-drag) turns, Q/E turn too.

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

export class Input {
  enabled = true;
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private pinchDist = 0;
  private pinchZoom = 1;
  private twistAngle = 0;
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
    if (this.pointers.size === 1) {
      this.moved = false;
      this.multi = false;
      this.turning = e.pointerType === 'mouse' && (e.button === 2 || e.shiftKey);
    }
    if (this.pointers.size === 2) {
      this.multi = true;
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchZoom = this.rig.zoomTarget;
      this.twistAngle = Math.atan2(b.y - a.y, b.x - a.x);
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
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > TAP_SLOP) this.moved = true;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist > 0) this.rig.setZoom(this.pinchZoom * (d / this.pinchDist));
      // Twisting two fingers turns the kingdom with them.
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      let da = ang - this.twistAngle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.twistAngle = ang;
      if (Math.abs(da) < 0.5) this.rig.rotateBy(-da);
      return;
    }
    if (this.turning) {
      if (this.moved) this.rig.rotateBy(-dx * 0.008);
      return;
    }
    if (this.moved && this.pointers.size === 1 && this.rig.zoom > 1.02) {
      const upp = this.rig.unitsPerPixel(window.innerHeight);
      this.rig.panBy(-dx * upp, -dy * upp * 1.2);
    }
  };

  private up = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p || !this.enabled) return;
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
    this.rig.setZoom(this.rig.zoomTarget * (e.deltaY > 0 ? 0.9 : 1.1));
  };
}
