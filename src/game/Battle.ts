// The siege session on your persistent kingdom: owns the Run (simulation), BattleView (3D),
// drives the HUD, and saves the kingdom at safe moments.

import { Run, newKingdom, type BaseSnapshot, type Enemy, type Hero } from './Run';
import { BattleView } from './BattleView';
import { Tutorial } from './Tutorial';
import type { Services } from './Services';
import type { Hud } from '../ui/Hud';
import { TOWERS, TOWER_ORDER, MAX_TIER, isSupport, type TowerId, type TargetMode } from '../data/towers';
import { SIEGE, TOWER_UNLOCK_WAVE, BARRICADE } from '../data/base';
import { worldToTile } from './LevelMap';
import { ELITE_RULES } from '../data/enemies';
import { SYNERGY_BY_ID } from '../data/synergies';
import { HERO_LEVELS, HERO_GEAR, gearTierFor, type HeroId } from '../data/heroes';
import { ageTitle, themeOf, kingdomMap, hpMultFor, nightOf, activeRoads, weatherOf, WEATHER_NAMES } from './Siege';
import { towerThumb } from '../ui/Thumbnails';
import { el } from '../ui/dom';
import { MASTERY, masteryTitle } from '../data/mastery';
import type { SpellId } from '../data/spells';
import { vibrate } from '../core/Haptics';
import { challengeMods, CHALLENGE, type ChallengeDef } from '../data/challenge';

/** A fresh siege for the Daily Challenge: every pad cleared, no towers, the day's gold. */
function challengeSnapshot(c: ChallengeDef, pads: number): BaseSnapshot {
  return {
    wave: c.startWave, checkpoint: c.startWave, gold: c.gold, castleHp: -1, towers: [], spots: Array.from({ length: pads }, (_, i) => i), padsCleared: 0,
    reviveUsed: true, reinforcementsUsed: true, goldRushUsed: true, goldRushWaves: 0,
  };
}

const STEP = 1 / 60;
const MAX_STEPS = 8;

export class Battle {
  readonly run: Run;
  readonly view: BattleView;
  private tutorial: Tutorial | null = null;
  speed = 1;
  paused = false;
  /** The siege is frozen for a cinematic (the view keeps animating). */
  /** The simulation is held for a cinematic (a new front or a boss arriving). */
  holdSim = false;
  private achT = 1;
  /** Seconds left of a timed cinematic (boss entrance); 0 = none. */
  private cinematicT = 0;
  private acc = 0;
  /** Slot of the selected hero (-1 = none). */
  private selHero = -1;
  private startTime = performance.now();
  /** A revive offer or a retreat happened since the last checkpoint (no interstitial then). */
  segmentTrouble = false;
  /** Debug: lets the heuristic AI play this battle. */
  autoPlayer: { update(dt: number): void } | null = null;
  onCheckpoint: (wave: number, coins: number, firstTime: boolean) => void = () => {};
  onFallen: (fromWave: number, toWave: number) => void = () => {};
  onReviveOffer: () => void = () => {};
  onAgeChange: () => void = () => {};
  /** The Daily Challenge ended (the castle fell): waves survived. */
  onChallengeEnd: (score: number) => void = () => {};
  /** Today's Daily Challenge, when this battle is one (nothing is saved to the kingdom). */
  readonly challenge: ChallengeDef | null;
  /** Waves survived in this challenge attempt. */
  challengeScore = 0;
  /** Kill counts already turned into mastery XP, by tower id. */
  private masteryKills = new Map<number, number>();
  /** Waves cleared since mastery was last paid out. */
  private wavesServed = 0;

