// The siege session on your persistent kingdom: owns the Run (simulation), BattleView (3D),
// drives the HUD, and saves the kingdom at safe moments.

import { Run, newKingdom, type BaseSnapshot } from './Run';
import { BattleView } from './BattleView';
import { Tutorial } from './Tutorial';
import type { Services } from './Services';
import type { Hud } from '../ui/Hud';
import { TOWERS, type TowerId, type TargetMode } from '../data/towers';
import { ROADS, SIEGE } from '../data/base';
import { ageTitle, themeOf } from './Siege';

const STEP = 1 / 60;
const MAX_STEPS = 8;

export class Battle {
  readonly run: Run;
  readonly view: BattleView;
  private tutorial: Tutorial | null = null;
  speed = 1;
  paused = false;
  private acc = 0;
  private heroSelected = false;
  private startTime = performance.now();
  /** A revive offer or a retreat happened since the last checkpoint (no interstitial then). */
  segmentTrouble = false;
  /** Debug: lets the heuristic AI play this battle. */
  autoPlayer: { update(dt: number): void } | null = null;
  onCheckpoint: (wave: number, coins: number, firstTime: boolean) => void = () => {};
  onFallen: (fromWave: number, toWave: number) => void = () => {};
  onReviveOffer: () => void = () => {};
  onAgeChange: () => void = () => {};

  constructor(private s: Services, private hud: Hud, opts: { demo?: boolean } = {}) {
    const meta = s.meta;
    const snapshot: BaseSnapshot = s.save.data.base ?? newKingdom();
    this.run = new Run({
      snapshot,
      meta: meta.metaBonuses(),
      availableTowers: meta.towersAvailable(),
      reviveAvailable: !opts.demo,
    });
    const silent = { play() {} } as unknown as typeof s.audio;
    this.view = new BattleView(s.renderer, s.rig, this.run, opts.demo ? silent : s.audio, {
      floatText: (x, y, t, c) => !opts.demo && s.ui.floatText(x, y, t, c),
      coinFly: (x, y) => !opts.demo && s.ui.coinFly(x, y, this.hud.goldTarget, 1, () => {
        this.hud.bumpGold();
        s.audio.play('coin');
      }),
      castleHit: () => !opts.demo && this.hud.castleHit(),
    }, { castleColor: meta.castleColor(), trailColor: meta.trailColor() });
    if (opts.demo) return;

    if (!s.save.data.base) this.persist(true);
    this.hud.bind(this.run);
    this.bindRunEvents();
    this.tutorial = new Tutorial(s, this, hud);
    s.analytics.track('level_start', { level: 'siege', wave: this.run.waveIndex + 1, towers: this.run.towers.length, gold: this.run.gold, hero: this.run.hero?.def.id ?? 'none' });
  }

  get theme() {
    return themeOf(this.run.waveIndex);
  }

  /** Saves the kingdom. Only saves mid-wave when given the wave to resume from. */
  persist(force = false, wave?: number): void {
    if (!force && !this.run.isQuiet()) return;
    this.s.save.data.base = this.run.snapshot(wave);
    this.s.save.save();
  }

