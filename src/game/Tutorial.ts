// Contextual onboarding: hints that react to what the player is doing, instead of a wall of text.

import { HINTS, type HintId } from '../data/onboarding';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { TOWERS, BRANCH_TIER } from '../data/towers';
import type { Services } from './Services';
import type { Battle } from './Battle';
import type { Hud } from '../ui/Hud';

type Anchor = (() => { x: number; y: number } | null) | null;

export class Tutorial {
  private active: HintId | `enemy_${string}` | null = null;
  private activeUntil = 0;
  private flags = { built: false, upgraded: false, heroSelected: false, heroMoved: false, spotOpen: false, towerOpen: false };
  private unsub: (() => void)[] = [];
  private enemyQueue: EnemyId[] = [];

  constructor(private s: Services, private battle: Battle, private hud: Hud) {
    const ev = battle.run.events;
    this.unsub.push(ev.on('enemySpawn', (e) => {
      const key = `enemy_${e.def.id}`;
      if (e.def.id === 'grunt' || e.def.id === 'minion' || this.seen(key) || this.enemyQueue.includes(e.def.id)) return;
      this.enemyQueue.push(e.def.id);
    }));
  }

  /** True while the kingdom is brand new (first few waves of the first game). */
  private get fresh(): boolean {
    return this.s.meta.bestWave() < 3 && this.battle.run.waveIndex < 3;
  }

  private seen(id: string): boolean {
    return this.s.save.data.tutorial.hintsSeen.includes(id);
  }

  private markSeen(id: string): void {
    if (this.seen(id)) return;
    this.s.save.data.tutorial.hintsSeen.push(id);
    if (id === 'early_call') this.s.save.data.tutorial.done = true;
    this.s.save.markDirty();
  }

  private show(id: HintId | `enemy_${string}`, text: string, anchor: Anchor, placement: 'above' | 'below' | 'free' = 'above', ms = 0): void {
    if (this.active === id) return;
    this.active = id;
    this.activeUntil = ms ? performance.now() + ms : 0;
    this.s.ui.showHint(text, anchor, placement);
  }

  private done(id?: string): void {
    const cur = this.active;
    if (!cur || (id && cur !== id)) return;
    this.markSeen(cur);
    this.active = null;
    this.s.ui.clearHint();
  }

  private world(x: number, y: number, z: number): Anchor {
    return () => this.battle.view.project(x, y, z);
  }

  private bestFreeSpot(): number {
    const run = this.battle.run;
    const castle = run.map.castle;
    let best = -1;
    let bd = Infinity;
    // Recommend the free spot closest to the middle of the first path (good coverage).
    const mid = run.map.pointAt(0, run.map.paths[0].length * 0.45, { x: 0, z: 0, dx: 0, dz: 0 });
    for (const sp of run.map.buildSpots) {
      if (run.towerAt(sp.index)) continue;
      const d = (sp.x - mid.x) ** 2 + (sp.z - mid.z) ** 2 + 0.02 * ((sp.x - castle.x) ** 2 + (sp.z - castle.z) ** 2);
      if (d < bd) {
        bd = d;
        best = sp.index;
      }
    }
    return best;
  }

  // --- Callbacks from Battle -----------------------------------------------------------

  onSpotSelected(): void {
    this.flags.spotOpen = true;
    this.done('build_spot');
    this.done('more_towers');
  }

  onTowerSelected(): void {
    this.flags.towerOpen = true;
    this.done('upgrade_tap');
  }

  onBuilt(): void {
    this.flags.built = true;
    this.flags.spotOpen = false;
    this.done('build_card');
    this.done('more_towers');
    this.done('new_cannon');
    this.done('new_frost');
  }

  onLandCleared(): void {
    this.done('clear_land');
  }

  onUpgraded(): void {
    this.flags.upgraded = true;
    this.done('upgrade_btn');
    this.done('specialise');
  }

  onHeroSelected(): void {
    this.flags.heroSelected = true;
    if (this.active === 'hero_tap') {
      this.markSeen('hero_tap');
      this.active = null;
      this.show('hero_move', HINTS.hero_move, null, 'free');
    }
  }

  onHeroMoved(): void {
    this.flags.heroMoved = true;
    this.done('hero_move');
    this.done('hero_tap');
  }

  onWaveStarted(): void {
    this.done('start_wave');
    this.done('early_call');
  }

  // --- Per-frame evaluation --------------------------------------------------------------