  constructor(private s: Services, private hud: Hud, opts: { demo?: boolean; challenge?: ChallengeDef } = {}) {
    const meta = s.meta;
    this.challenge = opts.challenge ?? null;
    const c = this.challenge;
    const snapshot: BaseSnapshot = c ? challengeSnapshot(c, kingdomMap().classicSpots) : s.save.data.base ?? newKingdom();
    this.run = new Run({
      snapshot,
      meta: meta.metaBonuses(),
      availableTowers: c ? [...(c.towers ?? TOWER_ORDER)] : meta.towersAvailable(),
      reviveAvailable: !opts.demo && !c,
      announceFrontiers: !opts.demo && !c,
      seed: c?.seed,
      mods: c ? challengeMods(c.twists, c.startWave, hpMultFor(CHALLENGE.hpLikeWave) / hpMultFor(c.startWave)) : undefined,
    });
    const silent = { play() {} } as unknown as typeof s.audio;
    this.view = new BattleView(s.renderer, s.rig, this.run, opts.demo ? silent : s.audio, {
      floatText: (x, y, t, c) => !opts.demo && s.ui.floatText(x, y, t, c),
      coinFly: (x, y) => !opts.demo && s.ui.coinFly(x, y, this.hud.goldTarget, 1, () => {
        this.hud.bumpGold();
        s.audio.play('coin');
      }),
      castleHit: () => {
        if (opts.demo) return;
        this.hud.castleHit();
        vibrate(35);
      },
    }, { castleColor: meta.castleColor(), trailColor: meta.trailColor(), heroGear: gearTierFor(meta.heroLevel(meta.d.selectedHero)), heroGear2: meta.secondHero() ? gearTierFor(meta.heroLevel(meta.secondHero()!)) : 0, heroSkins: [meta.heroSkin(meta.d.selectedHero), meta.secondHero() ? meta.heroSkin(meta.secondHero()!) : null], castleTier: meta.castleTier(), archers: (meta.d.meta.battlements ?? 0) > 0, buildings: [...meta.d.buildings], heroTint: meta.cosmeticTint('hero'), towerTint: meta.cosmeticTint('tower'), flag: meta.flagColor() });
    if (opts.demo) return;

    if (!s.save.data.base && !c) this.persist(true);
    this.hud.bind(this.run);
    this.speed = [1, 2, 3].includes(s.save.data.settings.speed) ? s.save.data.settings.speed : 1;
    this.hud.setSpeed(this.speed);
    this.hud.setAuto(s.save.data.settings.autoWave);
    this.hud.setChallenge(c ? 'Daily Challenge' : null, c?.startWave ?? 0);
    this.bindCommonEvents();
    if (c) this.bindChallengeEvents();
    else {
      this.run.holdAtCheckpoints = true;
      this.bindRunEvents();
      this.tutorial = new Tutorial(s, this, hud);
    }
    s.analytics.track('level_start', { level: 'siege', wave: this.run.waveIndex + 1, towers: this.run.towers.length, gold: this.run.gold, hero: this.run.hero?.def.id ?? 'none' });
  }

  get theme() {
    return themeOf(this.run.waveIndex);
  }

  /**
   * A new Age begins and/or a new road opens with the next wave: freeze the siege, fly the camera
   * to the new tunnel, show what's changing, and start the wave when the player is ready.
   */
  private announceFrontier(wave: number, newAge: boolean, roads: number[]): void {
    const { ui, meta, audio, rig } = this.s;
    if (meta.d.progress.frontierSeen >= wave) {
      // Seen before (e.g. replaying after a fall): just a quick reminder.
      if (newAge) ui.banner(ageTitle(wave), roads.length ? `Enemies also march from the ${activeRoads()[roads[0]].name}` : 'A new Age begins');
      this.run.continueFrontier();
      return;
    }
    this.holdSim = true;
    this.deselect();
    this.hud.closeCtx();
    this.view.showFrontier(roads);
    const map = this.run.map;
    if (roads.length) {
      const p = map.paths[roads[0]];
      // Frame the tunnel and the first stretch of its road.
      rig.focusOn(p.xs[0] * 0.7 + p.xs[2] * 0.3, p.zs[0] * 0.7 + p.zs[2] * 0.3, 1.75);
    } else {
      rig.focusOn(map.castle.x, map.castle.z, 1.25);
    }
    audio.play(roads.length ? 'bossRoar' : 'victory');
    const towers = TOWER_ORDER.filter((t) => TOWER_UNLOCK_WAVE[t] === wave && this.run.isTowerAvailable(t));
    const title = newAge ? ageTitle(wave) : 'New road!';
    ui.modal((m, h) => {
      h.layer.classList.add('frontier-layer');
      const lines: string[] = [];
      if (newAge) lines.push(`<p><b>${title}</b> begins. The land changes and new foes join the siege.</p>`);
      for (const r of roads) lines.push(`<p class="warn">⚠ Enemies will now also march out of the <b>${activeRoads()[r].name.replace(' Road', '')} tunnel</b>. Guard the new road!</p>`);
      if (newAge) lines.push(`<p class="muted">Checkpoint: if the castle falls, you regroup at the start of this Age.</p>`);
      m.innerHTML = `
        <div class="ribbon ${roads.length ? 'lose' : 'purple'}">${roads.length && newAge ? `${title}` : title}</div>
        ${lines.join('')}
        ${towers.length ? `<div class="frontier-towers">${towers.map((t) => `<div><img src="${towerThumb(t)}" alt=""/><span>New tower<br/><b>${TOWERS[t].name}</b></span></div>`).join('')}</div>` : ''}`;
      const close = () => {
        h.close();
        this.view.hideFrontier();
        rig.clearFocus();
        this.holdSim = false;
        meta.d.progress.frontierSeen = wave;
        meta.commit();
      };
      const go = el('button', 'btn big ready-btn', `Ready! <small>Wave ${wave + 1}</small>`);
      go.onclick = () => {
        close();
        audio.play('waveStart');
        this.run.continueFrontier();
      };
      // Or look around and build first: the wave waits for the Start button.
      const later = el('button', 'btn blue build-first-btn', `Build first <small>start when you're ready</small>`);
      later.onclick = () => {
        close();
        audio.play('select');
        ui.toast(`Tap Start when you're ready for wave ${wave + 1}`);
      };
      m.append(go, later);
    }, { closable: false, cls: 'frontier' });
  }

