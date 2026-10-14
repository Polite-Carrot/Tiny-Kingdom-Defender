// Animates a rigged hero (body, legs, arms, wings): idle breathing, a walk cycle, per-hero attack
// moves, ability poses, a death fall and a respawn pop. Purely presentational: it reads the hero
// state from the Run and the events BattleView forwards to it.

import * as THREE from 'three';
import { heroRig, heroWingModel, type HeroPart } from '../entities/Models';
import type { HeroId } from '../data/heroes';
import type { Hero } from './Run';

const SCALE = 1.3;

/** 0→1→0 bump over [a, b] of t. */
const bump = (t: number, a: number, b: number) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));
/** Smoothstep. */
const ss = (a: number, b: number, t: number) => {
  const k = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const easeOutBack = (k: number) => 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);

interface Pose {
  armL: [number, number]; // rotation x (raise forward when negative), rotation z (out to the side)
  armR: [number, number];
  legL: number;
  legR: number;
  /** Body: lift, lean (x), twist (y), squash. */
  lift: number;
  lean: number;
  twist: number;
  squash: number;
  /** Forward lunge (local z). */
  lunge: number;
}

/** Attack lengths per hero (seconds). */
const ATTACK_TIME: Record<HeroId, number> = { ranger: 0.45, knight: 0.5, mage: 0.55, dwarf: 0.6, valkyrie: 0.45, ninja: 0.3 };
const ABILITY_TIME = 0.9;

export class HeroAnimator {
  /** Positioned and turned to face the hero's heading. */
  readonly root = new THREE.Group();
  /** Bob, lean, jump and squash happen here. */
  private pose = new THREE.Group();
  private parts = new Map<HeroPart, THREE.Object3D>();
  private wings: THREE.Object3D[] = [];
  private facing = 0;
  private walkPhase = 0;
  private walkBlend = 0;
  private attackT = -1;
  private abilityT = -1;
  private deathT = -1;
  private respawnT = -1;
  private stepTimer = 0;
  private readonly flying: boolean;

  constructor(private id: HeroId, material: THREE.Material, private onStep: (x: number, z: number) => void = () => {}, gear = 0) {
    this.flying = id === 'valkyrie';
    this.root.add(this.pose);
    for (const p of heroRig(id, gear).parts) {
      const mesh = new THREE.Mesh(p.geo, material);
      mesh.castShadow = true;
      mesh.position.copy(p.pivot);
      this.pose.add(mesh);
      this.parts.set(p.name, mesh);
    }
    if (this.flying) {
      for (const side of [1, -1]) {
        const pivot = new THREE.Object3D();
        pivot.position.set(side * 0.06, 0.36, -0.12);
        pivot.rotation.y = side > 0 ? -0.35 : Math.PI + 0.35;
        const wing = new THREE.Mesh(heroWingModel(), material);
        wing.castShadow = true;
        pivot.add(wing);
        this.pose.add(pivot);
        this.wings.push(wing);
      }
    }
    this.root.scale.setScalar(SCALE);
  }

  attack(): void {
    this.attackT = 0;
  }

  ability(): void {
    this.abilityT = 0;
    this.attackT = -1;
  }

  die(): void {
    this.deathT = 0;
    this.attackT = this.abilityT = -1;
  }

  respawn(): void {
    this.deathT = -1;
    this.respawnT = 0;
  }

