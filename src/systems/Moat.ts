// The castle moat: still, murky water between the plateau and a stone retaining wall.
// On high quality it is a real planar mirror (three's Reflector renders the scene upside-down
// into a texture), distorted by small ripples, mixed with the deep water colour by a fresnel
// term, with sun glints and a lapping line where the water meets the stone. Low quality uses
// the same shading with a flat sky colour in place of the reflection.

import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import type { Theme } from '../data/themes';

interface MoatLook {
  deep: string;
  murk: string;
  ice: boolean;
}

const LOOKS: Partial<Record<Theme['id'], MoatLook>> = {
  meadow: { deep: '#132a20', murk: '#2d4a35', ice: false },
  desert: { deep: '#0f3236', murk: '#245a52', ice: false },
  snow: { deep: '#13283a', murk: '#2a4a62', ice: true },
};

const VERT = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vUv;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vUv = textureMatrix * vec4(position, 1.0);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec3 color;
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uMurk;
uniform vec3 uSky;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uBoardHalf;
uniform float uWidth;
uniform float uIce;
uniform float uReflect;
varying vec4 vUv;
varying vec3 vWorld;
#include <fog_pars_fragment>

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  vec2 p = vWorld.xz;
  float t = uTime;
  // Distance across the moat: 0 at the castle island, uWidth at the outer wall.
  float d = length(max(abs(p) - uBoardHalf, 0.0));
  float edge = min(d, uWidth - d);

  // Small ripples: a few drifting sine trains plus noise, as a normal.
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 7.0 + t * 1.7) * 0.5;
  g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 9.5 - t * 1.3) * 0.35;
  g += vec2(0.2, -0.98) * cos(dot(p, vec2(0.2, -0.98)) * 13.0 + t * 2.1) * 0.22;
  float nA = vnoise(p * 3.0 + t * 0.25), nB = vnoise(p * 3.0 + vec2(5.2, 1.3) - t * 0.2);
  g += (vec2(nA, nB) - 0.5) * 0.8;
  vec3 n = normalize(vec3(g.x * 0.05, 1.0, g.y * 0.05));

  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = max(dot(n, V), 0.0);
  float fres = 0.06 + 0.94 * pow(1.0 - ndv, 4.0);

  // Mirror image, wobbled by the ripples.
  vec4 uv = vUv;
  uv.xy += n.xz * 0.9 * uv.w * 0.06;
  vec3 refl = mix(uSky, texture2DProj(tDiffuse, uv).rgb, uReflect);

  // Murky body: darker in the middle, a touch of suspended silt nearer the stone.
  vec3 body = mix(uMurk, uDeep, smoothstep(0.0, uWidth * 0.45, edge));
  body *= 0.85 + 0.25 * vnoise(p * 0.7 + t * 0.03);
  vec3 col = mix(body, refl * 0.9, clamp(0.16 + fres * 0.8, 0.0, 0.88));

  // Sun glints.
  vec3 H = normalize(uSunDir + V);
  float nh = max(dot(n, H), 0.0);
  col += uSunColor * (pow(nh, 300.0) * 2.5 + pow(nh, 40.0) * 0.06);

  // Lapping against the stone: a thin, breathing bright line and a darker wet shadow just off it.
  float lapW = 0.035 + 0.02 * sin(t * 1.8 + p.x * 2.3 + p.y * 1.7);
  float lap = 1.0 - smoothstep(0.0, lapW, edge);
  col = mix(col, vec3(0.86, 0.92, 0.9), lap * 0.55);
  col *= 1.0 - 0.25 * (smoothstep(0.0, 0.05, edge) - smoothstep(0.05, 0.22, edge));

  // Frost: ice creeping out from the walls, cracked and frosted.
  if (uIce > 0.5) {
    float reach = 0.32 + vnoise(p * 1.3) * 0.35;
    float ice = 1.0 - smoothstep(reach - 0.04, reach, edge);
    float cracks = smoothstep(0.92, 1.0, 1.0 - abs(vnoise(p * 6.0) - 0.5) * 2.0);
    vec3 iceCol = mix(vec3(0.78, 0.88, 0.95), vec3(0.93, 0.97, 1.0), vnoise(p * 9.0)) * (0.9 + 0.2 * max(dot(vec3(0, 1, 0), uSunDir), 0.0));
    iceCol = mix(iceCol, vec3(0.55, 0.68, 0.8), cracks * 0.6);
    col = mix(col, iceCol, ice);
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export class Moat {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private geometry: THREE.BufferGeometry;
  private fallbackTex: THREE.DataTexture | null = null;

  static supports(theme: Theme): boolean {
    return !!LOOKS[theme.id];
  }

  /**
   * @param inner half-size of the square island the moat surrounds
   * @param width distance from the island to the outer wall (corners are rounded by the same amount)
   */
  constructor(theme: Theme, waterY: number, inner: number, boardHalf: number, width: number, reflections: boolean) {
    const look = LOOKS[theme.id]!;
    // Ring geometry in the XY plane (the Reflector's convention), rotated flat below.
    const outer = boardHalf + width;
    const shape = new THREE.Shape();
    const r = width;
    const b = boardHalf;
    shape.moveTo(-b, -outer);
    shape.lineTo(b, -outer);
    shape.absarc(b, -b, r, -Math.PI / 2, 0, false);
    shape.lineTo(outer, b);
    shape.absarc(b, b, r, 0, Math.PI / 2, false);
    shape.lineTo(-b, outer);
    shape.absarc(-b, b, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-outer, -b);
    shape.absarc(-b, -b, r, Math.PI, Math.PI * 1.5, false);
    const hole = new THREE.Path();
    hole.moveTo(-inner, -inner);
    hole.lineTo(-inner, inner);
    hole.lineTo(inner, inner);
    hole.lineTo(inner, -inner);
    hole.lineTo(-inner, -inner);
    shape.holes.push(hole);
    this.geometry = new THREE.ShapeGeometry(shape, 16);

    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      tDiffuse: { value: null },
      color: { value: new THREE.Color('#ffffff') },
      textureMatrix: { value: new THREE.Matrix4() },
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(look.deep) },
      uMurk: { value: new THREE.Color(look.murk) },
      uSky: { value: new THREE.Color(theme.sky).lerp(new THREE.Color(theme.fog), 0.4).multiplyScalar(0.85) },
      uSunDir: { value: new THREE.Vector3(-6, 12, 7).normalize() },
      uSunColor: { value: new THREE.Color(theme.sun) },
      uBoardHalf: { value: boardHalf },
      uWidth: { value: width },
      uIce: { value: look.ice ? 1 : 0 },
      uReflect: { value: reflections ? 1 : 0 },
    }]);
    const shader = { name: 'MoatShader', uniforms, vertexShader: VERT, fragmentShader: FRAG };

    if (reflections) {
      const scale = Math.min(1, 900 / Math.max(window.innerWidth, window.innerHeight));
      const mirror = new Reflector(this.geometry, {
        shader,
        textureWidth: Math.round(window.innerWidth * scale),
        textureHeight: Math.round(window.innerHeight * scale),
        clipBias: 0.003,
        multisample: 0,
      });
      this.mesh = mirror;
      this.material = mirror.material as THREE.ShaderMaterial;
    } else {
      this.fallbackTex = new THREE.DataTexture(new Uint8Array([128, 160, 190, 255]), 1, 1);
      this.fallbackTex.needsUpdate = true;
      uniforms.tDiffuse.value = this.fallbackTex;
      this.material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });
      this.mesh = new THREE.Mesh(this.geometry, this.material);
    }
    this.material.fog = true;
    this.material.needsUpdate = true;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = waterY;
  }

  update(time: number): void {
    this.material.uniforms.uTime.value = time;
  }

  dispose(): void {
    (this.mesh as Partial<Reflector>).dispose?.();
    this.geometry.dispose();
    this.material.dispose();
    this.fallbackTex?.dispose();
  }
}
