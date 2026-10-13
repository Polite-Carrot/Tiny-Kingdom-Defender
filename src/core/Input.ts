// Touch-first pointer input: tap, drag-to-pan, pinch/wheel zoom. Mouse works too.

import * as THREE from 'three';
import type { CameraRig } from './CameraRig';

export interface InputHandlers {
  onTap(x: number, z: number, sx: number, sy: number): void;
  onHover?(x: number, z: number): void;
}

const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export class Input {
  enabled = true;
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private pinchDist = 0;
  private pinchZoom = 1;
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
  }

  /** Screen -> board plane (y = 0). */
  toWorld(sx: number, sy: number): THREE.Vector3 | null {
    const r = this.el.getBoundingClientRect();
    this.ndc.set(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray.ray.intersectPlane(plane, this.hit) ? this.hit.clone() : null;
  }

  private down = (e: PointerEvent) => {
    if (!this.enabled) return;
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    if (this.pointers.size === 1) {
      this.moved = false;
      this.multi = false;
    }
    if (this.pointers.size === 2) {
      this.multi = true;
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchZoom = this.rig.zoomTarget;
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
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 10) this.moved = true;
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist > 0) this.rig.setZoom(this.pinchZoom * (d / this.pinchDist));
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
    if (!this.moved && !this.multi && performance.now() - p.t < 600) {
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
