// Weather over the board: rain (with lightning), fog, sandstorms, snowstorms and falling ash.
// Purely visual. The particles live in a box around the board and are recycled as they fall.

import * as THREE from 'three';
import type { WeatherKind } from '../game/Siege';

const BOX = { x: 11, y: 9, z: 11 };

export class Weather {
  readonly group = new THREE.Group();
  private kind: WeatherKind = 'clear';
  private rain: THREE.LineSegments;
  private dust: THREE.Points;
  private rainVel = 13;
  private dustVel = new Float32Array(0);
  private flashT = 0;
  private nextFlash = 6;
  /** Brightness of the current lightning flash (0..1), read by the view. */
  flash = 0;

  constructor(quality: 'low' | 'high') {
    const nRain = quality === 'high' ? 1500 : 600;
    const rp = new Float32Array(nRain * 6);
    for (let i = 0; i < nRain; i++) this.resetDrop(rp, i, true);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#e4eefc', transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;

    const nDust = quality === 'high' ? 1300 : 500;
    const dp = new Float32Array(nDust * 3);
    this.dustVel = new Float32Array(nDust);
    for (let i = 0; i < nDust; i++) {
      dp.set([(Math.random() * 2 - 1) * BOX.x, Math.random() * BOX.y, (Math.random() * 2 - 1) * BOX.z], i * 3);
      this.dustVel[i] = 0.7 + Math.random() * 0.6;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#ffffff', size: 0.09, transparent: true, opacity: 0, depthWrite: false }));
    this.dust.frustumCulled = false;
    this.dust.visible = false;
    this.group.add(this.rain, this.dust);
  }

  private resetDrop(p: Float32Array, i: number, anywhere: boolean): void {
    const x = (Math.random() * 2 - 1) * BOX.x;
    const z = (Math.random() * 2 - 1) * BOX.z;
    const y = anywhere ? Math.random() * BOX.y : BOX.y + Math.random() * 2;
    // A short streak, slanted by the wind.
    p.set([x, y, z, x + 0.09, y + 0.6, z + 0.03], i * 6);
  }

  /** Switches the weather (only while it is calm, so nothing pops). */
  setKind(kind: WeatherKind): void {
    if (kind === this.kind) return;
    this.kind = kind;
    const mat = this.dust.material as THREE.PointsMaterial;
    if (kind === 'snow') { mat.color.set('#ffffff'); mat.size = 0.15; }
    else if (kind === 'sand') { mat.color.set('#e8cc90'); mat.size = 0.17; }
    else if (kind === 'ash') { mat.color.set('#9a9098'); mat.size = 0.11; }
  }

  get current(): WeatherKind {
    return this.kind;
  }

  update(dt: number, intensity: number): void {

    const k = this.kind;
    const rainOn = k === 'rain' && intensity > 0.01;
    const dustOn = (k === 'snow' || k === 'sand' || k === 'ash') && intensity > 0.01;
    this.rain.visible = rainOn;
    this.dust.visible = dustOn;
    (this.rain.material as THREE.LineBasicMaterial).opacity = 0.75 * intensity;
    (this.dust.material as THREE.PointsMaterial).opacity = (k === 'sand' ? 0.75 : 0.9) * intensity;
    if (rainOn) {
      const p = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      const a = p.array as Float32Array;
      const fall = this.rainVel * dt;
      for (let i = 0; i < a.length; i += 6) {
        a[i + 1] -= fall;
        a[i + 4] -= fall;
        a[i] -= fall * 0.15;
        a[i + 3] -= fall * 0.15;
        if (a[i + 1] < 0) this.resetDrop(a, i / 6, false);
      }
      p.needsUpdate = true;
      // Now and then, lightning.
      if ((this.nextFlash -= dt) <= 0) {
        this.nextFlash = 5 + Math.random() * 9;
        this.flashT = 0.35;
      }
    }
    if (this.flashT > 0) this.flashT -= dt;
    // A double flicker.
    this.flash = rainOn && this.flashT > 0 ? Math.max(0, Math.sin((0.35 - this.flashT) * 30)) * intensity : 0;
    if (dustOn) {
      const p = this.dust.geometry.attributes.position as THREE.BufferAttribute;
      const a = p.array as Float32Array;
      const t = performance.now() / 1000;
      for (let i = 0; i < a.length; i += 3) {
        const v = this.dustVel[i / 3];
        if (k === 'snow') {
          a[i] += (3 + Math.sin(t + i) * 0.8) * v * dt;
          a[i + 1] -= 1.8 * v * dt;
          a[i + 2] += Math.cos(t * 0.7 + i) * 0.6 * dt;
        } else if (k === 'sand') {
          a[i] += 7 * v * dt;
          a[i + 1] += Math.sin(t * 2 + i) * 0.4 * dt;
          a[i + 2] += 1.2 * v * dt;
        } else {
          a[i + 1] -= 0.6 * v * dt;
          a[i] += Math.sin(t * 0.5 + i) * 0.3 * dt;
        }
        if (a[i] > BOX.x) a[i] -= BOX.x * 2;
        if (a[i + 2] > BOX.z) a[i + 2] -= BOX.z * 2;
        if (a[i + 1] < 0) a[i + 1] += BOX.y;
        if (k === 'sand' && a[i + 1] > 3.5) a[i + 1] = Math.random() * 0.5;
      }
      p.needsUpdate = true;
    }
  }

  dispose(): void {
    this.rain.geometry.dispose();
    (this.rain.material as THREE.Material).dispose();
    this.dust.geometry.dispose();
    (this.dust.material as THREE.Material).dispose();
  }
}
