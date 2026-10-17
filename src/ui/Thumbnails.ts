// Renders the procedural 3D models into small PNG portraits for the UI (wave preview, cards, shop).

import * as THREE from 'three';
import { towerModel, enemyModel, heroModel, castleModel, buildingModel } from '../entities/Models';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { TOWER_ORDER, type TowerId } from '../data/towers';
import { HERO_ORDER, type HeroId } from '../data/heroes';
import { COSMETICS } from '../data/economy';
import { BUILDINGS, type BuildingId } from '../data/kingdom';

const thumbs = new Map<string, string>();
let shotFn: ((key: string, parts: { geo: THREE.BufferGeometry; y?: number }[], yaw?: number, pitch?: number, zoom?: number) => void) | null = null;

export function thumb(key: string): string {
  return thumbs.get(key) ?? '';
}

/** Tower portraits are rendered on demand (40 tier/branch combinations). */
export function towerThumb(id: TowerId, tier = 1, branch = -1): string {
  const key = `tower-${id}-${tier}-${branch}`;
  if (!thumbs.has(key) && shotFn) {
    const m = towerModel(id, tier, branch);
    shotFn(key, [{ geo: m.base }, { geo: m.head, y: m.headY }], 0.5, 0.35, 1.1);
  }
  return thumbs.get(key) ?? '';
}
export const enemyThumb = (id: EnemyId) => thumb(`enemy-${id}`);
export const heroThumb = (id: HeroId) => thumb(`hero-${id}`);
export const buildingThumb = (id: BuildingId) => thumb(`building-${id}`);

export function renderThumbnails(): void {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#806040', 2.0));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
  sun.position.set(-2, 4, 3);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  const shot = (key: string, parts: { geo: THREE.BufferGeometry; y?: number }[], yaw = 0.6, pitch = 0.45, zoom = 1) => {
    const group = new THREE.Group();
    for (const p of parts) {
      const m = new THREE.Mesh(p.geo, mat);
      m.position.y = p.y ?? 0;
      group.add(m);
    }
    group.rotation.y = yaw;
    scene.add(group);
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(15))) * 0.92 / zoom;
    cam.position.set(center.x, center.y + Math.sin(pitch) * dist, center.z + Math.cos(pitch) * dist);
    cam.lookAt(center);
    renderer.render(scene, cam);
    thumbs.set(key, canvas.toDataURL('image/png'));
    scene.remove(group);
  };
  shotFn = shot;

  for (const id of TOWER_ORDER) towerThumb(id, 1, -1);
  for (const id of Object.keys(ENEMIES) as EnemyId[]) shot(`enemy-${id}`, [{ geo: enemyModel(id) }], 0.5, 0.25, 1.15);
  for (const id of HERO_ORDER) shot(`hero-${id}`, [{ geo: heroModel(id) }], 0.4, 0.2, 1.25);
  shot('hero-champion', [{ geo: heroModel('champion') }], 0.4, 0.2, 1.2);
  for (const b of BUILDINGS) shot(`building-${b.id}`, [{ geo: buildingModel(b.id) }], 0.7, 0.4, 1.05);
  for (const c of COSMETICS) if (c.kind === 'castle') shot(`castle-${c.id}`, [{ geo: castleModel(c.color) }], 0.6, 0.4, 1.0);
}
