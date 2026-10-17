// Title (main menu) screen. Your own kingdom is rendered behind it.

import { el, $, fmt, fmtTime } from './dom';
import { icon } from './icons';
import * as Modals from './Modals';
import type { Game } from '../game/Game';
import { UNLOCK_WAVE } from '../data/base';
import { ageTitle, checkpointOf } from '../game/Siege';
import { MAPS, MAP_BY_ID } from '../data/maps';

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
          <button class="side-btn heroes">${icon('hero')}Heroes<i class="dot"></i></button>
          <button class="side-btn rewards">${icon('chest')}Rewards<i class="dot"></i><span class="timer"></span></button>
          <button class="side-btn kingdom-btn">${icon('town')}Kingdom<i class="dot"></i></button>
          <button class="side-btn records">${icon('trophy')}Records</button>
        </div>
        <div class="stack" style="display:flex;flex-direction:column;gap:10px;align-items:center">
          <div class="realm-pick" style="display:none">
            <button class="rp-arrow rp-prev" aria-label="Previous realm">‹</button>
            <button class="rp-cur" aria-label="All realms"></button>
            <button class="rp-arrow rp-next" aria-label="Next realm">›</button>
          </div>
          <div class="kingdom-card"></div>
          <button class="btn big play">${icon('play')} Play</button>
          <button class="btn purple challenge-btn">${icon('swords')} Daily Challenge<i class="dot"></i></button>
        </div>
      </div>
      <button class="version">v1.0.0</button>`;
    const q = (s: string) => $(this.el, s);
    q('.play').onclick = () => game.enterKingdom();
    q('.settings').onclick = () => Modals.settings(game);
    q('.shop').onclick = () => this.gate('shop', () => Modals.shop(game));
    q('.heroes').onclick = () => this.gate('heroes', () => Modals.heroes(game));
    q('.rewards').onclick = () => this.gate('dailyLogin', () => this.rewardsHub());
    q('.kingdom-btn').onclick = () => this.gate('kingdom', () => this.kingdomHub());
    q('.records').onclick = () => this.recordsHub();
    q('.challenge-btn').onclick = () => this.gate('challenge', () => Modals.challenge(game));
    // Realm picker: step through the realms you can play, or open the full list.
    const step = (dir: number) => {
      const meta = game.s.meta;
      const open = MAPS.filter((m) => meta.mapUnlocked(m.id));
      if (open.length < 2) return;
      const i = open.findIndex((m) => m.id === meta.mapId());
      const next = open[(i + dir + open.length) % open.length];
      game.s.audio.play('select');
      game.switchMap(next.id);
    };
    q('.rp-prev').onclick = () => step(-1);
    q('.rp-next').onclick = () => step(1);
    q('.rp-cur').onclick = () => Modals.realms(game);
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

  /** Text for a locked hub tile, or null when open. */
  private lockText(f: keyof typeof UNLOCK_WAVE): string | null {
    return this.game.s.meta.featureUnlocked(f) ? null : `Reach wave ${UNLOCK_WAVE[f]}`;
  }

  private rewardsHub(): void {
    const g = this.game;
    const meta = g.s.meta;
    const n = meta.notifications();
    const chestSub = meta.d.chest.pendingMilestone > 0 ? `${meta.d.chest.pendingMilestone + (meta.freeChestReady() ? 1 : 0)} ready` : meta.freeChestReady() ? 'Ready!' : fmtTime(meta.freeChestRemaining());
    Modals.hub(g, `${icon('chest')} Rewards`, [
      { label: 'Daily reward', icon: icon('calendar'), dot: n.daily, locked: this.lockText('dailyLogin'), sub: meta.dailyStatus().available ? 'Ready!' : `Streak ${meta.d.daily.streak}`, open: () => Modals.daily(g) },
      { label: 'Chests', icon: icon('chest'), dot: n.chest, locked: this.lockText('chests'), sub: chestSub, open: () => Modals.chest(g) },
      { label: 'Treasury', icon: icon('castle'), dot: n.treasury, locked: this.lockText('treasury'), sub: `${meta.treasuryAmount()} coins${meta.treasuryFull() ? ' · FULL' : ''}`, open: () => Modals.treasury(g) },
      { label: 'Missions', icon: icon('scroll'), dot: n.missions, locked: this.lockText('missions'), sub: `${meta.missions().filter((m) => m.done).length}/${meta.missions().length} done`, open: () => Modals.missions(g) },
    ]);
  }

  private kingdomHub(): void {
    const g = this.game;
    const meta = g.s.meta;
    const realm = MAP_BY_ID[meta.mapId()];
    Modals.hub(g, `${icon('town')} Kingdom`, [
      { label: 'Town', icon: icon('town'), dot: meta.notifications().town, locked: this.lockText('kingdom'), sub: `${meta.d.buildings.length}/7 built`, open: () => Modals.town(g) },
      { label: 'Realms', icon: icon('map'), locked: this.lockText('realms'), sub: realm.name, open: () => Modals.realms(g) },
    ]);
  }

  private recordsHub(): void {
    const g = this.game;
    const d = g.s.meta.d;
    Modals.hub(g, `${icon('trophy')} Records`, [
      { label: 'Trophies', icon: icon('trophy'), sub: `${d.achievements.length} earned`, open: () => Modals.trophies(g) },
      { label: 'Bestiary', icon: icon('skull'), sub: `${Object.values(d.bestiary).filter((b) => b && b.seen > 0).length} met`, open: () => Modals.bestiary(g) },
      { label: 'Stats', icon: icon('scroll'), sub: `Best wave ${g.s.meta.bestWave()}`, open: () => Modals.stats(g) },
    ]);
  }

  onEnter(): void {
    const meta = this.game.s.meta;
    for (const a of meta.checkAchievements()) this.game.s.ui.achievement(a.name, a.description, a.reward.coins, a.reward.gems ?? 0);
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
    setDot('.heroes', d.unlocks.heroes.some((h) => meta.pendingPerkTier(h) >= 0));
    setDot('.rewards', n.daily || n.chest || n.treasury || n.missions);
    setDot('.kingdom-btn', n.town);
    setDot('.challenge-btn', n.challenge);
    const lock = (sel: string, f: keyof typeof UNLOCK_WAVE) => $(this.el, sel).classList.toggle('locked', !meta.featureUnlocked(f));
    lock('.shop', 'shop');
    lock('.heroes', 'heroes');
    lock('.rewards', 'dailyLogin');
    lock('.kingdom-btn', 'kingdom');
    lock('.challenge-btn', 'challenge');
    const base = d.base;
    const wave = base ? base.wave : 0;
    const card = $(this.el, '.kingdom-card');
    const realm = MAP_BY_ID[meta.mapId()];
    const realmsOn = meta.featureUnlocked('realms');
    const realmTag = '';
    const pick = $(this.el, '.realm-pick');
    pick.style.display = realmsOn ? '' : 'none';
    if (realmsOn) {
      const open = MAPS.filter((m) => meta.mapUnlocked(m.id));
      const locked = MAPS.find((m) => !meta.mapUnlocked(m.id));
      $(this.el, '.rp-cur').innerHTML = `<span class="rp-map">${Modals.mapSketch(realm)}</span><span class="rp-text"><b>${realm.name}</b><small>${open.length > 1 ? `Realm ${open.findIndex((m) => m.id === realm.id) + 1} of ${open.length}` : locked ? `Next realm at wave ${locked.unlockWave}` : ''}</small></span>`;
      pick.querySelectorAll<HTMLButtonElement>('.rp-arrow').forEach((b) => b.classList.toggle('disabled', open.length < 2));
    }
    card.innerHTML = base
      ? `<b>${realmTag}${ageTitle(wave)}</b> · Wave ${wave + 1}<br/><span>⚑ Checkpoint ${base.checkpoint ?? checkpointOf(wave)} · Best ${meta.mapBest(meta.mapId())} · ${base.towers.length} towers</span>`
      : `<b>${realmTag}Found your kingdom</b><br/><span>Build, upgrade and hold out for as long as you can</span>`;
    $(this.el, '.play').innerHTML = `${icon('play')} ${base ? 'Defend' : 'Begin'}`;
    this.tick(true);
  }

  tick(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastTick < 500) return;
    this.lastTick = now;
    const meta = this.game.s.meta;
    const n = meta.notifications();
    // Rewards: how many things are waiting, or when the next chest is ready.
    const ready = [n.daily, n.chest, n.treasury, n.missions].filter(Boolean).length;
    const t = $(this.el, '.rewards .timer');
    if (meta.featureUnlocked('dailyLogin')) {
      t.style.display = '';
      t.textContent = ready ? `${ready} ready` : meta.featureUnlocked('chests') ? fmtTime(meta.freeChestRemaining()) : '';
      if (!t.textContent) t.style.display = 'none';
    } else t.style.display = 'none';
    if (force) return;
    $(this.el, '.rewards .dot').classList.toggle('on', ready > 0);
  }
}
