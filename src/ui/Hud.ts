// In-battle HUD: resources, wave control, hero, build menu and tower cards.

import { el, $, fmt } from './dom';
import { icon, ICONS } from './icons';
import { towerThumb, enemyThumb, heroThumb } from './Thumbnails';
import { TOWERS, TOWER_ORDER, type TowerId, type TargetMode, type TowerStats } from '../data/towers';
import { TOWER_UNLOCK_WAVE } from '../data/base';
import { MAX_TIER, BRANCH_TIER, materialFor, levelName, starsOf } from '../data/towers';
import { ageTitle } from '../game/Siege';
import { waveSummary } from '../game/WaveComposer';
import { SYNERGIES, SYNERGY_BY_ID } from '../data/synergies';
import type { Run, Tower } from '../game/Run';

export interface HudCallbacks {
  pause(): void;
  toggleSpeed(): void;
  nextWave(): void;
  selectHero(): void;
  ability(): void;
  buildPreview(id: TowerId | null): void;
  build(id: TowerId): void;
  upgrade(branch: number): void;
  sell(): void;
  targetMode(mode: TargetMode): void;
  closeCtx(): void;
  clearLand(): void;
  buildWall(): void;
  repairWall(): void;
  removeWall(): void;
  shop(): void;
}

const ABILITY_ICON = { arrowRain: 'arrows', taunt: 'shield', meteor: 'meteor', quake: 'quake', holyLight: 'holy', shadowStrike: 'shadow' } as const;

export class Hud {
  readonly el: HTMLElement;
  private goldEl: HTMLElement;
  private goldPill: HTMLElement;
  private hpEl: HTMLElement;
  private hpPill: HTMLElement;
  private waveEl: HTMLElement;
  private nextBtn: HTMLButtonElement;
  private previewEl: HTMLElement;
  private speedBtn: HTMLButtonElement;
  private heroBtn: HTMLButtonElement;
  private heroWrap: HTMLElement;
  private abilityBtn: HTMLButtonElement;
  private abilityCd: HTMLElement;
  private rushPill: HTMLElement;
  private ageEl: HTMLElement;
  private ctx: HTMLElement;
  private vignette: HTMLElement;
  private fpsEl: HTMLElement;
  private run: Run | null = null;
  private ctxMode: 'none' | 'build' | 'tower' | 'land' | 'wall' = 'none';
  private ctxTile: [number, number] = [0, 0];
  private ctxSpot = -1;
  private ctxTower: Tower | null = null;
  private previewId: TowerId | null = null;
  private lastGold = -1;
  private lastHp = -1;
  private lastWaveKey = '';
  private lastCtxKey = '';
  private sellArmedUntil = 0;

