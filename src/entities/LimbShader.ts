// Walk cycles for instanced enemies, done in the vertex shader so every enemy on the road animates
// at no CPU cost. Each model's legs, arms, wings, wheels and tails are tagged when it is built
// (ModelBuilder.limb): `limbA` = (kind, side, phase offset, amplitude), `limbP` = the pivot.
// Per instance, `walk` = (stride phase in radians, how much it is walking 0..1).

import * as THREE from 'three';

const HEADER = /* glsl */ `
attribute vec4 limbA;
attribute vec3 limbP;
attribute vec2 walk;
mat3 limbRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 limbRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 limbRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
mat3 limbRot() {
  float kind = limbA.x;
  float ph = walk.x + limbA.z;
  float amp = walk.y * limbA.w;
  if (kind < 1.5) return limbRotX(sin(ph) * amp * 0.55);              // leg: step from the hip
  if (kind < 2.5) return limbRotX(sin(ph) * amp * 0.45);              // arm: swing from the shoulder
  if (kind < 3.5) return limbRotZ(limbA.y * sin(ph) * 0.6 * limbA.w); // wing: flap
  if (kind < 4.5) return limbRotX(walk.x * 1.6 * limbA.w);            // wheel: roll
  if (kind < 5.5) return limbRotY(sin(ph * 0.5 + 1.0) * 0.35 * amp);  // tail: swish
  return limbRotY(sin(ph) * amp * 0.45 * limbA.y);                    // sweep: scuttle
}
`;

/** A copy of `base` whose tagged parts move with each instance's `walk` attribute. */
export function limbMaterial(base: THREE.Material): THREE.Material {
  const m = base.clone();
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${HEADER}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n  if (limbA.x > 0.5) transformed = limbRot() * (transformed - limbP) + limbP;`);
  };
  m.customProgramCacheKey = () => 'limb-walk';
  return m;
}

/** Stride length (world units at scale 1): how far a step carries an enemy. */
export const STRIDE = 0.42;
/** Wing beats per second for flyers, in radians of phase. */
export const FLAP_RATE = 15;
