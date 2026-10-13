// Title (main menu) screen. Your own kingdom is rendered behind it.

import { el, $, fmt, fmtTime } from './dom';
import { icon } from './icons';
import * as Modals from './Modals';
import type { Game } from '../game/Game';
import { UNLOCK_WAVE } from '../data/base';
import { ageTitle, checkpointOf } from '../game/Siege';

export class TitleScreen {
  readonly el: HTMLElement;
  private lastTick = 0;
  private versionTaps = 0;
  private dailyShownFor = '';

  constructor(private game: Game) {
    this.el = el('div', 'title-screen');
    this.el.innerHTML = `
      <div class="topbar">
        <div class="pill coins">${icon('coin')}<span class="v">0</span></div>
        <div class="pill shards">${icon('gem')}<span class="v">0</span></div>
        <div class="grow"></div>
        <button class="btn icon ghost settings" aria-label="Settings">${icon('gear')}</button>
      </div>
      <div class="logo">Tiny Kingdom<span>Defender</span></div>
      <div class="menu-main">
        <div class="menu-side">
          <button class="side-btn shop">${icon('shop')}Shop<i class="dot"></i></button>
          <button class="side-btn heroes">${icon('hero')}Heroes</button>
          <button class="side-btn missions">${icon('scroll')}Missions<i class="dot"></i></button>
          <button class="side-btn daily">${icon('calendar')}Daily<i class="dot"></i></button>
          <button class="side-btn chest">${icon('chest')}Chest<i class="dot"></i><span class="timer"></span></button>
          <button class="side-btn treasury">${icon('castle')}Treasury<i class="dot"></i><span class="timer"></span></button>
        </div>
        <div class="stack" style="display:flex;flex-direction:column;gap:10px;align-items:center">
          <div class="kingdom-card"></div>
          <button class="btn big play">${icon('play')} Play</button>
        </div>
      </div>
      <button class="version">v1.0.0</button>`;
    const q = (s: string) => $(this.el, s);
    q('.play').onclick = () => game.enterKingdom();
    q('.settings').onclick = () => Modals.settings(game);
    q('.shop').onclick = () => this.gate('shop', () => Modals.shop(game));
    q('.heroes').onclick = () => this.gate('heroes', () => Modals.heroes(game));
    q('.missions').onclick = () => this.gate('missions', () => Modals.missions(game));
    q('.daily').onclick = () => this.gate('dailyLogin', () => Modals.daily(game));
    q('.chest').onclick = () => this.gate('chests', () => Modals.chest(game));
    q('.treasury').onclick = () => this.gate('treasury', () => Modals.treasury(game));
    q('.version').onclick = () => {
      if (++this.versionTaps >= 5) {
        this.versionTaps = 0;
        Modals.debug(game);
      }
    };
    window.addEventListener('keydown', (e) => {
      if (e.key === '`' || e.key === '~') Modals.debug(game);
    });
  }

  private gate(f: keyof typeof UNLOCK_WAVE, fn: () => void): void {
    const meta = this.game.s.meta;
    if (meta.featureUnlocked(f)) fn();
    else this.game.s.ui.toast(`Unlocks when you reach wave ${UNLOCK_WAVE[f]}`);
  }

  onEnter(): void {
    const meta = this.game.s.meta;
    meta.refreshMissions();
    const st = meta.dailyStatus();
    const today = new Date().toDateString();
    if (meta.featureUnlocked('dailyLogin') && st.available && this.dailyShownFor !== today) {
      this.dailyShownFor = today;
      setTimeout(() => {
        if (this.game.s.ui.currentScreen === 'title' && !this.game.s.ui.modalOpen) Modals.daily(this.game);
      }, 600);
    }
  }

  render(): void {
    const { meta } = this.game.s;
    const d = meta.d;
    $(this.el, '.coins .v').textContent = fmt(d.coins);
    $(this.el, '.shards .v').textContent = fmt(d.shards);
    const n = meta.notifications();
    const setDot = (sel: string, on: boolean) => $(this.el, `${sel} .dot`).classList.toggle('on', on);
    setDot('.shop', n.upgrades);
    setDot('.missions', n.missions);
    setDot('.daily', n.daily);
    setDot('.chest', n.chest);
    setDot('.treasury', n.treasury);
    const lock = (sel: string, f: keyof typeof UNLOCK_WAVE) => $(this.el, sel).classList.toggle('locked', !meta.featureUnlocked(f));
    lock('.shop', 'shop');
    lock('.heroes', 'heroes');
    lock('.missions', 'missions');
    lock('.daily', 'dailyLogin');
    lock('.chest', 'chests');
    lock('.treasury', 'treasury');
    const base = d.base;
    const wave = base ? base.wave : 0;
    const card = $(this.el, '.kingdom-card');
    card.innerHTML = base
      ? `<b>${ageTitle(wave)}</b> · Wave ${wave + 1}<br/><span>⚑ Checkpoint ${base.checkpoint ?? checkpointOf(wave)} · Best ${meta.bestWave()} · ${base.towers.length} towers</span>`
      : `<b>Found your kingdom</b><br/><span>Build, upgrade and hold out for as long as you can</span>`;
    $(this.el, '.play').innerHTML = `${icon('play')} ${base ? 'Defend' : 'Begin'}`;
    this.tick(true);
  }

  tick(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastTick < 500) return;
    this.lastTick = now;
    const meta = this.game.s.meta;
    const chestT = $(this.el, '.chest .timer');
    if (meta.featureUnlocked('chests')) {
      chestT.style.display = '';
      chestT.textContent = meta.d.chest.pendingMilestone > 0 ? `×${meta.d.chest.pendingMilestone + (meta.freeChestReady() ? 1 : 0)}` : meta.freeChestReady() ? 'Ready!' : fmtTime(meta.freeChestRemaining());
    } else chestT.style.display = 'none';
    const tr = $(this.el, '.treasury .timer');
    if (meta.featureUnlocked('treasury')) {
      tr.style.display = '';
      tr.innerHTML = `${meta.treasuryAmount()}${meta.treasuryFull() ? ' FULL' : ''}`;
    } else tr.style.display = 'none';
    if (force) return;
    const n = meta.notifications();
    $(this.el, '.chest .dot').classList.toggle('on', n.chest);
    $(this.el, '.treasury .dot').classList.toggle('on', n.treasury);
  }
}
