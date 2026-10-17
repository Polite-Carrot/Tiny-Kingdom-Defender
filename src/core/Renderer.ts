// Owns the WebGL renderer, scene, lights and quality settings.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type Quality = 'low' | 'high';

const NIGHT = {
  sky: new THREE.Color('#0d1430'),
  fog: new THREE.Color('#1a2346'),
  duskSky: new THREE.Color('#e88a5a'),
  duskSun: new THREE.Color('#ff9a5a'),
  moon: new THREE.Color('#a8bcff'),
  ambient: new THREE.Color('#7f90e0'),
  duskAmbient: new THREE.Color('#ffb48a'),
  ground: new THREE.Color('#2a2440'),
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(36, 1, 0.5, 120);
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  quality: Quality;
  /** High quality: HDR render with a soft bloom on bright, glowing things. */
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  width = 1;
  height = 1;

  constructor(readonly canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.hemi = new THREE.HemisphereLight('#cfe8ff', '#6b5a40', 0.95);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1d6', 1.65);
    this.sun.position.set(-6, 12, 7);
    this.sun.target.position.set(0, 0, 0);
    const sc = this.sun.shadow.camera;
    sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 40;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.scene.fog = new THREE.Fog('#d6efff', 30, 70);
    this.setQuality(quality);
    this.resize();
  }

  setQuality(q: Quality): void {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    // Cap the pixel ratio: big win for fill-rate on phones.
    this.renderer.setPixelRatio(q === 'high' ? Math.min(dpr, 2) : Math.min(dpr, 1));
    this.renderer.shadowMap.enabled = q === 'high';
    this.sun.castShadow = q === 'high';
    if (q === 'high' && !this.composer) {
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.45, 1.15);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } else if (q === 'low' && this.composer) {
      this.composer.dispose();
      this.bloom?.dispose();
      this.composer = null;
      this.bloom = null;
    }
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private base = { sky: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color(), ambient: new THREE.Color() };
  /** 0 = day, 0.5 = dusk, 1 = night. */
  night = 0;

  setTheme(sky: string, fog: string, sun: string, ambient: string): void {
    this.base.sky.set(sky);
    this.base.fog.set(fog);
    this.base.sun.set(sun);
    this.base.ambient.set(ambient);
    this.scene.background = new THREE.Color(sky);
    this.setNight(this.night);
  }

  /** Weather haze: 0..1 and the colour it pulls the fog towards; flash = lightning (0..1). */
  private haze = 0;
  private hazeColor = new THREE.Color('#c8ccd4');
  private flash = 0;
  private fogRange = { near: 30, far: 70 };

  /** Camera-dependent fog distances (weather pulls them in). */
  setFogRange(near: number, far: number): void {
    this.fogRange.near = near;
    this.fogRange.far = far;
    this.setNight(this.night);
  }

  setWeather(haze: number, color: THREE.ColorRepresentation, flash: number): void {
    if (Math.abs(haze - this.haze) < 0.002 && flash === this.flash) return;
    this.haze = haze;
    this.hazeColor.set(color);
    this.flash = flash;
    this.setNight(this.night);
  }

  /** Time of day: lights, fog and sky go from the Age's daylight through a warm dusk to moonlight. */
  setNight(k: number): void {
    this.night = k;
    const dusk = Math.max(0, 1 - Math.abs(k - 0.5) * 2);
    if (!(this.scene.background instanceof THREE.Color)) this.scene.background = this.base.sky.clone();
    const bg = this.scene.background as THREE.Color;
    bg.copy(this.base.sky).lerp(NIGHT.sky, k).lerp(NIGHT.duskSky, dusk * 0.35);
    (this.scene.fog as THREE.Fog).color.copy(this.base.fog).lerp(NIGHT.fog, k).lerp(NIGHT.duskSky, dusk * 0.3);
    this.sun.color.copy(this.base.sun).lerp(NIGHT.duskSun, dusk * 0.9).lerp(NIGHT.moon, k);
    this.sun.intensity = 1.65 * (1 - 0.5 * k);
    this.hemi.color.copy(this.base.ambient).lerp(NIGHT.duskAmbient, dusk * 0.5).lerp(NIGHT.ambient, k);
    this.hemi.groundColor.set('#6b5a40').lerp(NIGHT.ground, k);
    this.hemi.intensity = 0.95 * (1 - 0.25 * k);
    if (this.bloom) this.bloom.strength = 0.32 + 0.3 * k;
    // Weather: thicker, tinted fog and dimmer light; lightning flashes it all bright.
    const fog = this.scene.fog as THREE.Fog;
    const h = this.haze;
    // Kept light enough that the board always reads clearly through it.
    fog.near = this.fogRange.near * (1 - 0.4 * h);
    fog.far = fog.near + (this.fogRange.far - this.fogRange.near) * (1 - 0.5 * h);
    fog.color.lerp(this.hazeColor.clone().multiplyScalar(1 - 0.7 * k), h * 0.5);
    this.sun.intensity *= 1 - 0.3 * h;
    this.hemi.intensity *= 1 - 0.15 * h;
    if (this.flash > 0) {
      this.hemi.intensity += 2.2 * this.flash;
      this.sun.intensity += 1.5 * this.flash;
    }
  }

  render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
