// Owns the WebGL renderer, scene, lights and quality settings.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type Quality = 'low' | 'high';

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

  setTheme(sky: string, fog: string, sun: string, ambient: string): void {
    this.scene.background = new THREE.Color(sky);
    (this.scene.fog as THREE.Fog).color.set(fog);
    this.sun.color.set(sun);
    this.hemi.color.set(ambient);
  }

  render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