  private bindRunEvents(): void {
    const ev = this.run.events;
    const { analytics, ui, meta, audio } = this.s;
    ev.on('waveStart', ({ index }) => {
      // Resuming always restarts the wave that was in progress.
      this.persist(true, index);
      const w = this.run.waveDef(index);
      if (w?.boss) ui.banner('BOSS WAVE', `Wave ${index + 1}`, 'boss');
      else if (index % SIEGE.ageEvery !== 0 || index === 0) ui.banner(`Wave ${index + 1}`, ageTitle(index));
    });
    ev.on('waveCleared', ({ index, gold }) => {
      const before = meta.towersAvailable();
      meta.recordWaveCleared(index);
      const done = meta.addMissionProgress('wavesCleared', 1);
      const after = meta.towersAvailable();
      this.run.config.availableTowers.splice(0, this.run.config.availableTowers.length, ...after);
      for (const t of after) if (!before.includes(t)) setTimeout(() => ui.banner('New tower!', `${TOWERS[t].name} can now be built`), 900);
      if (done.length) ui.toast(`Mission complete: ${done[0]}!`, 2600);
      analytics.track('wave_complete', { level: 'siege', wave: index + 1, gold, castle_hp: this.run.castleHp });
      this.persist();
    });
    ev.on('checkpoint', ({ wave }) => {
      const r = meta.recordCheckpoint(wave);
      meta.addMissionProgress('checkpoints', 1);
      analytics.track('level_end', { level: `checkpoint_${wave}`, result: 'checkpoint', wave_reached: wave, duration: Math.round(this.run.time), castle_hp: this.run.castleHp, first_time: r.firstTime });
      this.persist();
      setTimeout(() => this.onCheckpoint(wave, r.coins, r.firstTime), 700);
    });
    ev.on('ageChange', ({ wave }) => {
      ui.banner(ageTitle(wave), 'A new Age begins');
      this.onAgeChange();
    });
    ev.on('roadOpened', ({ road }) => setTimeout(() => ui.banner('A new road opens!', `Enemies now march down the ${ROADS[road].name}`, 'boss'), 1900));
    ev.on('towerBuilt', (t) => analytics.track('tower_built', { level: 'siege', tower: t.def.id, spot: t.spot, wave: this.run.waveIndex }));
    ev.on('towerUpgraded', (t) => analytics.track('tower_upgraded', { level: 'siege', tower: t.def.id, tier: t.tier, branch: t.branch >= 0 ? t.def.branches[t.branch].id : null }));
    ev.on('heroAbility', ({ hero }) => analytics.track('hero_ability_used', { level: 'siege', hero: hero.def.id, ability: hero.def.ability.kind }));
    ev.on('reviveOffer', () => {
      this.segmentTrouble = true;
      this.hud.closeCtx();
      this.onReviveOffer();
    });
    ev.on('defeat', () => {
      this.deselect();
      audio.play('defeat');
      const from = this.run.currentWave;
      setTimeout(() => this.onFallen(from, this.run.lastCheckpoint), 1200);
    });
    ev.on('retreat', ({ fromWave, toWave }) => {
      this.segmentTrouble = true;
      meta.d.progress.retreats++;
      analytics.track('level_end', { level: 'siege', result: 'retreat', wave_reached: fromWave + 1, retreat_to: toWave + 1, duration: Math.round(this.run.time), castle_hp: 0 });
      this.persist(true);
      this.onAgeChange();
    });
    ev.on('landCleared', () => {
      meta.addMissionProgress('landCleared', 1);
      this.persist();
    });
    ev.on('towerSold', () => this.persist());
  }

  /** Called by the "castle fallen" modal: fall back to the checkpoint and save. */
  retreat(): void {
    this.run.retreat();
  }

  // --- Frame ------------------------------------------------------------------------

  update(dt: number): void {
    if (!this.paused) {
      this.acc += Math.min(dt, 0.1) * this.speed;
      let steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS * this.speed) {
        this.autoPlayer?.update(STEP);
        this.run.update(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps >= MAX_STEPS * this.speed) this.acc = 0;
    }
    this.view.update(this.paused ? 0 : dt * this.speed, this.speed);
    this.hud.update();
    this.tutorial?.update();
  }

  /** Menu backdrop: your kingdom, idle. */
  updateDemo(dt: number): void {
    this.run.update(dt);
    this.view.update(dt, 1);
  }

  // --- Input -----------------------------------------------------------------------

  handleTap(x: number, z: number): void {
    if (this.paused || this.run.state === 'lost' || this.run.state === 'reviveOffer') return;
    const run = this.run;
    let best = -1;
    let bestD = 0.6 * 0.6;
    for (const sp of run.map.buildSpots) {
      const d = (sp.x - x) ** 2 + (sp.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = sp.index;
      }
    }
    const hero = run.hero;
    const heroD = hero && !hero.dead ? (hero.x - x) ** 2 + (hero.z - z) ** 2 : Infinity;
    if (heroD < 0.5 * 0.5 && heroD <= bestD) {
      this.toggleHero();
      return;
    }
    // A selected hero moves wherever the player taps next.
    if (this.heroSelected && hero && !hero.dead) {
      run.moveHero(x, z);
      this.view.showMoveMarker(hero.tx, hero.tz);
      this.s.audio.play('select');
      this.setHeroSelected(false);
      this.view.hideRange();
      this.tutorial?.onHeroMoved();
      return;
    }
    if (best >= 0) {
      this.selectSpot(best);
      return;
    }
    this.deselect();
  }

  private selectSpot(spot: number): void {
    this.setHeroSelected(false);
    const t = this.run.towerAt(spot);
    this.view.highlightSpot(spot);
    this.s.audio.play('select');
    if (t) {
      this.hud.openTower(t);
      this.view.showRange(t.x, t.z, t.stats.range, '#ffffff');
      this.tutorial?.onTowerSelected();
    } else if (!this.run.isSpotUnlocked(spot)) {
      this.hud.openLand(spot);
      this.view.hideRange();
    } else {
      this.hud.openBuild(spot);
      this.view.hideRange();
      this.tutorial?.onSpotSelected();
    }
  }