  update(): void {
    const run = this.battle.run;
    const now = performance.now();
    if (this.active && this.activeUntil && now > this.activeUntil) this.done();
    if (this.s.ui.modalOpen || run.state === 'lost') {
      if (this.active) {
        this.s.ui.clearHint();
        this.active = null;
      }
      return;
    }
    this.s.ui.updateHint();
    if (this.active) {
      // Some hints auto-resolve when their condition no longer holds.
      if (this.active === 'build_card' && this.hud.mode !== 'build') {
        this.active = null;
        this.s.ui.clearHint();
      }
      if (this.active === 'upgrade_btn' && this.hud.mode !== 'tower') {
        this.active = null;
        this.s.ui.clearHint();
      }
      return;
    }
    const mode = this.hud.mode;
    const w = run.waveIndex;

    // A new kingdom: building and waves.
    if (this.fresh) {
      if (run.state === 'prep' && run.towers.length === 0 && mode === 'none' && !this.seen('build_spot')) {
        const sp = run.map.buildSpots[this.bestFreeSpot()];
        if (sp) return this.show('build_spot', HINTS.build_spot, this.world(sp.x, 0.2, sp.z), 'above');
      }
      if (mode === 'build' && run.towers.length === 0 && !this.seen('build_card')) {
        return this.show('build_card', HINTS.build_card, () => this.hud.rectOf('card-archer'), 'above');
      }
      if (run.state === 'prep' && run.towers.length > 0 && mode === 'none' && !this.seen('start_wave')) {
        return this.show('start_wave', HINTS.start_wave, () => this.hud.rectOf('next'), 'above');
      }
      if (run.state === 'playing' && !this.seen('path') && run.waveIndex === 1) {
        const sp = run.map.spawns[0];
        return this.show('path', HINTS.path, this.world(sp.x, 0.4, sp.z), 'below', 4500);
      }
      if (run.state === 'playing' && run.towers.length < 2 && run.gold >= TOWERS.archer.cost && mode === 'none' && !this.seen('more_towers')) {
        const sp = run.map.buildSpots[this.bestFreeSpot()];
        if (sp) return this.show('more_towers', HINTS.more_towers, this.world(sp.x, 0.2, sp.z), 'above');
      }
      if (run.towers.length >= 2 && !this.flags.upgraded && !this.seen('upgrade_btn')) {
        const t = run.towers[0];
        const cost = run.upgradeCost(t);
        if (cost !== null && run.gold >= cost) {
          if (mode === 'tower') return this.show('upgrade_btn', HINTS.upgrade_btn, () => this.hud.rectOf('upgrade'), 'above');
          if (mode === 'none' && !this.seen('upgrade_tap')) return this.show('upgrade_tap', HINTS.upgrade_tap, this.world(t.x, 1.2, t.z), 'above');
        }
      }
      if (run.state === 'playing' && run.waveIndex >= 2 && run.nextWaveTimer > 3 && !this.seen('early_call')) {
        return this.show('early_call', HINTS.early_call, () => this.hud.rectOf('next'), 'above', 6000);
      }
    }

    // After the first wave: the hero.
    if (w >= 1 && run.hero && !run.hero.dead) {
      if (!this.seen('hero_tap') && !this.flags.heroSelected && mode === 'none') {
        const h = run.hero;
        return this.show('hero_tap', HINTS.hero_tap, () => this.battle.view.project(h.x, h.y + 0.6, h.z), 'above');
      }
      if (run.state === 'playing' && run.heroAbilityReady() && !this.seen('hero_ability') && run.aliveCount() >= 3) {
        return this.show('hero_ability', HINTS.hero_ability, () => this.hud.rectOf('ability'), 'above', 7000);
      }
    }
    if (mode === 'build') {
      if (run.isTowerAvailable('cannon') && !this.seen('new_cannon')) return this.show('new_cannon', HINTS.new_cannon, null, 'free', 6000);
      if (run.isTowerAvailable('frost') && !this.seen('new_frost')) return this.show('new_frost', HINTS.new_frost, null, 'free', 6000);
    }
    if (mode === 'tower' && !this.seen('materials') && run.towers.some((t) => t.tier === 2)) {
      return this.show('materials', HINTS.materials, null, 'free', 7000);
    }
    if (mode === 'tower' && !this.seen('specialise') && run.towers.some((t) => t.tier === BRANCH_TIER)) {
      const anchor = this.hud.rectOf('upgrade');
      if (anchor) return this.show('specialise', HINTS.specialise, () => this.hud.rectOf('upgrade'), 'above', 7000);
    }
    if (w >= 3 && run.state === 'playing' && !this.seen('speed') && this.battle.speed === 1) {
      return this.show('speed', HINTS.speed, () => this.hud.rectOf('speed'), 'above', 4000);
    }
    if (w >= 6 && w < 10 && run.state === 'playing' && !this.seen('checkpoint')) {
      return this.show('checkpoint', HINTS.checkpoint, null, 'free', 7000);
    }
    // No free pads left: point at the cheapest overgrown land next to a road.
    if (mode === 'none' && !this.seen('clear_land') && run.gold >= run.clearLandCost() && run.towers.length >= 3) {
      const free = run.map.buildSpots.some((sp) => run.isSpotUnlocked(sp.index) && !run.towerAt(sp.index));
      if (!free) {
        const locked = run.map.buildSpots.filter((sp) => !run.isSpotUnlocked(sp.index))
          .sort((a, b) => run.map.spotCoverage(b, 0) - run.map.spotCoverage(a, 0))[0];
        if (locked) return this.show('clear_land', HINTS.clear_land, this.world(locked.x, 0.3, locked.z), 'above', 9000);
      }
    }

    // New enemy introductions (any level).
    const next = this.enemyQueue.shift();
    if (next) {
      const e = run.enemies.find((x) => x.alive && x.def.id === next);
      const key = `enemy_${next}` as const;
      if (e && !this.seen(key)) {
        const def = ENEMIES[next];
        return this.show(key, `<b>${def.name}</b>: ${def.description}`, () => this.battle.view.project(e.x, e.y + 0.9, e.z), 'above', 4500);
      }
    }
  }

  dispose(): void {
    this.unsub.forEach((u) => u());
    this.s.ui.clearHint();
    this.s.save.flush();
  }
}