  constructor(private cb: HudCallbacks) {
    this.el = el('div', 'hud');
    this.el.innerHTML = `
      <div class="vignette"></div>
      <div class="hud-top">
        <div class="pill hp">${icon('heart')}<span class="v">20</span></div>
        <div class="pill gold-pill">${icon('coin')}<span class="v">0</span></div>
        <div class="pill wave-pill"><span class="v">Wave 0</span><span class="age"></span></div>
        <div class="grow"></div>
        <button class="btn icon gold shop-btn" aria-label="Shop">${icon('shop')}</button>
        <button class="btn icon blue pause-btn" aria-label="Pause">${icon('pause')}</button>
      </div>
      <div class="hud-hero">
        <button class="hero-btn" aria-label="Select hero"><img alt=""/><div class="hpring"></div><div class="dead">0</div></button>
        <button class="ability-btn" aria-label="Hero ability"><span class="ico"></span><span class="cd"></span></button>
      </div>
      <div class="rush-pill" style="display:none"></div>
      <div class="hud-actions">
        <div class="next-wave">
          <div class="wave-preview"></div>
          <div style="display:flex;gap:8px">
            <button class="btn blue speed-btn" aria-label="Game speed">1x</button>
            <button class="btn next-btn">Start</button>
          </div>
        </div>
      </div>
      <div class="ctx hidden"></div>
      <div class="fps" style="display:none"></div>`;
    this.vignette = $(this.el, '.vignette');
    this.hpPill = $(this.el, '.pill.hp');
    this.hpEl = $(this.hpPill, '.v');
    this.goldPill = $(this.el, '.gold-pill');
    this.goldEl = $(this.goldPill, '.v');
    this.waveEl = $(this.el, '.wave-pill .v');
    this.nextBtn = $(this.el, '.next-btn') as HTMLButtonElement;
    this.previewEl = $(this.el, '.wave-preview');
    this.speedBtn = $(this.el, '.speed-btn') as HTMLButtonElement;
    this.heroWrap = $(this.el, '.hud-hero');
    this.heroBtn = $(this.el, '.hero-btn') as HTMLButtonElement;
    this.abilityBtn = $(this.el, '.ability-btn') as HTMLButtonElement;
    this.abilityCd = $(this.abilityBtn, '.cd');
    this.ctx = $(this.el, '.ctx');
    this.fpsEl = $(this.el, '.fps');

    $(this.el, '.pause-btn').onclick = () => cb.pause();
    this.speedBtn.onclick = () => cb.toggleSpeed();
    this.nextBtn.onclick = () => cb.nextWave();
    this.heroBtn.onclick = () => cb.selectHero();
    this.abilityBtn.onclick = () => cb.ability();
    this.rushPill = $(this.el, '.rush-pill');
    this.ageEl = $(this.el, '.wave-pill .age');
    $(this.el, '.shop-btn').onclick = () => cb.shop();
  }

  private challengeLabel: string | null = null;
  /** Challenge waves are numbered from 1. */
  private waveOffset = 0;

  /** Daily Challenge: label the wave pill and hide the shop (upgrades can't change mid-challenge). */
  setChallenge(label: string | null, startWave = 0): void {
    this.challengeLabel = label;
    this.waveOffset = label ? startWave : 0;
    this.lastWaveKey = '';
    this.waveEl.textContent = '';
    ($(this.el, '.shop-btn') as HTMLElement).style.display = label ? 'none' : '';
    this.el.classList.toggle('challenge', !!label);
  }

  bind(run: Run): void {
    this.run = run;
    this.lastGold = this.lastHp = -1;
    this.lastWaveKey = this.lastCtxKey = '';
    this.closeCtx();
    const hero = run.hero;
    this.heroWrap.style.display = hero ? '' : 'none';
    if (hero) {
      (this.heroBtn.querySelector('img') as HTMLImageElement).src = heroThumb(hero.def.id);
      $(this.abilityBtn, '.ico').innerHTML = ICONS[ABILITY_ICON[hero.def.ability.kind]];
    }
    this.setSpeed(1);
    this.setHeroSelected(false);
  }

  setSpeed(s: number): void {
    this.speedBtn.textContent = `${s}x`;
    this.speedBtn.classList.toggle('fast', s > 1);
  }

  setHeroSelected(on: boolean): void {
    this.heroBtn.classList.toggle('sel', on);
  }

  showFps(on: boolean, fps = 0): void {
    this.fpsEl.style.display = on ? 'block' : 'none';
    if (on) this.fpsEl.textContent = `${fps} fps`;
  }

  castleHit(): void {
    this.hpPill.classList.remove('hit');
    void this.hpPill.offsetWidth;
    this.hpPill.classList.add('hit');
    this.vignette.classList.add('hit');
    setTimeout(() => this.vignette.classList.remove('hit'), 250);
  }

  bumpGold(): void {
    this.goldPill.classList.remove('bump');
    void this.goldPill.offsetWidth;
    this.goldPill.classList.add('bump');
  }

  get goldTarget(): HTMLElement {
    return this.goldPill;
  }

