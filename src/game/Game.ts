// Top-level orchestrator: main loop, screen flow, orientation handling and service wiring.

import { Renderer } from '../core/Renderer';
import { CameraRig, type SafeRect } from '../core/CameraRig';
import { Input } from '../core/Input';
import { SaveSystem } from '../core/Save';
import { AudioSystem, type MusicTrack } from '../systems/Audio';
import { UI } from '../ui/UI';
import { Hud } from '../ui/Hud';
import { LocalAnalytics } from '../analytics/Analytics';
import { AdManager } from '../ads/AdManager';
import { MockAdProvider } from '../ads/MockAdProvider';
import { Meta } from './Meta';
import { Battle, type BattleResult } from './Battle';
import { AutoPlayer } from './AutoPlayer';
import { buildCampaignLevel, type LevelDef } from './Levels';
import type { Services } from './Services';
import { CHAPTERS, LEVELS_PER_CHAPTER, TOTAL_LEVELS } from '../data/levels';
import { TitleScreen, MapScreen } from '../ui/Screens';
import * as Modals from '../ui/Modals';

export type Orientation = 'portrait' | 'landscape';

export class Game {
  readonly s: Services;
  readonly hud: Hud;
  readonly input: Input;
  readonly title: TitleScreen;
  readonly map: MapScreen;
  battle: Battle | null = null;
  private demo: { battle: Battle; ai: AutoPlayer; level: number } | null = null;
  private last = performance.now();
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 60;
  orientation: Orientation = 'portrait';
  private adPaused = false;
  private pauseModalOpen = false;
  private safeProbe: HTMLElement;
  /** Set when a rewarded ad grants +50% gold for the next level. */
  pendingStartGoldMult = 1;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    const save = new SaveSystem();
    const analytics = new LocalAnalytics(import.meta.env.DEV);
    const renderer = new Renderer(canvas, save.data.settings.quality);
    const rig = new CameraRig(renderer.camera, 7.2);
    const audio = new AudioSystem();
    const ui = new UI(uiRoot);
    ui.onClick = () => {
      audio.unlock();
      audio.play('click');
    };
    const meta = new Meta(save, analytics);
    const provider = new MockAdProvider(() => save.data.settings.debugAdOutcome, () => save.data.settings.debugAdsUnavailable);
    const ads = new AdManager(provider, analytics, {
      onOpen: () => this.onAdOpen(),
      onClose: () => this.onAdClose(),
      toast: (m) => ui.toast(m),
    });
    this.s = { renderer, rig, save, audio, ui, analytics, ads, meta };

    this.safeProbe = document.createElement('div');
    this.safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.append(this.safeProbe);

    this.hud = new Hud({
      pause: () => this.openPause(),
      toggleSpeed: () => this.battle?.toggleSpeed(),
      nextWave: () => this.battle?.nextWave(),
      selectHero: () => this.battle?.toggleHero(),
      ability: () => this.battle?.ability(),
      reinforce: () => this.reinforce(),
      buildPreview: (id) => this.battle?.buildPreview(id),
      build: (id) => this.battle?.build(id),
      upgrade: (b) => this.battle?.upgrade(b),
      sell: () => this.battle?.sell(),
      targetMode: (m) => this.battle?.setTargetMode(m),
      closeCtx: () => this.battle?.deselect(),
    });
    ui.addScreen('battle', this.hud.el);
    this.title = new TitleScreen(this);
    this.map = new MapScreen(this);
    ui.addScreen('title', this.title.el);
    ui.addScreen('map', this.map.el);

