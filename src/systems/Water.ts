// The sea around the island: a dense grid displaced on the GPU by Gerstner waves, shaded with
// depth tint, sun glint, a sky reflection at grazing angles, white caps and surf that rolls in
// towards the shore. The Age of Fire swaps it for slow, crusting lava; the Age of Frost adds
// drifting ice floes. Depth comes from a small baked texture of the terrain height.

import * as THREE from 'three';
import type { Theme } from '../data/themes';

interface SeaLook {
  deep: string;
  shallow: string;
  foam: string;
  /** Wave height multiplier. */
  amp: number;
  ice: boolean;
  lava: boolean;
}

const SEA: Record<Theme['id'], SeaLook> = {
  meadow: { deep: '#14608c', shallow: '#3fc6c8', foam: '#f4fbff', amp: 1, ice: false, lava: false },
  desert: { deep: '#0e6680', shallow: '#3ddbc8', foam: '#fbfff8', amp: 0.75, ice: false, lava: false },
  snow: { deep: '#24557a', shallow: '#86c9df', foam: '#ffffff', amp: 0.45, ice: true, lava: false },
  volcano: { deep: '#3a0e08', shallow: '#ff5a14', foam: '#ffd36a', amp: 0.22, ice: false, lava: true },
};

/** Ground heights are stored as 8-bit values over this range. */
const H_MIN = -6;
const H_RANGE = 8;

const VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform sampler2D uGround;
uniform float uGroundSize;
uniform float uWaterY;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vLocal;
varying float vWave;
varying float vSurfY;
#include <fog_pars_vertex>

float groundH(vec2 p) {
  float h = texture2D(uGround, p / uGroundSize + 0.5).r * ${H_RANGE.toFixed(1)} + ${H_MIN.toFixed(1)};
  float outside = smoothstep(uGroundSize * 0.44, uGroundSize * 0.5, max(abs(p.x), abs(p.y)));
  return mix(h, ${H_MIN.toFixed(1)}, outside);
}

void gerstner(vec2 dir, float len, float steep, vec2 p, inout vec3 pos, inout vec3 tang, inout vec3 bin) {
  float k = 6.28318 / len;
  float c = sqrt(9.8 / k) * 0.6;
  vec2 d = normalize(dir);
  float f = k * (dot(d, p) - c * uTime);
  float a = steep / k;
  float sf = sin(f), cf = cos(f);
  tang += vec3(-d.x * d.x * steep * sf, d.x * steep * cf, -d.x * d.y * steep * sf);
  bin += vec3(-d.x * d.y * steep * sf, d.y * steep * cf, -d.y * d.y * steep * sf);
  pos += vec3(d.x * a * cf, a * sf, d.y * a * cf);
}

void main() {
  vec2 p = position.xz;
  // Waves die down in the shallows so they never climb the beach or the moat walls.
  float s = uAmp * smoothstep(0.1, 2.2, uWaterY - groundH(p));
  vec3 pos = position;
  vec3 tang = vec3(1.0, 0.0, 0.0);
  vec3 bin = vec3(0.0, 0.0, 1.0);
  gerstner(vec2(1.0, 0.55), 10.0, 0.20 * s, p, pos, tang, bin);
  gerstner(vec2(-0.35, 1.0), 6.3, 0.17 * s, p, pos, tang, bin);
  gerstner(vec2(0.75, -0.65), 4.1, 0.13 * s, p, pos, tang, bin);
  vWave = (pos.y - position.y) / max(0.001, 0.75 * s);
  vSurfY = pos.y;
  vLocal = pos.xz;
  vNormalW = normalize(mat3(modelMatrix) * normalize(cross(bin, tang)));
  vec4 world = modelMatrix * vec4(pos, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec3 uSky;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uWaterY;
uniform float uIce;
uniform float uLava;
uniform float uBoardHalf;
uniform sampler2D uGround;
uniform float uGroundSize;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vLocal;
varying float vWave;
varying float vSurfY;
#include <fog_pars_fragment>

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.03 + 7.1) * 0.3 + vnoise(p * 4.1 + 3.7) * 0.15; }