  rectOf(sel: 'next' | 'hero' | 'ability' | 'card-archer' | 'upgrade' | 'speed'): { x: number; y: number } | null {
    const map: Record<string, Element | null> = {
      next: this.nextBtn, hero: this.heroBtn, ability: this.abilityBtn, speed: this.speedBtn,
      'card-archer': this.ctx.querySelector('[data-tower="archer"]'),
      upgrade: this.ctx.querySelector('.upgrade-btn, .branch-btn'),
    };
    const e = map[sel];
    if (!e || (e as HTMLElement).offsetParent === null) return null;
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // --- Per-frame ------------------------------------------------------------------

  update(): void {
    const run = this.run;
    if (!run) return;
    if (run.gold !== this.lastGold) {
      this.lastGold = run.gold;
      this.goldEl.textContent = fmt(run.gold);
    }
    if (run.castleHp !== this.lastHp) {
      this.lastHp = run.castleHp;
      this.hpEl.textContent = String(run.castleHp);
    }
    const shown = run.state === 'prep' ? run.waveIndex + 1 : Math.max(1, run.waveIndex);
    const waveTxt = `Wave ${shown - this.waveOffset}`;
    if (this.waveEl.textContent !== waveTxt) {
      this.waveEl.textContent = waveTxt;
      const cp = run.lastCheckpoint;
      this.ageEl.textContent = this.challengeLabel ? `⚔ ${this.challengeLabel}` : `${ageTitle(shown - 1)}${cp > 0 ? ` · ⚑ ${cp}` : ''}`;
    }

    // Next-wave button.
    const canCall = run.state === 'prep' || run.nextWaveTimer >= 0;
    let label: string;
    if (run.state === 'prep') label = `${ICONS.play} ${run.waveIndex > 0 ? 'Resume' : 'Start'}`;
    else if (canCall) label = `Next <span class="cost">+${run.earlyCallBonus()}${ICONS.coin}</span>`;
    else label = 'Incoming…';
    const key = `${run.state}|${canCall}|${run.earlyCallBonus()}|${run.waveIndex}`;
    if (key !== this.lastWaveKey) {
      this.lastWaveKey = key;
      this.nextBtn.innerHTML = label.replace(ICONS.coin, `<span class="ico" style="width:18px;height:18px">${ICONS.coin}</span>`);
      this.nextBtn.disabled = !canCall;
      this.nextBtn.classList.toggle('start', run.state === 'prep');
      this.renderPreview();
    }

    // Hero.
    const hero = run.hero;
    if (hero) {
      this.heroBtn.classList.toggle('isdead', hero.dead);
      if (hero.dead) $(this.heroBtn, '.dead').textContent = String(Math.ceil(hero.respawn));
      const frac = hero.dead ? 0 : hero.hp / hero.maxHp;
      ($(this.heroBtn, '.hpring') as HTMLElement).style.boxShadow = `inset 0 0 0 4px ${frac > 0.5 ? '#59e05a' : frac > 0.25 ? '#ffcf3f' : '#ef5b4c'}`;
      const ready = run.heroAbilityReady();
      this.abilityBtn.classList.toggle('ready', ready);
      const cdFrac = Math.max(0, hero.abilityCd / hero.def.ability.cooldown);
      this.abilityCd.textContent = hero.abilityCd > 0 && !hero.dead ? String(Math.ceil(hero.abilityCd)) : '';
      this.abilityCd.style.background = hero.abilityCd > 0 || hero.dead
        ? `conic-gradient(rgba(20,10,40,.65) ${cdFrac * 360}deg, rgba(0,0,0,0) 0)` : 'none';
    }

    // Gold Rush indicator (from saves made while it was a rewarded placement).
    const rushTxt = run.goldRushWaves > 0 ? `${ICONS.coin.replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-4px"')} 2× gold · ${run.goldRushWaves} wave${run.goldRushWaves > 1 ? 's' : ''}` : '';
    if (this.rushPill.dataset.t !== rushTxt) {
      this.rushPill.dataset.t = rushTxt;
      this.rushPill.innerHTML = rushTxt;
      this.rushPill.style.display = rushTxt ? '' : 'none';
    }

    // Keep the context panel fresh (affordability etc.).
    if (this.ctxMode !== 'none') {
      const t = this.ctxTower;
      // Only re-render on meaningful changes so taps are never swallowed by a DOM swap.
      const afford = this.ctxMode === 'build'
        ? TOWER_ORDER.map((id) => (run.gold >= TOWERS[id].cost ? 1 : 0)).join('') + run.config.availableTowers.join()
        : this.ctxMode === 'land'
          ? String(run.gold >= run.clearLandCost())
          : this.ctxMode === 'wall'
            ? this.wallKey()
          : String(t && run.gold >= (run.upgradeCost(t) ?? Infinity));
      const ctxKey = `${this.ctxMode}|${performance.now() < this.sellArmedUntil}|${afford}|${t?.tier}|${t?.branch}|${t?.targetMode}|${t?.synergies.join()}|${this.previewId}`;
      if (t) {
        const k = this.ctx.querySelector('.kills');
        if (k) k.textContent = `☠ ${t.kills}`;
      }
      if (ctxKey !== this.lastCtxKey) {
        this.lastCtxKey = ctxKey;
        if (this.ctxMode === 'build') this.renderBuild();
        else if (this.ctxMode === 'land') this.renderLand();
        else if (this.ctxMode === 'wall') this.renderWall();
        else this.renderTower();
      }
    }
  }

  private renderPreview(): void {
    const run = this.run!;
    if (run.waveIndex >= run.totalWaves) {
      this.previewEl.style.display = 'none';
      return;
    }
    const w = run.waveDef(run.waveIndex);
    if (!w) {
      this.previewEl.style.display = 'none';
      return;
    }
    this.previewEl.style.display = '';
    const items = waveSummary(w)
      .map((s) => `<span class="en"><img src="${enemyThumb(s.enemy)}" alt="${s.enemy}"/>×${s.count}</span>`)
      .join('');
    this.previewEl.innerHTML = `<span class="lbl">${w.boss ? '☠ BOSS' : 'Next'}</span>${items}`;
  }

  // --- Context panel -------------------------------------------------------------------

  openBuild(spot: number): void {
    this.ctxMode = 'build';
    this.ctxSpot = spot;
    this.ctxTower = null;
    this.previewId = null;
    this.lastCtxKey = '';
    this.ctx.classList.remove('hidden');
    this.renderBuild();
  }

  openLand(spot: number): void {
    this.ctxMode = 'land';
    this.ctxSpot = spot;
    this.ctxTower = null;
    this.lastCtxKey = '';
    this.ctx.classList.remove('hidden');
    this.renderLand();
  }

  openWall(col: number, row: number): void {
    this.ctxMode = 'wall';
    this.ctxTile = [col, row];
    this.ctxSpot = -1;
    this.ctxTower = null;
    this.lastCtxKey = '';
    this.ctx.classList.remove('hidden');
    this.renderWall();
  }

  get wallTile(): [number, number] {
    return this.ctxTile;
  }

  private wallKey(): string {
    const run = this.run!;
    const b = run.barricadeAt(this.ctxTile[0], this.ctxTile[1]);
    return b ? `b${Math.ceil((b.hp / b.maxHp) * 20)}|${run.gold >= run.repairCost(b)}` : `n${run.gold >= run.barricadeCost()}|${run.barricades.length}`;
  }

  private renderWall(): void {
    const run = this.run!;
    const [c, r] = this.ctxTile;
    const b = run.barricadeAt(c, r);
    if (b) {
      const frac = Math.max(0, b.hp / b.maxHp);
      const repair = run.repairCost(b);
      this.ctx.innerHTML = `
        <div class="ctx-head"><span class="name">Barricade</span><button class="x" aria-label="Close">✕</button></div>
        <div class="wall-hp"><i style="width:${Math.round(frac * 100)}%"></i><span>${Math.ceil(b.hp)} / ${Math.round(b.maxHp)}</span></div>
        <div class="ctx-row">
          <button class="btn repair-btn ${repair <= 0 || run.gold < repair ? 'disabled' : ''}">${repair > 0 ? `Repair <span class="cost">${icon('coin')}${repair}</span>` : 'Full strength'}</button>
          <button class="btn red small remove-btn">Remove</button>
        </div>`;
      $(this.ctx, '.repair-btn').onclick = () => this.cb.repairWall();
      $(this.ctx, '.remove-btn').onclick = () => this.cb.removeWall();
    } else {
      const cost = run.barricadeCost();
      const full = run.barricades.length >= run.barricadeLimit();
      this.ctx.innerHTML = `
        <div class="ctx-head"><span class="name">Barricade</span><button class="x" aria-label="Close">✕</button></div>
        <div class="ctx-info" style="margin:0 0 8px">Blocks the road. Enemies stop to smash through it while your towers pound them. Flyers go over; burrowers go under. ${run.barricades.length}/${run.barricadeLimit()} built (one more per Age).</div>
        <div class="ctx-row"><button class="btn wall-btn ${full || run.gold < cost ? 'disabled' : ''}">${full ? 'Limit reached' : `Build barricade <span class="cost">${icon('coin')}${cost}</span>`}</button></div>`;
      $(this.ctx, '.wall-btn').onclick = () => this.cb.buildWall();
    }
    $(this.ctx, '.x').onclick = () => this.cb.closeCtx();
  }

  private renderLand(): void {
    const run = this.run!;
    const cost = run.clearLandCost();
    this.ctx.innerHTML = `
      <div class="ctx-head"><span class="name">Overgrown land</span><button class="x" aria-label="Close">✕</button></div>
      <div class="ctx-info" style="margin:0 0 8px">Clear it to get a new build pad. Each clearing costs more, so choose spots that cover the roads well.</div>
      <div class="ctx-row"><button class="btn land-btn ${run.gold < cost ? 'disabled' : ''}">Clear land <span class="cost">${icon('coin')}${cost}</span></button></div>`;
    $(this.ctx, '.x').onclick = () => this.cb.closeCtx();
    $(this.ctx, '.land-btn').onclick = () => this.cb.clearLand();
  }

  openTower(t: Tower): void {
    this.ctxMode = 'tower';
    this.ctxTower = t;
    this.ctxSpot = t.spot;
    this.sellArmedUntil = 0;
    this.previewId = null;
    this.lastCtxKey = '';
    this.ctx.classList.remove('hidden');
    this.renderTower();
  }

  closeCtx(): void {
    this.ctxMode = 'none';
    this.ctxTower = null;
    this.ctxSpot = -1;
    this.previewId = null;
    this.ctx.classList.add('hidden');
  }

  get selectedSpot(): number {
    return this.ctxSpot;
  }

  get mode(): 'none' | 'build' | 'tower' | 'land' | 'wall' {
    return this.ctxMode;
  }

  setPreview(id: TowerId | null): void {
    this.previewId = id;
    this.lastCtxKey = '';
  }

  private renderBuild(): void {
    const run = this.run!;
    const cards = TOWER_ORDER.map((id) => {
      const def = TOWERS[id];
      const available = run.isTowerAvailable(id);
      let lockText = '';
      if (!available) lockText = id === 'lightning' ? `Shop · W${TOWER_UNLOCK_WAVE[id]}` : `Wave ${TOWER_UNLOCK_WAVE[id]}`;
      const poor = run.gold < def.cost;
      const sel = this.previewId === id;
      return `<button class="tcard ${available ? '' : 'locked'} ${poor ? 'poor' : ''} ${sel ? 'sel' : ''}" data-tower="${id}">
        <img src="${towerThumb(id)}" alt=""/>
        <span>${def.name}</span>
        ${available ? `<span class="cost">${icon('coin')}${def.cost}</span>` : `<span class="cost" style="font-size:12px">${lockText}</span>`}
        ${available ? '' : `<span class="lock">${ICONS.lock}</span>`}
        <span class="confirm">${poor ? 'Need gold' : 'Tap to build'}</span>
      </button>`;
    }).join('');
    const info = this.previewId ? `${TOWERS[this.previewId].role}` : 'Choose a tower to see its range.';
    this.ctx.innerHTML = `
      <div class="ctx-head"><span class="name">Build tower</span><button class="x" aria-label="Close">✕</button></div>
      <div class="build-cards">${cards}</div>
      <div class="ctx-info">${info}</div>`;
    $(this.ctx, '.x').onclick = () => this.cb.closeCtx();
    this.ctx.querySelectorAll<HTMLButtonElement>('.tcard').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.tower as TowerId;
        if (!run.isTowerAvailable(id)) return;
        if (this.previewId === id) this.cb.build(id);
        else this.cb.buildPreview(id);
      };
    });
  }

  private statsBlock(st: TowerStats, next: TowerStats | null, id: TowerId): string {
    const rate = (s: TowerStats) => (1 / s.cooldown).toFixed(1);
    const delta = (a: number, b: number | undefined, digits = 0) => (b !== undefined && b > a + 0.01 ? `<span class="up">+${(b - a).toFixed(digits)}</span>` : '');
    const dmgLabel = st.multishot > 1 ? `${Math.round(st.damage)}×${st.multishot}` : `${Math.round(st.damage)}`;
    let special = '';
    if (st.aura) special = `<div>Aura<small>slow ${Math.round((1 - st.slowFactor) * 100)}%</small></div>`;
    else if (st.pierce > 0) special = `<div>${st.pierce}${delta(st.pierce, next?.pierce)}<small>PIERCE</small></div>`;
    else if (st.dot > 0) {
      const total = (s: TowerStats) => s.damage * s.dot * s.dotDuration;
      special = `<div>${Math.round(total(st))}${delta(total(st), next ? total(next) : undefined)}<small>${id === 'alchemist' ? 'POISON' : 'BURN'}</small></div>`;
    }
    else if (st.chains > 0) special = `<div>${st.chains}${delta(st.chains, next?.chains)}<small>CHAINS</small></div>`;
    else if (st.slowFactor < 1) special = `<div>${Math.round((1 - st.slowFactor) * 100)}%${delta((1 - st.slowFactor) * 100, next ? (1 - next.slowFactor) * 100 : undefined)}<small>SLOW</small></div>`;
    else if (st.splash > 0) special = `<div>${st.splash.toFixed(1)}${delta(st.splash, next?.splash, 1)}<small>SPLASH</small></div>`;
    else if (id === 'archer') special = `<div>${TOWERS[id].hitsAir ? 'Yes' : 'No'}<small>HITS AIR</small></div>`;
    return `<div class="tstats">
      <div>${dmgLabel}${delta(st.damage, next?.damage)}<small>DAMAGE</small></div>
      <div>${st.range.toFixed(1)}${delta(st.range, next?.range, 1)}<small>RANGE</small></div>
      <div>${rate(st)}${next && 1 / next.cooldown > 1 / st.cooldown + 0.05 ? `<span class="up">+${(1 / next.cooldown - 1 / st.cooldown).toFixed(1)}</span>` : ''}<small>SHOTS/S</small></div>
      ${special}
    </div>`;
  }

  /** Active synergies, and hints for the ones this tower could form. */
  private synergyBlock(t: Tower): string {
    const active = t.synergies.map((id) => SYNERGY_BY_ID[id]);
    const possible = SYNERGIES.filter((s) => s.towers.includes(t.def.id) && !t.synergies.includes(s.id));
    if (!active.length && !possible.length) return '';
    const chips = active.map((s) => `<span class="syn on" style="--sc:${s.color}" title="${s.description}">⚡ ${s.name}</span>`).join('');
    const hints = possible.map((s) => {
      const other = s.towers[0] === t.def.id ? s.towers[1] : s.towers[0];
      return `<span class="syn" style="--sc:${s.color}" title="${s.description}">+ ${TOWERS[other].name} → ${s.name}</span>`;
    }).join('');
    return `<div class="syns">${chips}${hints}</div>`;
  }

  private renderTower(): void {
    const run = this.run!;
    const t = this.ctxTower!;
    const def = t.def;
    const cost = run.upgradeCost(t);
    const mat = materialFor(t.tier);
    const pips = Array.from({ length: MAX_TIER }, (_, i) => `<i class="${t.tier > i ? 'on' : ''}" style="${t.tier > i ? `background:${materialFor(i + 1).body}` : ''}"></i>`).join('');
    const title = `${mat.name} ${t.tier > BRANCH_TIER ? def.branches[t.branch].name : def.name}${starsOf(t.tier) ? ` <span style="color:#e09a12">★${starsOf(t.tier)}</span>` : ''}`;
    let next: TowerStats | null = null;
    if (cost !== null && t.tier !== BRANCH_TIER) next = run.computeStats(def, t.tier + 1, t.branch);
    let upgrade = '';
    if (cost !== null && t.tier !== BRANCH_TIER) {
      const label = t.tier >= MAX_TIER ? `Empower to ★${starsOf(t.tier + 1)}` : `Upgrade to ${levelName(t.tier + 1)}`;
      upgrade = `<button class="btn upgrade-btn ${run.gold < cost ? 'disabled' : ''}">${label} <span class="cost">${icon('coin')}${cost}</span></button>`;
    } else if (cost !== null) {
      upgrade = def.branches.map((b, i) => `<button class="btn ${i === 0 ? '' : 'blue'} branch-btn ${run.gold < cost ? 'disabled' : ''}" data-branch="${i}">
        <span>${materialFor(t.tier + 1).name} ${b.name} <span class="cost">${icon('coin')}${cost}</span></span><small>${b.description}</small></button>`).join('');
    } else {
      upgrade = `<button class="btn gold disabled" disabled>★ ${levelName(t.tier)} · MAX</button>`;
    }
    const modes: TargetMode[] = ['first', 'strongest', 'closest'];
    const showTargets = !t.stats.aura;
    this.ctx.innerHTML = `
      <div class="ctx-head"><img src="${towerThumb(def.id, t.tier, t.branch)}" style="width:40px;height:40px" alt=""/>
        <span class="name">${title}<div class="tier-pips small">${pips}</div></span>
        <span class="muted kills">☠ ${t.kills}</span><button class="x" aria-label="Close">✕</button></div>
      ${this.statsBlock(t.stats, next, def.id)}
      ${this.synergyBlock(t)}
      ${showTargets ? `<div class="seg targets">${modes.map((m) => `<button data-mode="${m}" class="${t.targetMode === m ? 'on' : ''}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div>` : ''}
      <div class="ctx-row">${upgrade}</div>
      <div class="ctx-row" style="margin-top:6px"><button class="btn red small sell-btn">Sell <span class="cost">${icon('coin')}${run.sellValue(t)}</span></button></div>`;
    $(this.ctx, '.x').onclick = () => this.cb.closeCtx();
    this.ctx.querySelector<HTMLButtonElement>('.upgrade-btn')?.addEventListener('click', () => this.cb.upgrade(-1));
    this.ctx.querySelectorAll<HTMLButtonElement>('.branch-btn').forEach((b) => (b.onclick = () => this.cb.upgrade(Number(b.dataset.branch))));
    this.ctx.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => (b.onclick = () => this.cb.targetMode(b.dataset.mode as TargetMode)));
    const sell = $(this.ctx, '.sell-btn') as HTMLButtonElement;
    const armed = performance.now() < this.sellArmedUntil;
    if (armed) sell.innerHTML = 'Confirm sell?';
    sell.onclick = () => {
      if (performance.now() >= this.sellArmedUntil) {
        this.sellArmedUntil = performance.now() + 2000;
        this.lastCtxKey = '';
        return;
      }
      this.sellArmedUntil = 0;
      this.cb.sell();
    };
  }
}