  /** Hero skill chosen or stats changed: apply them to the hero on the field. */
  refreshHero(): void {
    this.run.applyMeta({ ...this.s.meta.metaBonuses(), spells: this.run.config.meta.spells });
  }

  /** A skill tier was reached: ask which perk to take (the siege pauses meanwhile). */
  onPerkChoice: (hero: HeroId) => void = () => {};

  /** Hero XP; on a level-up the hero gets stronger at once (and new gear shows if it unlocked). */
  private giveHeroXp(hero: Hero, xp: number): void {
    const { meta, ui, audio } = this.s;
    const r = meta.addHeroXp(hero.def.id, xp);
    if (!r.levelUp) return;
    this.run.applyMeta(meta.metaBonuses());
    const gear = HERO_GEAR[gearTierFor(r.level)];
    ui.banner(`${hero.def.name} reached level ${r.level}!`, r.newGear ? `New gear: ${gear.name}` : 'Stronger attacks and abilities');
    audio.play('upgrade');
    this.view.heroLevelUp(hero.slot, r.newGear ? gearTierFor(r.level) : -1);
    meta.commit();
    if (meta.pendingPerkTier(hero.def.id) >= 0) setTimeout(() => this.onPerkChoice(hero.def.id), 1200);
  }

  /** A boss steps out of its tunnel: freeze for a moment, swoop the camera in and show its name. */
  private bossEntrance(e: Enemy): void {
    const { ui, audio, rig } = this.s;
    ui.bossCard(e.def.name, e.def.description);
    audio.play('bossRoar');
    vibrate([70, 50, 90], 0);
    this.view.bossIntro(e);
    if (this.holdSim) return;
    this.holdSim = true;
    this.cinematicT = 2.2;
    this.deselect();
    rig.focusOn(e.x, e.z, 1.9);
  }

  /** Saves the kingdom. Only saves mid-wave when given the wave to resume from. */
  persist(force = false, wave?: number): void {
    if (this.challenge) return;
    if (!force && !this.run.isQuiet()) return;
    this.s.save.data.base = this.run.snapshot(wave);
    this.s.save.save();
  }

  /** Turns the kills each tower made since the last call into mastery XP for its type. */
  flushMastery(): void {
    const { meta, ui, audio } = this.s;
    const gained = new Map<TowerId, number>();
    // Support towers (mines, beacons) never kill: they earn mastery for each wave they serve.
    const served = this.wavesServed;
    this.wavesServed = 0;
    for (const t of this.run.towers) {
      if (isSupport(t.def.id)) {
        if (served > 0) gained.set(t.def.id, (gained.get(t.def.id) ?? 0) + served * MASTERY.supportXpPerWave);
        continue;
      }
      const before = this.masteryKills.get(t.id) ?? t.kills;
      const d = t.kills - before;
      this.masteryKills.set(t.id, t.kills);
      if (d > 0) gained.set(t.def.id, (gained.get(t.def.id) ?? 0) + d * MASTERY.killXp);
    }
    let changed = false;
    for (const [type, xp] of gained) {
      const lvl = meta.addMasteryXp(type, xp);
      if (lvl === null) continue;
      changed = true;
      const perk = lvl === MASTERY.veteranLevel ? 'Veteran: +8% range and a silver banner' : lvl === MASTERY.masterLevel ? 'Master: 12% faster firing and a golden crown' : `+${Math.round(lvl * MASTERY.damagePerLevel * 100)}% damage for every ${TOWERS[type].name}`;
      ui.banner(`${TOWERS[type].name} mastery ${lvl}${lvl >= MASTERY.veteranLevel ? ` · ${masteryTitle(lvl)}` : ''}`, perk);
      audio.play('upgrade');
    }
    if (changed) {
      this.run.applyMeta(meta.metaBonuses());
      this.view.refreshTowers();
    }
    meta.commit();
  }