float groundH(vec2 p) {
  float h = texture2D(uGround, p / uGroundSize + 0.5).r * ${H_RANGE.toFixed(1)} + ${H_MIN.toFixed(1)};
  float outside = smoothstep(uGroundSize * 0.44, uGroundSize * 0.5, max(abs(p.x), abs(p.y)));
  return mix(h, ${H_MIN.toFixed(1)}, outside);
}

void main() {
  vec2 p = vLocal;
  float t = uTime;
  float depth = (uWaterY + vSurfY) - groundH(p);
  if (depth < -0.05) discard;
  vec3 V = normalize(cameraPosition - vWorld);
  // 0 in the moat right around the board, 1 out at the coast.
  float coastal = smoothstep(2.5, 6.0, length(max(abs(p) - uBoardHalf, 0.0)));

  if (uLava > 0.5) {
    // Lava: slow flowing noise with a dark crust that cracks open, brightest at the shore.
    vec2 q = p * 0.22 + vec2(t * 0.03, t * 0.017);
    float flow = fbm(q + fbm(q * 1.7 - t * 0.05) * 1.6);
    float crust = smoothstep(0.42, 0.62, flow);
    float shore = 1.0 - smoothstep(0.0, mix(0.3, 0.9, coastal), depth);
    vec3 hot = mix(uShallow, uFoam, smoothstep(0.25, 0.0, abs(flow - 0.42)) * 0.9);
    vec3 col = mix(hot * 1.6, uDeep, crust * (1.0 - shore * 0.8));
    col += uFoam * shore * (0.45 + 0.3 * sin(t * 2.0 + p.x * 0.7));
    float spec = pow(max(dot(vNormalW, normalize(uSunDir + V)), 0.0), 40.0) * crust * 0.25;
    gl_FragColor = vec4(col + spec, 1.0);
  } else {
    // Small ripples on top of the big waves, as a normal perturbation.
    vec3 n = vNormalW;
    float a1 = dot(p, vec2(0.83, 0.55)) * 2.4 + t * 2.1;
    float a2 = dot(p, vec2(-0.6, 0.8)) * 3.3 + t * 2.7;
    float a3 = dot(p, vec2(0.2, -0.98)) * 5.1 + t * 3.4;
    n.x += cos(a1) * 0.06 * 0.83 + cos(a2) * 0.045 * -0.6 + cos(a3) * 0.03 * 0.2;
    n.z += cos(a1) * 0.06 * 0.55 + cos(a2) * 0.045 * 0.8 + cos(a3) * 0.03 * -0.98;
    n = normalize(n);

    float deepK = smoothstep(0.0, 3.2, depth);
    vec3 water = mix(uShallow, uDeep, deepK);
    float diff = max(dot(n, uSunDir), 0.0);
    water *= 0.72 + 0.38 * diff;
    // Light through the thin top of a wave.
    water += uShallow * smoothstep(0.2, 1.0, vWave) * 0.22 * deepK;

    float ndv = max(dot(n, V), 0.0);
    float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    water = mix(water, uSky, clamp(fres * 0.85, 0.0, 0.7));

    vec3 H = normalize(uSunDir + V);
    float nh = max(dot(n, H), 0.0);
    vec3 spec = uSunColor * (pow(nh, 220.0) * 3.0 + pow(nh, 28.0) * 0.12);

    // Foam: a line hugging the shore, surf bands rolling in, and white caps on the crests.
    float br = fbm(p * 1.3 + vec2(t * 0.25, -t * 0.2));
    float edge = 1.0 - smoothstep(0.0, 0.07 + br * 0.08, depth);
    float band = sin(depth * 16.0 - t * 2.3 + br * 4.0);
    float surf = smoothstep(0.75, 0.97, band) * (1.0 - smoothstep(0.08, 0.6, depth)) * smoothstep(0.4, 0.65, br + 0.1) * coastal;
    float caps = smoothstep(0.62, 0.95, vWave) * smoothstep(0.45, 0.75, fbm(p * 0.9 - t * 0.3)) * deepK;
    float foam = clamp(max(edge, surf * 0.85) + caps * 0.75, 0.0, 1.0);

    // Frozen sea: drifting ice floes.
    if (uIce > 0.5) {
      float floe = smoothstep(0.6, 0.63, fbm(p * 0.16 + vec2(t * 0.008, 0.0))) * smoothstep(0.6, 1.4, depth);
      water = mix(water, vec3(0.86, 0.93, 0.98) * (0.85 + 0.2 * diff), floe);
      spec *= 1.0 - floe;
    }

    vec3 col = mix(water, uFoam * (0.85 + 0.2 * diff), foam) + spec * (1.0 - foam);
    // Shallow water is clear enough to see the sand beneath.
    float alpha = mix(0.45, 1.0, smoothstep(0.0, 1.8, depth));
    alpha = max(alpha, foam);
    gl_FragColor = vec4(col, alpha);
  }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export class Water {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private groundTex: THREE.DataTexture;
  private geometry: THREE.BufferGeometry;

  /**
   * @param boardHalf half-size of the board footprint (the moat runs round it)
   * @param heightAt terrain height (scenery-local) used to bake the depth map
   * @param groundSize side of the square the depth map covers
   * @param segments grid resolution; vertices are packed densest around the board
   */
  constructor(theme: Theme, waterY: number, boardHalf: number, heightAt: (x: number, z: number) => number, groundSize: number, segments: number) {
    const look = SEA[theme.id];

    // Bake terrain height into a small texture.
    const N = 160;
    const data = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -groundSize / 2 + ((i + 0.5) / N) * groundSize;
        const z = -groundSize / 2 + ((j + 0.5) / N) * groundSize;
        const h = (heightAt(x, z) - H_MIN) / H_RANGE;
        data[j * N + i] = Math.round(Math.max(0, Math.min(1, h)) * 255);
      }
    }
    this.groundTex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
    this.groundTex.magFilter = this.groundTex.minFilter = THREE.LinearFilter;
    this.groundTex.wrapS = this.groundTex.wrapT = THREE.ClampToEdgeWrapping;
    this.groundTex.needsUpdate = true;

    // Grid with non-uniform spacing: about 0.4 units near the board, coarse at the horizon.
    const geo = new THREE.PlaneGeometry(2, 2, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const warp = (u: number) => 130 * (0.25 * u + 0.75 * u * u * u);
    for (let i = 0; i < pos.count; i++) {
      pos.setX(i, warp(pos.getX(i)));
      pos.setZ(i, warp(pos.getZ(i)));
    }
    geo.deleteAttribute('uv');
    geo.deleteAttribute('normal');
    geo.computeBoundingSphere();
    this.geometry = geo;

    const sun = new THREE.Vector3(-6, 12, 7).normalize();
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 },
        uAmp: { value: look.amp },
        uGroundSize: { value: groundSize },
        uWaterY: { value: waterY },
        uDeep: { value: new THREE.Color(look.deep) },
        uShallow: { value: new THREE.Color(look.shallow) },
        uFoam: { value: new THREE.Color(look.foam) },
        uSky: { value: new THREE.Color(theme.sky).lerp(new THREE.Color(theme.fog), 0.5) },
        uSunColor: { value: new THREE.Color(theme.sun) },
        uSunDir: { value: sun },
        uIce: { value: look.ice ? 1 : 0 },
        uLava: { value: look.lava ? 1 : 0 },
        uBoardHalf: { value: boardHalf },
      }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
      transparent: !look.lava,
    });
    this.material.uniforms.uGround = { value: this.groundTex };

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.y = waterY;
    this.mesh.frustumCulled = false;
    // Drawn after the opaque island so the shallows show the sand underneath.
    this.mesh.renderOrder = 1;
  }

  update(time: number): void {
    this.material.uniforms.uTime.value = time;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.groundTex.dispose();
  }
}
