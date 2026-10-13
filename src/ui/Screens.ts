// Title (main menu) and world map screens.

import { el, $, fmt, fmtTime } from './dom';
import { icon, ICONS } from './icons';
import * as Modals from './Modals';
import type { Game } from '../game/Game';
import { CHAPTERS, LEVELS_PER_CHAPTER, TOTAL_LEVELS, FEATURE_UNLOCK_LEVEL, BOSS_EVERY } from '../data/levels';
import { buildEndlessLevel, buildWeeklyLevel, weekKey } from '../game/Levels';

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
          <button class="btn big play">${icon('play')} Play</button>
          <div class="row">
            <button class="btn blue endless">${icon('infinity')} Endless</button>
            <button class="btn wood weekly">${icon('trophy')} Weekly</button>
          </div>
        </div>
      </div>
      <button class="version">v1.0.0</button>`;
    const q = (s: string) => $(this.el, s);
    q('.play').onclick = () => game.goMap();
    q('.settings').onclick = () => Modals.settings(game);
    q('.shop').onclick = () => this.gate('shop', () => Modals.shop(game));
    q('.heroes').onclick = () => this.gate('heroes', () => Modals.heroes(game));
    q('.missions').onclick = () => this.gate('missions', () => Modals.missions(game));
    q('.daily').onclick = () => this.gate('dailyLogin', () => Modals.daily(game));
    q('.chest').onclick = () => this.gate('chests', () => Modals.chest(game));
    q('.treasury').onclick = () => this.gate('treasury', () => Modals.treasury(game));
    q('.endless').onclick = () => this.gate('endless', () => Modals.endlessIntro(game, buildEndlessLevel()));
    q('.weekly').onclick = () => this.gate('weekly', () => Modals.preLevel(game, buildWeeklyLevel(new Date())));
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

  private gate(f: keyof typeof FEATURE_UNLOCK_LEVEL, fn: () => void): void {
    const meta = this.game.s.meta;
    if (meta.featureUnlocked(f)) fn();
    else this.game.s.ui.toast(`Unlocks after clearing level ${FEATURE_UNLOCK_LEVEL[f]}`);
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
    const lock = (sel: string, f: keyof typeof FEATURE_UNLOCK_LEVEL) => $(this.el, sel).classList.toggle('locked', !meta.featureUnlocked(f));
    lock('.shop', 'shop');
    lock('.heroes', 'heroes');
    lock('.missions', 'missions');
    lock('.daily', 'dailyLogin');
    lock('.chest', 'chests');
    lock('.treasury', 'treasury');
    const endless = $(this.el, '.endless');
    endless.innerHTML = meta.featureUnlocked('endless')
      ? `${icon('infinity')} Endless<span class="sub">&nbsp;Best ${d.endless.bestWave}</span>`
      : `${icon('lock')} Endless<span class="sub">&nbsp;Lv ${FEATURE_UNLOCK_LEVEL.endless}</span>`;
    const weekly = $(this.el, '.weekly');
    const wk = weekKey(new Date());
    const cleared = d.weekly.week === wk && d.weekly.cleared;
    weekly.innerHTML = meta.featureUnlocked('weekly')
      ? `${icon('trophy')} Weekly${cleared ? '<span class="sub">&nbsp;✓</span>' : ''}`
      : `${icon('lock')} Weekly<span class="sub">&nbsp;Lv ${FEATURE_UNLOCK_LEVEL.weekly}</span>`;
    const lvl = Math.min(meta.levelsCompleted() + 1, TOTAL_LEVELS);
    $(this.el, '.play').innerHTML = `${icon('play')} Play<span class="sub" style="margin-left:6px">Lv ${lvl}</span>`;
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

export class MapScreen {
  readonly el: HTMLElement;
  private chapter = 0;

  constructor(private game: Game) {
    this.el = el('div', 'map-screen');
    this.el.innerHTML = `
      <div class="topbar">
        <button class="btn icon ghost back" aria-label="Back">${ICONS.home}</button>
        <div class="pill coins">${icon('coin')}<span class="v">0</span></div>
        <div class="grow"></div>
        <div class="pill stars">${icon('star')}<span class="v">0</span></div>
        <button class="btn small gold shopbtn">${icon('shop')}Shop<i class="dot"></i></button>
      </div>
      <div class="chapter-tabs"></div>
      <div class="map-board"><svg class="road"></svg><div class="map-nodes"></div></div>`;
    $(this.el, '.back').onclick = () => game.goTitle();
    $(this.el, '.shopbtn').onclick = () => {
      if (game.s.meta.featureUnlocked('shop')) Modals.shop(game);
      else game.s.ui.toast(`Shop unlocks after level ${FEATURE_UNLOCK_LEVEL.shop}`);
    };
    window.addEventListener('resize', () => requestAnimationFrame(() => this.drawRoad()));
  }

  open(chapter?: number): void {
    const meta = this.game.s.meta;
    this.chapter = chapter ?? Math.min(CHAPTERS.length - 1, Math.floor(Math.min(meta.levelsCompleted(), TOTAL_LEVELS - 1) / LEVELS_PER_CHAPTER));
    this.render();
  }

  render(): void {
    const meta = this.game.s.meta;
    $(this.el, '.coins .v').textContent = fmt(meta.d.coins);
    $(this.el, '.stars .v').textContent = `${meta.totalStars()}/${TOTAL_LEVELS * 3}`;
    $(this.el, '.shopbtn .dot').classList.toggle('on', meta.notifications().upgrades);
    const tabs = $(this.el, '.chapter-tabs');
    tabs.innerHTML = CHAPTERS.map((c, i) => {
      const unlocked = meta.isLevelUnlocked(i * LEVELS_PER_CHAPTER);
      return `<button class="chapter-tab ${i === this.chapter ? 'on' : ''} ${unlocked ? '' : 'locked'}" data-c="${i}">${unlocked ? '' : '🔒 '}${c.theme.name}</button>`;
    }).join('');
    tabs.querySelectorAll<HTMLButtonElement>('.chapter-tab').forEach((b) => {
      b.onclick = () => {
        const c = Number(b.dataset.c);
        if (!meta.isLevelUnlocked(c * LEVELS_PER_CHAPTER)) {
          this.game.s.ui.toast(`Clear ${CHAPTERS[c - 1].theme.name} to unlock ${CHAPTERS[c].theme.name}`);
          return;
        }
        this.chapter = c;
        this.render();
      };
    });

    const theme = CHAPTERS[this.chapter].theme;
    const board = $(this.el, '.map-board');
    board.style.background = `radial-gradient(circle at 30% 20%, ${theme.grassAlt}, transparent 60%), radial-gradient(circle at 80% 85%, ${theme.cliff}55, transparent 55%), linear-gradient(160deg, ${theme.grass}, ${theme.grassAlt})`;

    const portrait = this.game.orientation === 'portrait';
    const cols = portrait ? 3 : 5;
    const rows = Math.ceil(LEVELS_PER_CHAPTER / cols);
    const nodes = $(this.el, '.map-nodes');
    nodes.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    nodes.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    const current = meta.levelsCompleted();
    let html = '';
    for (let i = 0; i < LEVELS_PER_CHAPTER; i++) {
      const g = this.chapter * LEVELS_PER_CHAPTER + i;
      const row = Math.floor(i / cols);
      const col = row % 2 === 0 ? i % cols : cols - 1 - (i % cols);
      const unlocked = meta.isLevelUnlocked(g);
      const stars = meta.stars(g);
      const boss = (i + 1) % BOSS_EVERY === 0;
      const cls = [!unlocked ? 'locked' : stars > 0 ? 'done' : '', boss && unlocked ? 'boss' : '', g === current ? 'current' : ''].join(' ');
      const starHtml = unlocked ? [0, 1, 2].map((k) => icon(k < stars ? 'star' : 'starEmpty')).join('') : '';
      html += `<div class="map-node" style="grid-row:${row + 1};grid-column:${col + 1}">
        ${boss ? `<span class="node-skull">${ICONS.skull}</span>` : ''}
        <button class="node-btn ${cls}" data-g="${g}">${unlocked ? g + 1 : `<span class="lockico" style="display:inline-block;width:26px;height:26px">${ICONS.lock}</span>`}</button>
        <div class="node-stars">${starHtml}</div></div>`;
    }
    nodes.innerHTML = html;
    nodes.querySelectorAll<HTMLButtonElement>('.node-btn').forEach((b) => {
      b.onclick = () => {
        const g = Number(b.dataset.g);
        if (!meta.isLevelUnlocked(g)) {
          this.game.s.ui.toast('Clear the previous level first');
          return;
        }
        Modals.preLevelCampaign(this.game, g);
      };
    });
    requestAnimationFrame(() => this.drawRoad());
  }

  private drawRoad(): void {
    const board = this.el.querySelector('.map-board') as HTMLElement | null;
    if (!board || board.offsetParent === null) return;
    const svg = $(this.el, 'svg.road');
    const br = board.getBoundingClientRect();
    const pts: [number, number][] = [];
    const btns = [...this.el.querySelectorAll<HTMLElement>('.node-btn')];
    btns.sort((a, b) => Number(a.dataset.g) - Number(b.dataset.g));
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      pts.push([r.left + r.width / 2 - br.left, r.top + r.height / 2 - br.top]);
    }
    if (pts.length < 2) return;
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      d += ` Q${x0 === x1 ? x0 + 30 : mx},${y0 === y1 ? my - 18 : my} ${x1},${y1}`;
    }
    svg.setAttribute('viewBox', `0 0 ${br.width} ${br.height}`);
    svg.innerHTML = `<path d="${d}" stroke="rgba(0,0,0,.18)" stroke-width="22" fill="none" stroke-linecap="round" transform="translate(0,4)"/>
      <path d="${d}" stroke="${CHAPTERS[this.chapter].theme.path}" stroke-width="18" fill="none" stroke-linecap="round"/>
      <path d="${d}" stroke="rgba(255,255,255,.5)" stroke-width="3" fill="none" stroke-dasharray="8 10" stroke-linecap="round"/>`;
  }
}