  /** Bookkeeping shared by the kingdom and the Daily Challenge. */
  private bindCommonEvents(): void {
    const ev = this.run.events;
    const { ui, meta } = this.s;
    // Towers already standing when the battle opens don't re-earn their old kills.
    for (const t of this.run.towers) this.masteryKills.set(t.id, t.kills);
    ev.on('towerBuilt', (t) => this.masteryKills.set(t.id, 0));
    ev.on('waveStart', ({ index }) => {
      const now = nightOf(index), before = nightOf(index - 1);
      if (now >= 1 && before < 1) setTimeout(() => {
        ui.banner('Night falls', `Enemies drop ${Math.round(SIEGE.nightGold * 100)}% more gold in the dark`);
        this.s.audio.play('nightfall');
      }, 900);
      else if (now === 0 && before >= 1) setTimeout(() => {
        ui.banner('Dawn breaks', 'A new day over the kingdom');
        this.s.audio.play('dawn');
      }, 900);
      const wx = weatherOf(index);
      if (wx !== 'clear' && wx !== weatherOf(index - 1)) setTimeout(() => ui.banner(WEATHER_NAMES[wx][0], WEATHER_NAMES[wx][1]), 1600);
    });
    ev.on('waveCleared', ({ index }) => {
      this.wavesServed++;
      meta.passAdd('wave');
      this.flushMastery();
      if (nightOf(index) >= 1) meta.d.life.nightWaves = (meta.d.life.nightWaves ?? 0) + 1;
      if (weatherOf(index) !== 'clear') meta.d.life.weatherWaves = (meta.d.life.weatherWaves ?? 0) + 1;
    });
    ev.on('heroKill', ({ enemy: e, hero }) => {
      const xp = e.def.boss ? HERO_LEVELS.bossXp : e.elite ? HERO_LEVELS.eliteXp : Math.max(1, e.def.cost * HERO_LEVELS.xpPerCost);
      this.giveHeroXp(hero, xp);
    });
    ev.on('synergy', ({ synergy }) => {
      const def = SYNERGY_BY_ID[synergy];
      ui.banner(`Synergy: ${def.name}`, def.description);
    });
    ev.on('eliteKill', () => {
      meta.d.shards += ELITE_RULES.gems;
      meta.d.life.eliteKills++;
      meta.commit();
    });
    ev.on('enemyDeath', ({ enemy, bounty }) => {
      if (bounty <= 0 && !enemy.def.boss) return;
      meta.killedEnemy(enemy.def.id);
      if (enemy.def.boss) meta.d.life.bossKills++;
      if (enemy.def.flying) meta.d.life.flyingKills++;
    });
    ev.on('towerBuilt', () => meta.d.life.towersBuilt++);
    ev.on('towerUpgraded', (t) => {
      if (t.tier === MAX_TIER) meta.d.life.celestialTowers++;
    });
    ev.on('barricadeBuilt', () => meta.d.life.barricades++);
    ev.on('synergy', ({ synergy }) => {
      meta.d.life.synergies++;
      if (!meta.d.life.synergyTypes.includes(synergy)) meta.d.life.synergyTypes.push(synergy);
    });
    ev.on('heroAbility', () => meta.d.life.abilityUses++);
    ev.on('enemySpawn', (e) => {
      if (meta.sawEnemy(e.def.id) && this.run.waveIndex > 1 && !e.def.boss) {
        setTimeout(() => ui.toast(`New enemy discovered: ${e.def.name}! Check the Bestiary.`, 2800), 400);
      }
      if (e.def.boss) this.bossEntrance(e);
    });
  }

