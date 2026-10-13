// A single battle session: owns the Run (simulation), BattleView (3D) and drives the HUD.

import { Run } from './Run';
import { BattleView } from './BattleView';
import { Tutorial } from './Tutorial';
import type { LevelDef } from './Levels';
import type { Services } from './Services';
import type { Hud } from '../ui/Hud';
import { TOWERS, type TowerId, type TargetMode } from '../data/towers';
import { FEATURE_UNLOCK_LEVEL } from '../data/levels';
import { ENDLESS } from '../data/economy';

const STEP = 1 / 60;
const MAX_STEPS = 8;

export interface BattleResult {
  level: LevelDef;
  won: boolean;
  stars: number;
  waveReached: number;
  duration: number;
  hpLeft: number;
  hpFrac: number;
  run: Run;
  reviveOffered: boolean;
}

export class Battle {
  readonly run: Run;
  readonly view: BattleView;
  private tutorial: Tutorial | null = null;
  speed = 1;
  paused = false;
  ended = false;
  private acc = 0;
  private heroSelected = false;
  private reviveOffered = false;
  private startTime = performance.now();
  private endlessMilestones = 0;
  onEnd: (r: BattleResult) => void = () => {};
  onReviveOffer: () => void = () => {};

  constructor(private s: Services, private hud: Hud, readonly level: LevelDef, opts: { startGoldMult: number; demo?: boolean }) {
    const meta = s.meta;
    const idx = level.kind === 'campaign' ? level.globalIndex : 999;
    const bonuses = meta.metaBonuses();
    if (opts.demo) {
      bonuses.heroId = 'ranger';
    }
    this.run = new Run({
      level,
      meta: bonuses,
      availableTowers: opts.demo ? ['archer', 'cannon', 'frost'] : meta.towersFor(idx),
      allowSpecialisation: opts.demo || idx >= FEATURE_UNLOCK_LEVEL.specialisation,
      startGoldMult: opts.startGoldMult,
      reviveAvailable: !opts.demo && level.kind !== 'endless',
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

    this.hud.bind(this.run, {
      levelIndex: idx,
      lightningOwned: meta.d.unlocks.lightning,
      reinforcementsAllowed: meta.levelsCompleted() >= FEATURE_UNLOCK_LEVEL.reinforcements || level.kind !== 'campaign',
      speedUpAllowed: true,
      label: level.name,
    });
    this.hud.onAdOfferShown = (p) => s.ads.offerShown(p);
    this.bindRunEvents();
    if (level.kind === 'campaign') this.tutorial = new Tutorial(s, this, hud);
    s.analytics.track('level_start', { level: level.id, kind: level.kind, hero: this.run.hero?.def.id ?? 'none', start_gold: this.run.gold });
  }

  private bindRunEvents(): void {
    const ev = this.run.events;
    const { analytics, ui } = this.s;
    ev.on('waveStart', ({ index }) => {
      const w = this.run.waveDef(index);
      const total = this.run.totalWaves === Infinity ? '' : ` / ${this.run.totalWaves}`;
      if (w?.boss) ui.banner('BOSS WAVE', `Wave ${index + 1}${total}`, 'boss');
      else ui.banner(`Wave ${index + 1}`, total ? `of ${this.run.totalWaves}` : 'Endless Siege');
    });
    ev.on('waveCleared', ({ index, gold }) => analytics.track('wave_complete', { level: this.level.id, wave: index + 1, gold, castle_hp: this.run.castleHp }));
    ev.on('towerBuilt', (t) => analytics.track('tower_built', { level: this.level.id, tower: t.def.id, spot: t.spot, wave: this.run.waveIndex }));
    ev.on('towerUpgraded', (t) => analytics.track('tower_upgraded', { level: this.level.id, tower: t.def.id, tier: t.tier, branch: t.branch >= 0 ? t.def.branches[t.branch].id : null }));
    ev.on('heroAbility', ({ hero }) => analytics.track('hero_ability_used', { level: this.level.id, hero: hero.def.id, ability: hero.def.ability.kind }));
    ev.on('victory', () => this.finish(true));
    ev.on('defeat', () => this.finish(false));
    ev.on('reviveOffer', () => {
      this.reviveOffered = true;
      this.hud.closeCtx();
      this.onReviveOffer();
    });
    ev.on('milestone', ({ wave }) => {
      this.endlessMilestones++;
      const coins = this.s.meta.endlessMilestoneCoins(wave / ENDLESS.milestoneEvery);
      this.s.meta.earn(coins, 'endless_milestone');
      ui.banner(`Wave ${wave}!`, `+${coins} coins`);
      this.s.audio.play('reward');
    });
  }

  private finish(won: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.deselect();
    const run = this.run;
    const result: BattleResult = {
      level: this.level,
      won,
      stars: won ? run.stars() : 0,
      waveReached: run.waveIndex,
      duration: run.time,
      hpLeft: run.castleHp,
      hpFrac: run.castleHp / run.castleMaxHp,
      run,
      reviveOffered: this.reviveOffered,
    };
    this.s.audio.play(won ? 'victory' : 'defeat');
    this.s.analytics.track('level_end', {
      level: this.level.id, kind: this.level.kind, result: won ? 'win' : 'loss', stars: result.stars, wave_reached: run.waveIndex,
      duration: Math.round(run.time), castle_hp: run.castleHp, revive_used: run.reviveUsed, towers: run.towers.length,
    });
    this.tutorial?.dispose();
    setTimeout(() => this.onEnd(result), won ? 900 : 1300);
  }

  // --- Frame ------------------------------------------------------------------------

  update(dt: number): void {
    if (!this.paused && !this.ended) {
      this.acc += Math.min(dt, 0.1) * this.speed;
      let steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS * this.speed) {
        this.run.update(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps >= MAX_STEPS * this.speed) this.acc = 0;
    }
    const visualDt = this.paused ? 0 : dt * (this.ended ? 1 : this.speed);
    this.view.update(visualDt, this.speed);
    this.hud.update();
    this.tutorial?.update();
  }

  /** Demo mode (menu backdrop) update. */
  updateDemo(dt: number, ai: { update(dt: number): void }): void {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= STEP) {
      ai.update(STEP);
      this.run.update(STEP);
      this.acc -= STEP;
    }
    this.view.update(dt, 1);
  }

  // --- Input -----------------------------------------------------------------------

  handleTap(x: number, z: number): void {
    if (this.ended || this.paused) return;
    const run = this.run;
    // Build spot / tower?
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

  build(id: TowerId): void {
    const spot = this.hud.selectedSpot;
    if (spot < 0) return;
    if (this.run.gold < TOWERS[id].cost) {
      this.s.audio.play('error');
      this.s.ui.toast('Not enough gold');
      return;
    }
    const t = this.run.build(spot, id);
    if (t) {
      this.s.meta.addMissionProgress('towersBuilt', 1);
      this.deselect();
      this.tutorial?.onBuilt();
    }
  }

  upgrade(branch: number): void {
    const spot = this.hud.selectedSpot;
    const t = this.run.towerAt(spot);
    if (!t) return;
    const cost = this.run.upgradeCost(t);
    if (cost === null) return;
    if (this.run.gold < cost) {
      this.s.audio.play('error');
      this.s.ui.toast('Not enough gold');
      return;
    }
    if (this.run.upgrade(t, branch)) {
      this.s.meta.addMissionProgress('upgrades', 1);
      this.view.showRange(t.x, t.z, t.stats.range, '#ffffff');
      this.tutorial?.onUpgraded();
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
    if (t) this.run.setTargetMode(t, mode);
  }

  nextWave(): void {
    if (this.run.callNextWave()) {
      this.tutorial?.onWaveStarted();
    }
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

  /** Session wall-clock time in seconds. */
  get elapsed(): number {
    return (performance.now() - this.startTime) / 1000;
  }

  dispose(): void {
    this.tutorial?.dispose();
    this.view.dispose();
    this.run.events.clear();
  }
}