  deselect(): void {
    this.hud.closeCtx();
    this.view.highlightSpot(-1);
    this.view.hideRange();
    this.setHeroSelected(false);
  }

  private setHeroSelected(on: boolean): void {
    this.heroSelected = on;
    this.view.heroSelected = on;
    this.hud.setHeroSelected(on);
  }

  toggleHero(): void {
    if (!this.run.hero || this.run.hero.dead) return;
    const on = !this.heroSelected;
    this.hud.closeCtx();
    this.view.highlightSpot(-1);
    this.view.hideRange();
    this.setHeroSelected(on);
    if (on) {
      this.view.showRange(this.run.hero.x, this.run.hero.z, this.run.hero.def.range, '#7dff9a');
      this.tutorial?.onHeroSelected();
    }
    this.s.audio.play('select');
  }

  // --- HUD actions -----------------------------------------------------------------------

  buildPreview(id: TowerId | null): void {
    const spot = this.hud.selectedSpot;
    if (spot < 0 || !id) return;
    const sp = this.run.map.buildSpots[spot];
    const st = this.run.computeStats(TOWERS[id], 1, -1);
    this.view.showRange(sp.x, sp.z, st.range, this.run.gold >= TOWERS[id].cost ? '#9dff8a' : '#ff8a7a');
    this.hud.setPreview(id);
    this.s.audio.play('click');
  }

  private notEnoughGold(): void {
    this.s.audio.play('error');
    this.s.ui.toast('Not enough gold');
  }

  build(id: TowerId): void {
    const spot = this.hud.selectedSpot;
    if (spot < 0) return;
    if (this.run.gold < TOWERS[id].cost) return this.notEnoughGold();
    const t = this.run.build(spot, id);
    if (t) {
      this.s.meta.addMissionProgress('towersBuilt', 1);
      this.deselect();
      this.tutorial?.onBuilt();
      this.persist();
    }
  }

  clearLand(): void {
    const spot = this.hud.selectedSpot;
    if (spot < 0) return;
    if (this.run.gold < this.run.clearLandCost()) return this.notEnoughGold();
    if (this.run.clearLand(spot)) {
      this.hud.openBuild(spot);
      this.tutorial?.onLandCleared();
    }
  }

  upgrade(branch: number): void {
    const t = this.run.towerAt(this.hud.selectedSpot);
    if (!t) return;
    const cost = this.run.upgradeCost(t);
    if (cost === null) return;
    if (this.run.gold < cost) return this.notEnoughGold();
    if (this.run.upgrade(t, branch)) {
      this.s.meta.addMissionProgress('upgrades', 1);
      this.view.showRange(t.x, t.z, t.stats.range, '#ffffff');
      this.tutorial?.onUpgraded();
      this.persist();
    }
  }

  sell(): void {
    const t = this.run.towerAt(this.hud.selectedSpot);
    if (!t) return;
    this.run.sell(t);
    this.deselect();
  }

  setTargetMode(mode: TargetMode): void {
    const t = this.run.towerAt(this.hud.selectedSpot);
    if (t) {
      this.run.setTargetMode(t, mode);
      this.persist();
    }
  }

  nextWave(): void {
    if (this.run.callNextWave()) this.tutorial?.onWaveStarted();
  }

  ability(): void {
    if (!this.run.hero) return;
    if (this.run.state === 'prep') {
      this.s.ui.toast('Start the wave first!');
      return;
    }
    if (!this.run.heroAbilityReady()) {
      this.s.audio.play('error');
      return;
    }
    if (!this.run.useHeroAbility()) {
      this.s.ui.toast('No enemies in range of your hero');
      this.s.audio.play('error');
    }
  }

  toggleSpeed(): void {
    this.speed = this.speed === 1 ? 2 : 1;
    this.hud.setSpeed(this.speed);
  }

  /** Re-applies permanent upgrades bought in the shop mid-siege. */
  applyMeta(): void {
    this.run.applyMeta(this.s.meta.metaBonuses());
    this.run.config.availableTowers.splice(0, this.run.config.availableTowers.length, ...this.s.meta.towersAvailable());
    this.persist();
  }

  get elapsed(): number {
    return (performance.now() - this.startTime) / 1000;
  }

  dispose(): void {
    this.tutorial?.dispose();
    this.view.dispose();
    this.run.events.clear();
  }
}