  /** Daily Challenge: count waves survived; the attempt ends when the castle falls. */
  private bindChallengeEvents(): void {
    const ev = this.run.events;
    const { ui, meta, audio } = this.s;
    ev.on('waveStart', ({ index }) => {
      const w = this.run.waveDef(index);
      if (!w?.boss) ui.banner(`Challenge wave ${index - this.challenge!.startWave + 1}`, ageTitle(index));
    });
    ev.on('waveCleared', () => {
      this.challengeScore++;
      meta.challengeProgress(this.challengeScore);
    });
    ev.on('defeat', () => {
      this.deselect();
      audio.play('defeat');
      this.flushMastery();
      setTimeout(() => this.onChallengeEnd(this.challengeScore), 1200);
    });
  }

  /** Something useful to try after a loss. */
  lossTip(): string {
    const { meta } = this.s;
    const run = this.run;
    if (!this.challenge && meta.featureUnlocked('shop') && meta.hasAffordableUpgrade()) return 'You can afford a permanent upgrade in the Shop: every tower gets stronger.';
    if (meta.bestWave() >= BARRICADE.unlockWave && run.barricades.length < run.barricadeLimit()) {
      return `Try another barricade on the road (${run.barricades.length}/${run.barricadeLimit()} placed): it holds enemies in your towers' range.`;
    }
    const free = [...run.unlockedSpots].filter((s) => !run.towerAt(s)).length;
    if (free > 0) return `${free} cleared pad${free > 1 ? 's are' : ' is'} still empty: one more tower could have made the difference.`;
    const low = run.towers.reduce((a, t) => (!a || t.tier < a.tier ? t : a), null as null | (typeof run.towers)[number]);
    if (low && low.tier < MAX_TIER) return `Upgrade your weakest tower (the ${low.def.name}, tier ${low.tier}).`;
    if (run.hero) return 'Station your hero beside the busiest road and save the ability for the boss.';
    return 'Mix tower types: frost slows enemies so cannons and mages land every hit.';
  }

