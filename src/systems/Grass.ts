// Instanced grass blades that sway in the wind. One draw call for thousands of blades: each
// instance has its own position, size, yaw and tint; the wind is a vertex-shader offset that
// grows towards the blade tip.

import * as THREE from 'three';

export interface BladeSpot {
  x: number;
  y: number;
  z: number;
  /** Height multiplier. */
  h: number;
  color: THREE.Color;
}

/** A tapered blade (two triangles), darker at the root. */
function bladeGeometry(): THREE.BufferGeometry {
  const w = 0.035;
  const h = 0.22;
  const front = [
    -w, 0, 0, w, 0, 0, w * 0.45, h * 0.55, 0.01,
    -w, 0, 0, w * 0.45, h * 0.55, 0.01, -w * 0.45, h * 0.55, 0.01,
    -w * 0.45, h * 0.55, 0.01, w * 0.45, h * 0.55, 0.01, 0, h, 0.03,
  ];
  // Both faces as real triangles (reversed winding for the back) so they light the same.
  const back: number[] = [];
  for (let i = 0; i < front.length; i += 9) back.push(...front.slice(i, i + 3), ...front.slice(i + 6, i + 9), ...front.slice(i + 3, i + 6));
  const pos = new Float32Array([...front, ...back]);
  const col = new Float32Array(pos.length);
  for (let i = 0; i < pos.length / 3; i++) {
    const k = 0.72 + (pos[i * 3 + 1] / h) * 0.45;
    col.set([k, k, k], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Light blades as if they faced up, so they don't flicker dark when seen edge-on.
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

export class Grass {
  readonly mesh: THREE.InstancedMesh;
  private material: THREE.MeshLambertMaterial;
  private uniforms = { uTime: { value: 0 }, uWind: { value: 1 } };

  constructor(spots: BladeSpot[], wind = 1) {
    const geo = bladeGeometry();
    this.uniforms.uWind.value = wind;
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.uniforms.uWind = this.uniforms.uWind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            vec3 root = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            float bend = position.y * position.y * 18.0;
            // Gusts roll across the field, plus a little flutter per blade.
            float gust = sin(root.x * 0.35 + root.z * 0.22 + uTime * 1.6) * 0.5 + 0.5;
            float flutter = sin(uTime * 4.0 + root.x * 3.1 + root.z * 2.3) * 0.25;
            vec3 windW = vec3(0.8, 0.0, 0.45) * (gust * 0.9 + flutter) * uWind * bend * 0.08;
            // Apply the world-space wind in the blade's local frame.
            transformed += (transpose(mat3(instanceMatrix)) * windW);
          }`,
        );
    };
    this.material.customProgramCacheKey = () => 'grass-wind';
    this.mesh = new THREE.InstancedMesh(geo, this.material, Math.max(1, spots.length));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    spots.forEach((b, i) => {
      const r = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
      e.set((r - 0.5) * 0.35, r * Math.PI * 2, (r - 0.5) * 0.25);
      q.setFromEuler(e);
      s.set(1, b.h, 1);
      p.set(b.x, b.y, b.z);
      m.compose(p, q, s);
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, b.color);
    });
    this.mesh.count = spots.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  update(time: number): void {
    this.uniforms.uTime.value = time;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