    this.input = new Input(canvas, renderer.camera, rig, {
      onTap: (x, z) => {
        audio.unlock();
        if (this.battle && ui.currentScreen === 'battle' && !ui.modalOpen) this.battle.handleTap(x, z);
      },
    });

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 120));
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('blur', () => this.autoPause());
    window.addEventListener('pagehide', () => save.flush());
    window.addEventListener('pointerdown', () => audio.unlock(), { once: false, passive: true });
    setInterval(() => {
      save.data.stats.playTime += 10;
      save.flush();
    }, 10000);
  }

  async start(): Promise<void> {
    const { audio, save, analytics, meta, ads } = this.s;
    audio.setVolumes(save.data.settings.music, save.data.settings.sfx);
    meta.refreshMissions();
    analytics.track('session_start', {
      levels_completed: meta.levelsCompleted(), coins: save.data.coins, first_session: save.data.stats.wins + save.data.stats.losses === 0,
      save_recovered: save.recovered,
    });
    if (save.recovered !== 'none') this.s.ui.toast(save.recovered === 'backup' ? 'Save was damaged — restored from backup.' : 'Save was damaged and had to be reset.', 4000);
    void ads.init();
    this.onResize();
    // First launch goes straight into the guided first level.
    if (meta.levelsCompleted() === 0 && !save.data.tutorial.done && (save.data.levels['L1']?.plays ?? 0) === 0) {
      this.startLevel(buildCampaignLevel(0), 1);
    } else {
      this.goTitle();
    }
    requestAnimationFrame(this.frame);
  }

  // --- Loop --------------------------------------------------------------------------

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
      this.hud.showFps(this.s.save.data.settings.showFps, this.fps);
    }
    if (this.battle) this.battle.update(dt);
    else if (this.demo) {
      this.demo.battle.updateDemo(dt * 1.0, this.demo.ai);
      const st = this.demo.battle.run.state;
      if (st === 'won' || st === 'lost') this.startDemo(this.demo.level + 1);
    }
    if (this.s.ui.currentScreen === 'title') this.title.tick();
    this.s.rig.update(dt);
    this.s.renderer.render();
    requestAnimationFrame(this.frame);
  };

  // --- Layout -------------------------------------------------------------------------

  private safeInsets(): SafeRect {
    const cs = getComputedStyle(this.safeProbe);
    return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  }

  onResize(): void {
    const { renderer, rig } = this.s;
    renderer.resize();
    const w = renderer.width;
    const h = renderer.height;
    const o: Orientation = w > h ? 'landscape' : 'portrait';
    if (o !== this.orientation) {
      this.orientation = o;
      this.map.render();
    }
    document.body.classList.toggle('portrait', o === 'portrait');
    document.body.classList.toggle('landscape', o === 'landscape');
    const sa = this.safeInsets();
    let safe: SafeRect;
    if (!this.battle) {
      // Menus: the board is a backdrop; keep it behind the logo/menus.
      safe = o === 'portrait' ? { top: sa.top + h * 0.2, bottom: sa.bottom + h * 0.25, left: 0, right: 0 } : { top: sa.top + 40, bottom: sa.bottom + 20, left: w * 0.15, right: w * 0.15 };
    } else if (o === 'portrait') {
      safe = { top: sa.top + 60, bottom: sa.bottom + 96, left: sa.left + 4, right: sa.right + 4 };
    } else {
      safe = { top: sa.top + 54, bottom: sa.bottom + 8, left: sa.left + (this.battle.run.hero ? 92 : 12), right: sa.right + 236 };
    }
    rig.frame(w, h, safe);
    const fog = renderer.scene.fog as import('three').Fog;
    fog.near = rig.distance * 1.4;
    fog.far = rig.distance * 3.2;
    renderer.camera.far = rig.distance * 4;
    renderer.camera.updateProjectionMatrix();
  }

  // --- Screens ------------------------------------------------------------------------

  private furthestChapter(): number {
    return Math.min(CHAPTERS.length - 1, Math.floor(Math.min(this.s.meta.levelsCompleted(), TOTAL_LEVELS - 1) / LEVELS_PER_CHAPTER));
  }

  private startDemo(seed: number): void {
    this.demo?.battle.dispose();
    const chapter = this.furthestChapter();
    const idx = chapter * LEVELS_PER_CHAPTER + (seed % 6);
    const level = buildCampaignLevel(idx);
    const battle = new Battle(this.s, this.hud, level, { startGoldMult: 3, demo: true });
    battle.run.callNextWave();
    this.demo = { battle, ai: new AutoPlayer(battle.run, seed), level: seed };
    this.s.rig.resetView();
    this.s.rig.pan.set(0, 0);
  }

  private music(track: MusicTrack): void {
    this.s.audio.playMusic(track);
  }

  goTitle(): void {
    this.leaveBattle();
    if (!this.demo || this.demo.battle.level.chapter !== this.furthestChapter()) this.startDemo(Math.floor(Math.random() * 6));
    this.onResize();
    this.title.render();
    this.s.ui.show('title');
    this.input.enabled = false;
    this.music('menu');
    this.title.onEnter();
  }

  goMap(chapter?: number): void {
    this.leaveBattle();
    if (!this.demo) this.startDemo(0);
    this.onResize();
    this.map.open(chapter);
    this.s.ui.show('map');
    this.input.enabled = false;
    this.music('menu');
  }

  private leaveBattle(): void {
    if (this.battle) {
      this.battle.dispose();
      this.battle = null;
      this.s.ui.clearHint();
      this.s.rig.resetView();
      this.s.rig.pan.set(0, 0);
    }
  }

  startLevel(level: LevelDef, startGoldMult = this.pendingStartGoldMult): void {
    this.pendingStartGoldMult = 1;
    this.s.ui.closeModals();
    this.leaveBattle();
    this.demo?.battle.dispose();
    this.demo = null;
    const battle = new Battle(this.s, this.hud, level, { startGoldMult });
    this.battle = battle;
    battle.onEnd = (r) => this.onBattleEnd(r);
    battle.onReviveOffer = () => Modals.revive(this, battle);
    this.s.rig.resetView();
    this.s.rig.pan.set(0, 0);
    this.onResize();
    this.s.ui.show('battle');
    this.input.enabled = true;
    this.music(CHAPTERS[level.chapter].theme.id as MusicTrack);
  }

  private onBattleEnd(r: BattleResult): void {
    const { meta } = this.s;
    const stats = r.run.stats;
    meta.d.stats.kills += stats.kills;
    // Mission progress from the run.
    const done = [
      ...meta.addMissionProgress('kills', stats.kills),
      ...meta.addMissionProgress('flyingKills', stats.flyingKills),
      ...meta.addMissionProgress('bossKills', stats.bossKills),
      ...meta.addMissionProgress('goldEarned', stats.goldEarned),
      ...meta.addMissionProgress('heroAbility', stats.heroAbilityUses),
      ...meta.addMissionProgress('earlyCalls', stats.earlyCalls),
    ];
    if (r.won && r.level.kind !== 'endless') {
      done.push(...meta.addMissionProgress('wins', 1));
      if (r.stars === 3) done.push(...meta.addMissionProgress('threeStars', 1));
      if (stats.maxTowers <= 3) done.push(...meta.addMissionProgress('winFewTowers', 1));
    }
    meta.commit();
    if (done.length) setTimeout(() => this.s.ui.toast(`Mission complete: ${done[0]}!`, 2600), 600);
    Modals.results(this, r);
  }

  /** After the results screen: maybe show an interstitial, then continue. */
  async afterResults(r: BattleResult, next: () => void): Promise<void> {
    const { ads, meta } = this.s;
    if (r.won && r.level.kind === 'campaign') meta.d.ads.winsSinceInterstitial++;
    const shown = await ads.maybeShowInterstitial('level_complete', {
      winsSinceLast: meta.d.ads.winsSinceInterstitial,
      levelsCompleted: meta.levelsCompleted(),
      result: r.won ? 'win' : 'loss',
      reviveOffered: r.reviveOffered,
      removeAds: meta.d.ads.removeAds,
    });
    if (shown) meta.d.ads.winsSinceInterstitial = 0;
    meta.commit();
    next();
  }

  // --- Battle helpers --------------------------------------------------------------------

  openPause(): void {
    if (!this.battle || this.battle.ended || this.pauseModalOpen) return;
    this.battle.paused = true;
    this.pauseModalOpen = true;
    Modals.pause(this, () => {
      this.pauseModalOpen = false;
      if (this.battle && !this.s.ads.showing) this.battle.paused = false;
    });
  }

  private autoPause(): void {
    if (this.battle && !this.battle.ended && !this.s.ads.showing && this.battle.run.state !== 'reviveOffer') this.openPause();
  }

  private onVisibility(): void {
    if (document.hidden) {
      this.autoPause();
      this.s.audio.suspend();
      this.s.save.flush();
    } else if (!this.s.ads.showing) {
      this.s.audio.resume();
    }
  }

  private onAdOpen(): void {
    this.s.audio.setMuted(true);
    if (this.battle && !this.battle.paused) {
      this.battle.paused = true;
      this.adPaused = true;
    }
  }

  private onAdClose(): void {
    this.s.audio.setMuted(false);
    if (this.adPaused && this.battle) this.battle.paused = this.pauseModalOpen;
    this.adPaused = false;
  }

  private async reinforce(): Promise<void> {
    const b = this.battle;
    if (!b || b.run.reinforcementsUsed) return;
    const ok = await this.s.ads.showRewarded('reinforcements');
    if (ok && this.battle === b && b.run.summonReinforcements()) {
      this.s.ui.banner('Reinforcements!', 'A Royal Champion joins the fight');
      this.s.audio.play('reward');
    }
  }

  /** Debug: hand the current battle to the heuristic AI. */
  autoplay(): void {
    if (this.battle) this.battle.autoPlayer = new AutoPlayer(this.battle.run, 1);
  }

  applySettings(): void {
    const st = this.s.save.data.settings;
    this.s.audio.setVolumes(st.music, st.sfx);
    if (st.quality !== this.s.renderer.quality) {
      this.s.renderer.setQuality(st.quality);
      this.onResize();
    }
    this.s.save.save();
  }
}