  /** Returns false when nothing should be drawn (dead and the fall has finished). */
  update(dt: number, time: number, h: Hero): boolean {
    // Smooth turning, taking the short way round.
    let d = h.facing - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * Math.min(1, dt * 14);
    this.root.position.set(h.x, 0, h.z);
    this.root.rotation.y = this.facing;

    if (h.dead && this.deathT < 0) this.deathT = 1; // came in already dead (e.g. after a reload)
    if (this.deathT >= 0) return this.updateDeath(dt);

    const moving = h.moving && !h.dead;
    this.walkBlend += ((moving ? 1 : 0) - this.walkBlend) * Math.min(1, dt * 10);
    this.walkPhase += dt * (moving ? h.def.speed * 4.2 : 0);
    const ph = this.walkPhase;
    const wb = this.walkBlend;

    // Base pose: idle breathing plus the walk (or hover) cycle.
    const breathe = Math.sin(time * 2.2);
    const swing = Math.sin(ph);
    const p: Pose = {
      armL: [breathe * 0.04 - swing * 0.55 * wb, -0.06 - breathe * 0.02],
      armR: [-breathe * 0.04 + swing * 0.35 * wb, 0.06 + breathe * 0.02],
      legL: swing * 0.7 * wb,
      legR: -swing * 0.7 * wb,
      lift: Math.abs(Math.cos(ph)) * 0.035 * wb,
      lean: 0.14 * wb,
      twist: swing * 0.08 * wb,
      squash: 1 + breathe * 0.015,
      lunge: 0,
    };
    if (this.flying) {
      // Hover with dangling legs; wings beat faster when moving.
      p.lift = 0.26 + Math.sin(time * 2.6) * 0.05;
      p.legL = 0.25 + Math.sin(time * 2) * 0.12;
      p.legR = 0.2 + Math.sin(time * 2 + 1) * 0.12;
      p.lean = 0.22 * wb;
    }
    if (this.id === 'mage') p.twist *= 0.4;

    // Footstep dust.
    if (moving && !this.flying) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = Math.PI / (h.def.speed * 4.2);
        this.onStep(h.x, h.z);
      }
    }

    if (this.attackT >= 0) {
      const dur = ATTACK_TIME[this.id];
      this.attackT += dt / dur;
      if (this.attackT >= 1) this.attackT = -1;
      else this.applyAttack(p, this.attackT);
    }
    if (this.abilityT >= 0) {
      this.abilityT += dt / ABILITY_TIME;
      if (this.abilityT >= 1) this.abilityT = -1;
      else this.applyAbility(p, this.abilityT, time);
    }

    // Respawn: pop in with an overshoot.
    let scale = 1;
    if (this.respawnT >= 0) {
      this.respawnT += dt / 0.5;
      if (this.respawnT >= 1) this.respawnT = -1;
      else scale = Math.max(0.01, easeOutBack(this.respawnT));
    }

    this.applyPose(p, scale);
    const flap = Math.sin(time * (moving ? 11 : 5));
    for (const w of this.wings) w.rotation.set(-0.8, 0.2 + flap * 0.45, 0, 'YXZ');
    return true;
  }

  private applyAttack(p: Pose, t: number): void {
    switch (this.id) {
      case 'knight': {
        // Wind up overhead, then a diagonal slash.
        const up = ss(0, 0.35, t) * (1 - ss(0.35, 0.55, t));
        const down = ss(0.35, 0.55, t) * (1 - ss(0.7, 1, t));
        p.armR = [-2.5 * up + 0.5 * down, 0.3 * up - 0.2 * down];
        p.armL = [-0.5 * (up + down), -0.2];
        p.twist = -0.35 * up + 0.4 * down;
        p.lunge = 0.08 * down;
        p.lean += 0.15 * down;
        break;
      }
      case 'dwarf': {
        // Heave the hammer high, then smash it down with a squash.
        const up = ss(0, 0.45, t) * (1 - ss(0.45, 0.6, t));
        const down = ss(0.45, 0.6, t) * (1 - ss(0.8, 1, t));
        p.armR = [-3.0 * up + 0.7 * down, 0.15];
        p.armL = [-2.6 * up + 0.5 * down, -0.15];
        p.lean += -0.2 * up + 0.3 * down;
        p.squash *= 1 - 0.12 * bump(t, 0.55, 0.8);
        p.lift += 0.05 * up;
        break;
      }
      case 'ninja': {
        // Two lightning-quick slashes with a dash.
        const a = bump(t, 0, 0.5);
        const b = bump(t, 0.45, 1);
        p.armR = [-1.6 * a + 0.4 * b - 1.2 * b, 1.1 * a - 0.9 * b];
        p.armL = [-0.6 * (a + b), -0.6 * a];
        p.twist = 0.6 * a - 0.6 * b;
        p.lunge = 0.14 * Math.max(a, b);
        p.lean += 0.25 * Math.max(a, b);
        break;
      }
      case 'ranger': {
        // Raise the bow, draw the string back, loose with a little recoil.
        const aim = bump(t, 0, 1.05);
        const draw = ss(0.1, 0.55, t) * (1 - ss(0.6, 0.7, t));
        p.armL = [-1.5 * aim, 0.15 * aim];
        p.armR = [-1.35 * aim, -0.5 * draw - 0.1];
        p.twist = -0.25 * aim;
        p.lunge = -0.04 * bump(t, 0.6, 0.85);
        break;
      }
      case 'mage': {
        // Thrust the staff forward as the bolt flies, off hand casting.
        const k = bump(t, 0, 1);
        p.armR = [-1.4 * k, 0.1];
        p.armL = [-1.1 * k, -0.4 * k];
        p.lift += 0.04 * k;
        p.lean -= 0.1 * k;
        break;
      }
      case 'valkyrie': {
        // Spear raised back, then hurled forward.
        const back = ss(0, 0.4, t) * (1 - ss(0.4, 0.55, t));
        const throwK = ss(0.4, 0.55, t) * (1 - ss(0.7, 1, t));
        p.armR = [-2.6 * back - 1.4 * throwK, 0.25 * back];
        p.armL = [-0.8 * (back + throwK), -0.5];
        p.twist = -0.35 * back + 0.3 * throwK;
        p.lunge = 0.06 * throwK;
        break;
      }
    }
  }

  private applyAbility(p: Pose, t: number, time: number): void {
    const k = bump(t, 0, 1);
    switch (this.id) {
      case 'knight': // Taunt: shield and sword raised with a stomp.
        p.armR = [-2.9 * k, 0.4 * k];
        p.armL = [-2.4 * k, -0.4 * k];
        p.lift += 0.18 * bump(t, 0, 0.5);
        p.squash *= 1 - 0.15 * bump(t, 0.45, 0.7);
        break;
      case 'dwarf': // Earthquake: leap, then slam the ground.
        p.lift += 0.35 * bump(t, 0, 0.55);
        p.armR = [-3.1 * (1 - ss(0.45, 0.6, t)) * k + 0.8 * ss(0.5, 0.6, t) * k, 0];
        p.armL = [-2.8 * (1 - ss(0.45, 0.6, t)) * k + 0.6 * ss(0.5, 0.6, t) * k, 0];
        p.squash *= 1 - 0.2 * bump(t, 0.55, 0.8);
        p.lean += 0.35 * bump(t, 0.5, 0.9);
        break;
      case 'valkyrie': // Holy Light: rise with arms spread to the sky.
        p.lift += 0.3 * k;
        p.armR = [-2.4 * k, 1.0 * k];
        p.armL = [-2.4 * k, -1.0 * k];
        p.lean = -0.25 * k;
        break;
      case 'mage': // Meteor: staff thrust to the heavens.
        p.armR = [-3.0 * k, 0.2];
        p.armL = [-2.6 * k, -0.6 * k];
        p.lift += 0.12 * k;
        p.lean = -0.2 * k;
        break;
      case 'ranger': // Arrow Storm: aim high into the sky.
        p.armL = [-2.7 * k, 0.1];
        p.armR = [-2.5 * k, -0.4 * k];
        p.lean = -0.3 * k;
        break;
      case 'ninja': // Shadow Strike: a full spin with blade out.
        p.twist = ss(0, 0.6, t) * Math.PI * 2;
        p.armR = [-1.6 * k, 1.3 * k];
        p.lift += 0.1 * k;
        void time;
        break;
    }
  }

  private applyPose(p: Pose, scale: number): void {
    const set = (name: HeroPart, rx: number, rz = 0) => {
      const o = this.parts.get(name);
      if (o) o.rotation.set(rx, 0, rz);
    };
    set('armL', p.armL[0], p.armL[1]);
    set('armR', p.armR[0], p.armR[1]);
    set('legL', p.legL);
    set('legR', p.legR);
    this.pose.position.set(0, p.lift, p.lunge);
    this.pose.rotation.set(p.lean, p.twist, 0, 'YXZ');
    this.pose.scale.set(1 / Math.sqrt(p.squash), p.squash, 1 / Math.sqrt(p.squash));
    this.root.scale.setScalar(SCALE * scale);
  }

  private updateDeath(dt: number): boolean {
    this.deathT = Math.min(1, this.deathT + dt / 0.9);
    const t = this.deathT;
    // Stagger, topple backwards, then shrink away.
    const fall = ss(0.1, 0.55, t);
    this.parts.get('armL')?.rotation.set(-1.2 * fall, 0, -0.6 * fall);
    this.parts.get('armR')?.rotation.set(-1.2 * fall, 0, 0.6 * fall);
    this.parts.get('legL')?.rotation.set(-0.4 * fall, 0, 0);
    this.parts.get('legR')?.rotation.set(-0.2 * fall, 0, 0);
    this.pose.rotation.set(-1.45 * fall, 0, 0.1 * bump(t, 0, 0.2), 'YXZ');
    this.pose.position.set(0, (this.flying ? 0.26 : 0) * (1 - fall) + 0.04 * bump(t, 0, 0.25), -0.15 * fall);
    this.pose.scale.set(1, 1, 1);
    const shrink = 1 - ss(0.7, 1, t);
    this.root.scale.setScalar(SCALE * Math.max(0.001, shrink));
    return t < 1;
  }
}
