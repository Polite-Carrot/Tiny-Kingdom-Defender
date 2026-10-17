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
import { Battle } from './Battle';
import { AutoPlayer } from './AutoPlayer';
import type { Services } from './Services';
import { GRID_SIZE } from '../data/base';
import { themeOf, setActiveMap } from './Siege';
import type { MapId } from '../data/maps';
import type { HeroId } from '../data/heroes';
import { setHaptics } from '../core/Haptics';
import { TitleScreen } from '../ui/Screens';
import * as Modals from '../ui/Modals';
import { TWISTS } from '../data/challenge';

export type Orientation = 'portrait' | 'landscape';

export class Game {
  readonly s: Services;
  readonly hud: Hud;
  readonly input: Input;
  readonly title: TitleScreen;
  battle: Battle | null = null;
  /** Menu backdrop: your own kingdom, idle. */
  private demo: Battle | null = null;
  private last = performance.now();
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 60;
  orientation: Orientation = 'portrait';
  private adPaused = false;
  private pauseModalOpen = false;
  private safeProbe: HTMLElement;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    const save = new SaveSystem();
    const analytics = new LocalAnalytics(import.meta.env.DEV);
    const renderer = new Renderer(canvas, save.data.settings.quality);
    const rig = new CameraRig(renderer.camera, GRID_SIZE / 2 + 0.7);
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
      toggleAuto: () => this.battle?.toggleAuto(),
      castSpell: (id) => this.battle?.castSpell(id),
      nextWave: () => this.battle?.nextWave(),
      selectHero: (slot) => this.battle?.toggleHero(slot),
      ability: (slot) => this.battle?.ability(slot),
      buildPreview: (id) => this.battle?.buildPreview(id),
      build: (id) => this.battle?.build(id),
      upgrade: (b) => this.battle?.upgrade(b),
      sell: () => this.battle?.sell(),
      targetMode: (m) => this.battle?.setTargetMode(m),
      closeCtx: () => this.battle?.deselect(),
      clearLand: () => this.battle?.clearLand(),
      buildWall: () => this.battle?.buildWall(),
      repairWall: () => this.battle?.repairWall(),
      removeWall: () => this.battle?.removeWall(),
      shop: () => this.openShopInSiege(),
      rotateView: () => {
        this.s.rig.rotateBy(Math.PI / 2);
        this.s.audio.play('select');
        if (!this.s.save.data.tutorial.hintsSeen.includes('cam_twist')) {
          this.s.save.data.tutorial.hintsSeen.push('cam_twist');
          this.s.ui.toast('Tip: twist two fingers on the map to turn it freely');
        }
      },
      recentreView: () => {
        this.s.rig.recentre();
        this.s.audio.play('select');
      },
      viewMoved: () => this.s.rig.isMoved(),
    });
    ui.addScreen('battle', this.hud.el);
    this.title = new TitleScreen(this);
    ui.addScreen('title', this.title.el);

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
      if (document.hidden) return;
      save.data.stats.playTime += 10;
      meta.markSeen();
      save.markDirty();
      save.flush();
    }, 10000);
  }

  async start(): Promise<void> {
    const { audio, save, analytics, meta, ads } = this.s;
    audio.setVolumes(save.data.settings.music, save.data.settings.sfx);
    setHaptics(save.data.settings.vibration);
    meta.refreshMissions();
    analytics.track('session_start', {
      best_wave: meta.bestWave(), coins: save.data.coins, first_session: !save.data.base, save_recovered: save.recovered,
    });
    if (save.recovered !== 'none') this.s.ui.toast(save.recovered === 'backup' ? 'Save was damaged — restored from backup.' : 'Save was damaged and had to be reset.', 4000);
    void ads.init();
    this.onResize();
    // What happened while away is worked out before "last seen" moves on.
    const away = meta.welcomeBack();
    meta.markSeen();
    const abandoned = meta.settleAbandonedChallenge();
    meta.commit();
    setActiveMap(meta.mapId());
    // Always open on the main menu; Play / Begin takes you into the kingdom.
    this.goTitle();
    requestAnimationFrame(this.frame);
    if (abandoned) this.s.ui.toast(`Your unfinished Daily Challenge was scored: +${abandoned.coins} coins`, 3000);
    if (away) setTimeout(() => this.showWelcomeBack(away), 350);
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
    else if (this.demo) this.demo.updateDemo(dt);
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
    this.orientation = o;
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
      // The hero button sits on the left and the tower panel opens on the right. Split the margin
      // evenly so the board stays centred: the panel then only overlaps the outer wall.
      const side = (sa.left + (this.battle.run.hero ? 92 : 12) + sa.right + 252) / 2;
      safe = { top: sa.top + 54, bottom: sa.bottom + 8, left: side, right: side };
    }
    rig.frame(w, h, safe);
    renderer.setFogRange(rig.distance * 1.15, rig.distance + 120);
    renderer.camera.far = Math.max(rig.distance * 4, 600);
    renderer.camera.updateProjectionMatrix();
  }

  // --- Screens ------------------------------------------------------------------------

  private startDemo(): void {
    this.demo?.dispose();
    this.demo = new Battle(this.s, this.hud, { demo: true });
    this.s.rig.resetView();
    this.s.rig.pan.set(0, 0);
  }

  private music(track: MusicTrack): void {
    this.s.audio.playMusic(track);
  }

  goTitle(): void {
    this.leaveBattle();
    setActiveMap(this.s.meta.mapId());
    this.startDemo();
    this.onResize();
    this.title.render();
    this.s.ui.show('title');
    this.input.enabled = false;
    this.s.rig.orbit = true;
    this.music('menu');
    this.title.onEnter();
  }

  private leaveBattle(): void {
    if (this.battle) {
      this.flushRunStats();
      this.battle.flushMastery();
      if (this.battle.challenge) {
        // Leaving a challenge ends today's attempt with the waves survived so far.
        const res = this.s.meta.finishChallenge(this.battle.challengeScore);
        if (res.coins > 0 || res.newBest) this.s.ui.toast(`Challenge ended: ${this.battle.challengeScore} waves · +${res.coins} coins${res.newBest ? ' · new best!' : ''}`, 3200);
        if (res.chest) setTimeout(() => Modals.chestReveal(this, res.chest!), 600);
      }
      this.battle.persist();
      this.battle.dispose();
      this.battle = null;
      this.s.ui.clearHint();
      this.s.rig.resetView();
      this.s.rig.pan.set(0, 0);
    }
  }

  /** Opens your kingdom and resumes the siege from the last saved wave. */
  enterKingdom(): void {
    this.s.ui.closeModals();
    this.leaveBattle();
    this.demo?.dispose();
    this.demo = null;
    setActiveMap(this.s.meta.mapId());
    const battle = new Battle(this.s, this.hud);
    this.battle = battle;
    this.lastStats = { ...battle.run.stats };
    battle.onCheckpoint = (wave, coins, firstTime) => this.onCheckpoint(wave, coins, firstTime);
    battle.onFallen = (from, to) => Modals.fallen(this, from, to, battle.run.nearMiss());
    battle.onPerkChoice = (hero) => this.askPerk(battle, hero);
    battle.onReviveOffer = () => Modals.revive(this, battle);
    battle.onAgeChange = () => this.music(themeOf(battle.run.waveIndex).id as MusicTrack);
    battle.run.events.on('waveCleared', () => this.flushRunStats());
    this.s.rig.resetView();
    this.s.rig.pan.set(0, 0);
    this.onResize();
    this.s.ui.show('battle');
    this.input.enabled = true;
    this.s.rig.orbit = false;
    this.music(themeOf(battle.run.waveIndex).id as MusicTrack);
  }

  private lastStats: Battle['run']['stats'] | null = null;
  /** Moves run statistics into missions and lifetime stats (called per wave and on leaving). */
  private flushRunStats(): void {
    const b = this.battle;
    if (!b || !this.lastStats) return;
    const { meta } = this.s;
    const st = b.run.stats;
    const prev = this.lastStats;
    const done = [
      ...meta.addMissionProgress('kills', st.kills - prev.kills),
      ...meta.addMissionProgress('flyingKills', st.flyingKills - prev.flyingKills),
      ...meta.addMissionProgress('bossKills', st.bossKills - prev.bossKills),
      ...meta.addMissionProgress('goldEarned', st.goldEarned - prev.goldEarned),
      ...meta.addMissionProgress('heroAbility', st.heroAbilityUses - prev.heroAbilityUses),
      ...meta.addMissionProgress('earlyCalls', st.earlyCalls - prev.earlyCalls),
    ];
    meta.d.stats.kills += st.kills - prev.kills;
    this.lastStats = { ...st };
    meta.commit();
    if (done.length) setTimeout(() => this.s.ui.toast(`Mission complete: ${done[0]}!`, 2600), 300);
  }

  private onCheckpoint(wave: number, coins: number, firstTime: boolean): void {
    const b = this.battle;
    if (!b) return;
    Modals.checkpoint(this, wave, coins, firstTime, async () => {
      // Interstitials only ever appear here: at a checkpoint, never after trouble.
      const { ads, meta } = this.s;
      meta.d.ads.winsSinceInterstitial++;
      const shown = await ads.maybeShowInterstitial('checkpoint', {
        winsSinceLast: meta.d.ads.winsSinceInterstitial,
        levelsCompleted: meta.bestWave(),
        result: 'win',
        reviveOffered: b.segmentTrouble,
        removeAds: meta.d.ads.removeAds,
      });
      if (shown) meta.d.ads.winsSinceInterstitial = 0;
      b.segmentTrouble = false;
      meta.commit();
    });
  }

  // --- Battle helpers --------------------------------------------------------------------

  openPause(): void {
    if (!this.battle || this.battle.run.state === 'lost' || this.pauseModalOpen) return;
    this.battle.paused = true;
    this.pauseModalOpen = true;
    Modals.pause(this, () => {
      this.pauseModalOpen = false;
      if (this.battle && !this.s.ads.showing) this.battle.paused = false;
    });
  }

  private autoPause(): void {
    if (this.battle && !this.s.ads.showing && this.battle.run.state !== 'reviveOffer' && this.battle.run.state !== 'lost' && !this.s.ui.modalOpen) this.openPause();
  }

  private onVisibility(): void {
    const { meta } = this.s;
    if (document.hidden) {
      this.autoPause();
      this.s.audio.suspend();
      meta.markSeen();
      this.s.save.save();
    } else {
      if (!this.s.ads.showing) this.s.audio.resume();
      const away = meta.welcomeBack();
      meta.markSeen();
      if (away && this.s.ui.currentScreen === 'title' && !this.s.ui.modalOpen) this.showWelcomeBack(away);
    }
  }

  private showWelcomeBack(info: NonNullable<ReturnType<Meta['welcomeBack']>>): void {
    if (this.s.ui.currentScreen !== 'title' || this.s.ui.modalOpen) return;
    this.s.analytics.track('welcome_back_shown', { hours: Math.round(info.awayMs / 360000) / 10, treasury: info.treasury });
    Modals.welcomeBack(this, info);
  }

  /** Pauses the siege while the player picks a hero skill. */
  private askPerk(battle: Battle, hero: HeroId): void {
    if (this.battle !== battle || this.s.ui.modalOpen) {
      // Something else is on screen: the Heroes menu will offer the choice later.
      return;
    }
    battle.paused = true;
    this.pauseModalOpen = true;
    Modals.perkChoice(this, hero, this.s.meta.pendingPerkTier(hero), () => {
      this.pauseModalOpen = false;
      if (this.battle === battle && !this.s.ads.showing) battle.paused = false;
    });
  }

  /** A skin, finish or banner changed: show it (behind the menu now, in the siege next time). */
  refreshCosmetics(): void {
    if (this.battle) {
      this.s.ui.toast('Your new look appears next time you enter the kingdom');
      return;
    }
    this.startDemo();
    this.onResize();
  }

  /** Moves to another realm and shows its kingdom behind the menu. */
  switchMap(id: MapId): void {
    if (!this.s.meta.switchMap(id)) return;
    this.goTitle();
  }

  /** Buildings changed: show them around the castle and apply their bonuses. */
  refreshKingdomView(): void {
    const ids = this.s.meta.d.buildings;
    this.demo?.view.setBuildings(ids);
    if (this.battle) {
      this.battle.view.setBuildings(ids);
      this.battle.applyMeta();
    }
  }

  /** Starts today's Daily Challenge (one attempt). */
  enterChallenge(): void {
    const { meta } = this.s;
    const st = meta.challengeState();
    if (st.attempted) {
      this.s.ui.toast('You have already played today\'s challenge');
      return;
    }
    const def = meta.challengeFor();
    meta.startChallenge();
    this.s.ui.closeModals();
    this.leaveBattle();
    this.demo?.dispose();
    this.demo = null;
    // The challenge is the same for everyone, so it is always fought in Kingdom Vale.
    setActiveMap('vale');
    const battle = new Battle(this.s, this.hud, { challenge: def });
    this.battle = battle;
    this.lastStats = null;
    battle.onChallengeEnd = (score) => {
      const res = meta.finishChallenge(score);
      Modals.challengeResult(this, score, res, battle.run.nearMiss(), battle.lossTip());
    };
    battle.onAgeChange = () => this.music(themeOf(battle.run.waveIndex).id as MusicTrack);
    battle.onPerkChoice = (hero) => this.askPerk(battle, hero);
    this.s.rig.resetView();
    this.s.rig.pan.set(0, 0);
    this.onResize();
    this.s.ui.show('battle');
    this.input.enabled = true;
    this.s.rig.orbit = false;
    this.music(themeOf(battle.run.waveIndex).id as MusicTrack);
    this.s.ui.banner('Daily Challenge', `${def.twists.map((t) => TWISTS[t].name).join(' · ')}`);
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

  /** Shop opened from the siege: pauses, then applies new permanent upgrades. */
  openShopInSiege(): void {
    const b = this.battle;
    if (!b) return;
    if (!this.s.meta.featureUnlocked('shop')) {
      this.s.ui.toast('The shop opens after wave 3');
      return;
    }
    b.paused = true;
    this.pauseModalOpen = true;
    Modals.shop(this, 'towers', () => {
      this.pauseModalOpen = false;
      b.applyMeta();
      if (!this.s.ads.showing) b.paused = false;
    });
  }

  /** Debug: hand the current battle to the heuristic AI. */
  autoplay(): void {
    if (this.battle) this.battle.autoPlayer = new AutoPlayer(this.battle.run, 1);
  }

  applySettings(): void {
    const st = this.s.save.data.settings;
    setHaptics(st.vibration);
    this.s.audio.setVolumes(st.music, st.sfx);
    if (st.quality !== this.s.renderer.quality) {
      this.s.renderer.setQuality(st.quality);
      this.onResize();
    }
    this.s.save.save();
  }
}