  private bindRunEvents(): void {
    const ev = this.run.events;
    const { analytics, ui, meta, audio } = this.s;
    ev.on('waveStart', ({ index }) => {
      // Resuming always restarts the wave that was in progress.
      this.persist(true, index);
      const w = this.run.waveDef(index);
      // Boss waves are announced by the boss's own entrance card.
      if (w?.boss) { /* bossEntrance() */ }
      else if (index % SIEGE.ageEvery !== 0 || index === 0) ui.banner(`Wave ${index + 1}`, ageTitle(index));
    });
    ev.on('waveCleared', ({ index, gold }) => {
      for (const h of this.run.heroes) this.giveHeroXp(h, HERO_LEVELS.waveXpBase + HERO_LEVELS.waveXpPerWave * index);
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
    ev.on('ageChange', () => this.onAgeChange());
    ev.on('frontier', (f) => this.announceFrontier(f.wave, f.newAge, f.roads));
    ev.on('checkpoint', () => {
      if (this.run.castleHp >= this.run.castleMaxHp) meta.d.life.perfectCheckpoints++;
    });
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
    if (this.holdSim) {
      this.view.update(dt, 1);
      this.tutorial?.update();
      if (this.cinematicT > 0 && (this.cinematicT -= dt) <= 0) {
        this.holdSim = false;
        this.s.rig.clearFocus();
      }
      return;
    }
    if (!this.paused) {
      // Auto: call the next wave (with its early bonus) the moment the field is clear.
      const run = this.run;
      if (this.s.save.data.settings.autoWave && run.state === 'playing' && run.nextWaveTimer >= 0 && run.holdingFor < 0 && run.aliveCount() === 0) this.nextWave();
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
    // Achievements are cheap to check; do it a couple of times a second.
    if ((this.achT -= dt) <= 0) {
      this.achT = 0.5;
      for (const a of this.s.meta.checkAchievements()) this.s.ui.achievement(a.name, a.description, a.reward.coins, a.reward.gems ?? 0);
    }
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
    // The tap lands on the ground; the heroes and the castle stand above it, so test where the
    // tap ray passes at their height instead.
    const c = run.map.castle;
    const cp = this.atHeight(x, z, 0.7);
    const onCastle = (c.x - x) ** 2 + (c.z - z) ** 2 < 0.75 * 0.75 || (c.x - cp.x) ** 2 + (c.z - cp.z) ** 2 < 0.75 * 0.75;
    let tapped: Hero | null = null;
    let tappedD = Math.min(0.5 * 0.5, bestD + 1e-6);
    for (const h of run.heroes) {
      const hp = this.atHeight(x, z, h.y + 0.35);
      const d = (h.x - hp.x) ** 2 + (h.z - hp.z) ** 2;
      if (d <= tappedD) {
        tappedD = d;
        tapped = h;
      }
    }
    // A tap on the castle picks the nearest hero on its walls.
    if (!tapped && onCastle && this.selHero < 0) {
      let bd = Infinity;
      for (const h of run.heroes) {
        if (h.post >= 0) continue;
        const d = (h.x - cp.x) ** 2 + (h.z - cp.z) ** 2;
        if (d < bd) {
          bd = d;
          tapped = h;
        }
      }
    }
    const sel = run.heroes[this.selHero] ?? null;
    if (tapped && (!sel || tapped === sel || tapped.post >= 0 || !onCastle)) {
      if (tapped === sel) this.setHeroSelected(-1), this.view.hideRange(), this.s.audio.play('select');
      else this.toggleHero(tapped.slot);
      return;
    }
    // A selected hero can be stationed on an empty pad, or back on the castle wall.
    if (sel) {
      const post = onCastle ? -1 : best;
      if ((post >= 0 || onCastle) && post !== sel.post && (post < 0 || (run.isSpotUnlocked(post) && !run.towerAt(post) && !run.heroAt(post)))) {
        const cost = run.heroMoveCost(sel);
        if (run.gold < cost) {
          this.s.audio.play('error');
          this.s.ui.toast(`Moving ${sel.def.name} costs ${cost} gold`);
          return;
        }
        if (run.stationHero(post, sel)) {
          this.setHeroSelected(-1);
          this.view.hideRange();
          this.tutorial?.onHeroMoved();
          this.persist();
          return;
        }
      }
      if (post === sel.post) {
        this.setHeroSelected(-1);
        this.view.hideRange();
        return;
      }
      this.setHeroSelected(-1);
      this.view.hideRange();
    }
    if (best >= 0) {
      this.selectSpot(best);
      return;
    }
    // Tapping an open road tile offers a barricade there.
    const col = worldToTile(x), row = worldToTile(z);
    if (run.isOpenRoadTile(col, row) || run.barricadeAt(col, row)) {
      if (this.s.meta.bestWave() < BARRICADE.unlockWave && !run.barricadeAt(col, row)) {
        this.s.ui.toast(`Barricades unlock at wave ${BARRICADE.unlockWave}`);
        this.deselect();
        return;
      }
      // Same tile again: close it.
      const [wc, wr] = this.hud.wallTile;
      if (this.hud.mode === 'wall' && wc === col && wr === row) {
        this.deselect();
        return;
      }
      this.setHeroSelected(-1);
      this.view.highlightSpot(-1);
      this.view.hideRange();
      this.view.highlightTile(col, row);
      this.hud.openWall(col, row);
      this.s.audio.play('select');
      return;
    }
    this.deselect();
  }

  /** Where the camera ray through ground point (x, z) passes height y. */
  private atHeight(x: number, z: number, y: number): { x: number; z: number } {
    const cam = this.s.renderer.camera.position;
    if (cam.y <= y + 0.01) return { x, z };
    const k = y / cam.y;
    return { x: x + (cam.x - x) * k, z: z + (cam.z - z) * k };
  }

  buildWall(): void {
    const [c, r] = this.hud.wallTile;
    const run = this.run;
    if (run.barricades.length >= run.barricadeLimit()) return this.s.ui.toast(`You can have ${run.barricadeLimit()} barricades (one more per Age)`);
    if (run.gold < run.barricadeCost()) {
      this.s.audio.play('error');
      return this.s.ui.toast('Not enough gold');
    }
    if (run.placeBarricade(c, r)) {
      this.s.audio.play('build');
      this.persist();
    }
  }

  repairWall(): void {
    const b = this.run.barricadeAt(...this.hud.wallTile);
    if (b && this.run.repairBarricade(b)) {
      this.s.audio.play('upgrade');
      this.persist();
    } else this.s.audio.play('error');
  }

  removeWall(): void {
    const b = this.run.barricadeAt(...this.hud.wallTile);
    if (!b) return;
    this.run.removeBarricade(b);
    this.deselect();
    this.persist();
  }

  private selectSpot(spot: number): void {
    // Tapping the spot that's already open closes its panel.
    if (this.hud.mode !== 'none' && this.hud.mode !== 'wall' && this.hud.selectedSpot === spot) {
      this.deselect();
      return;
    }
    this.setHeroSelected(-1);
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
    this.view.highlightTile(-1, -1);
    this.view.highlightSpot(-1);
    this.view.hideRange();
    this.setHeroSelected(-1);
  }

  private setHeroSelected(slot: number): void {
    if ((this.selHero >= 0) !== (slot >= 0)) this.view.heroPostHints(slot >= 0);
    this.selHero = slot;
    this.view.selectedHero = slot;
    this.hud.setHeroSelected(slot);
  }

  /** Selects (or deselects) the hero in a slot. */
  toggleHero(slot = 0): void {
    const run = this.run;
    const h = run.heroes[slot];
    if (!h) return;
    const on = this.selHero !== slot;
    this.hud.closeCtx();
    this.view.highlightSpot(-1);
    this.view.hideRange();
    this.setHeroSelected(on ? slot : -1);
    if (on) {
      this.view.showRange(h.x, h.z, run.heroRange(h), '#7dff9a');
      const cost = run.heroMoveCost(h);
      const where = h.post < 0 ? 'an empty pad' : 'an empty pad or the castle';
      this.s.ui.toast(cost > 0 ? `Tap ${where} to move ${h.def.name} (${cost} gold)` : `Tap ${where} to station ${h.def.name} there. Free, once!`);
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
    if (this.run.gold < this.run.landCost(spot)) return this.notEnoughGold();
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
    // Holding before a new Age or road (the player chose to build first): start it now.
    if (this.run.holdingFor >= 0) {
      if (this.holdSim) return;
      this.s.audio.play('waveStart');
      this.run.continueFrontier();
      return;
    }
    if (this.run.callNextWave()) this.tutorial?.onWaveStarted();
  }

  ability(slot = 0): void {
    const h = this.run.heroes[slot];
    if (!h) return;
    if (this.run.state === 'prep') {
      this.s.ui.toast('Start the wave first!');
      return;
    }
    if (!this.run.heroAbilityReady(h)) {
      this.s.audio.play('error');
      return;
    }
    if (!this.run.useHeroAbility(h)) {
      this.s.ui.toast(`No enemies in range of ${h.def.name}`);
      this.s.audio.play('error');
    }
  }

  toggleSpeed(): void {
    this.speed = this.speed >= 3 ? 1 : this.speed + 1;
    this.hud.setSpeed(this.speed);
    this.s.save.data.settings.speed = this.speed;
    this.s.save.markDirty();
  }

  castSpell(id: SpellId): void {
    const run = this.run;
    const { ui, audio, meta } = this.s;
    if (run.state === 'prep') return ui.toast('Start the wave first!');
    if ((run.spellCd[id] ?? 0) > 0) return audio.play('error');
    if (!run.castSpell(id)) {
      audio.play('error');
      ui.toast(id === 'repair' ? 'The castle is already at full strength' : 'No enemies to target');
      return;
    }
    meta.d.life.spellsCast = (meta.d.life.spellsCast ?? 0) + 1;
    if (id === 'blessing') ui.banner('Gold Blessing!', `Double gold for ${Math.round(run.blessingT)} seconds`);
    else if (id === 'freeze') ui.banner('Deep Freeze!', 'Every enemy is frozen in place');
  }

  toggleAuto(): void {
    const st = this.s.save.data.settings;
    st.autoWave = !st.autoWave;
    this.hud.setAuto(st.autoWave);
    this.s.save.markDirty();
    this.s.ui.toast(st.autoWave ? 'Auto: the next wave starts as soon as the field is clear' : 'Auto off');
  }

  /** Re-applies permanent upgrades bought in the shop mid-siege. */
  applyMeta(): void {
    if (this.challenge) return;
    this.run.applyMeta(this.s.meta.metaBonuses());
    this.view.setCastleLook(this.s.meta.castleTier(), (this.s.meta.d.meta.battlements ?? 0) > 0);
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
