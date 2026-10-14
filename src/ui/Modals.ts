// All modal dialogs.

import { el, $, fmt, fmtTime } from './dom';
import { icon, ICONS } from './icons';
import { towerThumb, heroThumb, thumb } from './Thumbnails';
import type { Game } from '../game/Game';
import type { Battle } from '../game/Battle';
import { TOWERS, TOWER_ORDER, type TowerId } from '../data/towers';
import { HEROES, HERO_ORDER, type AbilityKind } from '../data/heroes';

const ABILITY_ICONS: Record<AbilityKind, keyof typeof ICONS> = { arrowRain: 'arrows', taunt: 'shield', meteor: 'meteor', quake: 'quake', holyLight: 'holy', shadowStrike: 'shadow' };
import { TOWER_META, META_UPGRADES, UNLOCKS, AD_REWARDS, COSMETICS, HERO_UNLOCK_COST, TREASURY, DAILY_LOGIN } from '../data/economy';
import { summarise } from '../analytics/Analytics';
import type { RewardedPlacement } from '../data/ads';
import type { ChestReward, MetaUpgradeKey } from '../game/Meta';
import type { ModalHandle } from './UI';

// --- Helpers --------------------------------------------------------------------------

/** A rewarded-ad button: glowing, optional, and always states exactly what the player gets. */
function adButton(game: Game, placement: RewardedPlacement, title: string, sub: string, onReward: (btn: HTMLButtonElement) => void, cls = ''): HTMLButtonElement {
  const b = el('button', `btn ad ${cls}`, `<span class="adtag">▶ AD</span><span>${title}${sub ? `<span class="sub">${sub}</span>` : ''}</span>`);
  game.s.ads.offerShown(placement);
  let busy = false;
  b.onclick = async () => {
    if (busy || b.classList.contains('used')) return;
    busy = true;
    const ok = await game.s.ads.showRewarded(placement);
    busy = false;
    if (ok) onReward(b);
  };
  return b;
}

function markUsed(b: HTMLButtonElement, text: string): void {
  b.classList.add('used');
  b.disabled = true;
  b.innerHTML = `<span>✓ ${text}</span>`;
}

function coinsTarget(): HTMLElement | null {
  const els = [...document.querySelectorAll<HTMLElement>('.screen.on .pill.coins, .modal .pill.coins')];
  return els.reverse().find((e) => e.offsetParent !== null) ?? null;
}

function flyCoins(game: Game, from: HTMLElement, amount: number): void {
  const r = from.getBoundingClientRect();
  game.s.audio.play('reward');
  game.s.ui.coinFly(r.left + r.width / 2, r.top + r.height / 2, coinsTarget(), Math.min(8, Math.ceil(amount / 10)), () => {
    game.s.audio.play('coin');
    refreshCoins(game);
  });
}

function refreshCoins(game: Game): void {
  const d = game.s.meta.d;
  document.querySelectorAll('.pill.coins .v').forEach((e) => (e.textContent = fmt(d.coins)));
  document.querySelectorAll('.pill.shards .v').forEach((e) => (e.textContent = fmt(d.shards)));
  if (game.s.ui.currentScreen === 'title') game.title.render();
}

function currencyBar(game: Game): string {
  const d = game.s.meta.d;
  return `<div style="display:flex;gap:8px;justify-content:center;margin-bottom:10px">
    <div class="pill coins">${icon('coin')}<span class="v">${fmt(d.coins)}</span></div>
    <div class="pill shards">${icon('gem')}<span class="v">${fmt(d.shards)}</span></div></div>`;
}

const costHtml = (n: number, gem = false) => `<span class="cost">${icon(gem ? 'gem' : 'coin')}${n}</span>`;

// --- Checkpoint -----------------------------------------------------------------------------

export function checkpoint(game: Game, wave: number, coins: number, firstTime: boolean, after: () => void | Promise<void>): void {
  const b = game.battle;
  if (!b) return;
  const { meta, audio, ui } = game.s;
  b.paused = true;
  audio.play('victory');
  ui.modal((m, h) => {
    m.innerHTML = `
      <div class="ribbon win">Checkpoint reached!</div>
      <div class="reward-row">⚑ Wave ${wave}</div>
      <div class="muted" style="text-align:center">If the castle falls, you'll regroup here. Your towers and gold are always kept.</div>
      <div class="stat-grid">
        <div>${b.run.towers.length}<small>TOWERS</small></div>
        <div>${b.run.unlockedSpots.size}<small>PADS</small></div>
        <div>${meta.bestWave()}<small>BEST WAVE</small></div>
      </div>
      <div class="reward-row coins-row">${icon('coin')}<span class="amt">+${coins}</span></div>
      ${firstTime ? `<div style="text-align:center;font-weight:900">${icon('chest')} Milestone chest earned! Open it from the menu.</div>` : `<div class="muted" style="text-align:center">Reached before: reduced checkpoint reward.</div>`}
      <div class="stack ad-slot" style="margin-top:10px"></div>
      <div class="actions"><button class="btn big go">${icon('play')} Onward</button></div>`;
    const extra = coins * (AD_REWARDS.checkpointMult - 1);
    $(m, '.ad-slot').append(adButton(game, 'checkpoint_double', 'Double the checkpoint coins', `+${extra} more coins`, (btn) => {
      meta.earn(extra, 'ad_checkpoint_double');
      $(m, '.coins-row .amt').textContent = `+${coins + extra}`;
      markUsed(btn, `Coins doubled! +${extra}`);
      flyCoins(game, btn, extra);
    }));
    $(m, '.go').onclick = () => h.close();
  }, {
    closable: false,
    onClose: () => {
      void Promise.resolve(after()).then(() => {
        if (game.battle === b && !game.s.ui.modalOpen) b.paused = false;
      });
    },
  });
}

// --- Castle fallen ------------------------------------------------------------------------------

export function fallen(game: Game, fromWave: number, toWave: number): void {
  const b = game.battle;
  if (!b) return;
  const { meta, ui } = game.s;
  ui.modal((m, h) => {
    m.innerHTML = `
      <div class="ribbon lose">The castle has fallen</div>
      <div class="reward-row">${icon('castle')} Wave ${fromWave + 1}</div>
      <div style="text-align:center;font-weight:800">Your army regroups at the last checkpoint: <b>wave ${toWave + 1}</b>.</div>
      <div class="muted" style="text-align:center;margin-top:6px">Every tower, upgrade and piece of gold is kept. Rebuild, upgrade, and push further!</div>
      ${meta.hasAffordableUpgrade() ? `<div class="muted" style="text-align:center;margin-top:6px">Tip: you can afford a permanent upgrade in the Shop.</div>` : ''}
      <div class="actions">
        ${meta.featureUnlocked('shop') ? `<button class="btn gold shopbtn">${icon('shop')} Shop</button>` : ''}
        <button class="btn big regroup">Regroup</button>
      </div>`;
    m.querySelector<HTMLButtonElement>('.shopbtn')?.addEventListener('click', () => shop(game));
    $(m, '.regroup').onclick = () => {
      h.close();
      b.applyMeta();
      b.retreat();
      ui.banner('Regrouped', `Wave ${toWave + 1}: tap Resume when ready`);
    };
  }, { closable: false });
}

// --- Revive --------------------------------------------------------------------------------

export function revive(game: Game, battle: Battle): void {
  game.s.ui.modal((m, h) => {
    m.innerHTML = `
      <div class="ribbon lose">The castle is falling!</div>
      <div style="text-align:center;margin:6px 0 12px">${icon('castle').replace('class="ico ', 'class="ico " style="width:80px;height:80px;display:inline-block" ')}</div>
      <div style="text-align:center;font-weight:800">One last chance to defend the kingdom.</div>
      <div class="stack" style="margin-top:12px"></div>
      <div class="actions"><button class="btn ghost small giveup">Give up</button></div>`;
    const ad = adButton(game, 'revive', 'Revive the castle', `Restore ${Math.round(AD_REWARDS.reviveHpFraction * 100)}% castle HP and clear the gate`, () => {
      h.close();
      battle.run.revive();
      game.s.ui.banner('Revived!', 'The castle stands strong');
      game.s.audio.play('reward');
    });
    $(m, '.stack').append(ad);
    $(m, '.giveup').onclick = () => {
      h.close();
      battle.run.declineRevive();
    };
  }, { closable: false });
}

// --- Pause -----------------------------------------------------------------------------------

export function pause(game: Game, onClose: () => void): void {
  const b = game.battle;
  if (!b) return;
  game.s.ui.modal((m, h) => {
    m.innerHTML = `
      <div class="ribbon">Paused</div>
      <div class="muted" style="text-align:center;margin-bottom:10px">Wave ${Math.max(1, b.run.waveIndex)} · progress is saved at the start of every wave</div>
      <div class="stack">
        <button class="btn big resume">${icon('play')} Resume</button>
        <div class="setting"><label>Music</label><input type="range" min="0" max="1" step="0.05" class="music"/></div>
        <div class="setting"><label>Sound FX</label><input type="range" min="0" max="1" step="0.05" class="sfx"/></div>
        <div class="actions" style="margin-top:4px">
          <button class="btn wood menu">${icon('home')} Main menu</button>
        </div>
      </div>`;
    const st = game.s.save.data.settings;
    const music = $(m, '.music') as HTMLInputElement;
    const sfx = $(m, '.sfx') as HTMLInputElement;
    music.value = String(st.music);
    sfx.value = String(st.sfx);
    music.oninput = () => {
      st.music = Number(music.value);
      game.applySettings();
    };
    sfx.oninput = () => {
      st.sfx = Number(sfx.value);
      game.applySettings();
    };
    $(m, '.resume').onclick = () => h.close();
    $(m, '.menu').onclick = () => {
      h.close();
      game.goTitle();
    };
  }, { onClose });
}

// --- Shop ----------------------------------------------------------------------------------------

export function shop(game: Game, tab: 'towers' | 'kingdom' | 'cosmetics' | 'free' = 'towers', onClose?: () => void): void {
  const { meta } = game.s;
  let current = tab;
  game.s.ui.modal((m) => {
    const render = () => {
      const d = meta.d;
      let body = '';
      if (current === 'towers') {
        body = TOWER_ORDER.map((t) => {
          const def = TOWERS[t];
          const lvl = d.towerLevels[t];
          const locked = t === 'lightning' && !d.unlocks.lightning;
          const cost = meta.towerUpgradeCost(t);
          let btn = '';
          if (locked) {
            const can = meta.canUnlockLightning();
            btn = can ? `<button class="btn small gold" data-unlock="lightning">Unlock ${costHtml(UNLOCKS.lightning.cost)}</button>` : `<button class="btn small disabled" disabled>Wave ${UNLOCKS.lightning.requiresWave}</button>`;
          } else if (cost === null) btn = `<button class="btn small gold disabled" disabled>MAX</button>`;
          else btn = `<button class="btn small ${d.coins < cost ? 'disabled' : ''}" data-tower="${t}">${costHtml(cost)}</button>`;
          return `<div class="list-item"><div class="thumb"><img src="${towerThumb(t, Math.min(10, 1 + Math.floor(lvl / 2)))}" alt=""/></div>
            <div class="body"><div class="name">${def.name} ${locked ? icon('lock').replace('class="ico ', 'class="ico " style="width:16px;height:16px;display:inline-block"') : `<span class="muted">Lv ${lvl}</span>`}</div>
            <div class="desc">${locked ? 'Chains lightning between 3-5 enemies.' : `+${Math.round(lvl * TOWER_META.damagePerLevel * 100)}% damage · +${Math.round(lvl * TOWER_META.rangePerLevel * 100)}% range`}</div>
            <div class="levelpips">${Array.from({ length: TOWER_META.maxLevel }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>${btn}</div>`;
        }).join('');
      } else if (current === 'kingdom') {
        body = (Object.keys(META_UPGRADES) as MetaUpgradeKey[]).map((k) => {
          const def = META_UPGRADES[k];
          const lvl = d.meta[k];
          const cost = meta.metaUpgradeCost(k);
          const ic = k === 'castleHp' ? 'heart' : k === 'warChest' ? 'coin' : 'sword';
          const btn = cost === null ? `<button class="btn small gold disabled" disabled>MAX</button>` : `<button class="btn small ${d.coins < cost ? 'disabled' : ''}" data-meta="${k}">${costHtml(cost)}</button>`;
          return `<div class="list-item"><div class="thumb">${icon(ic as 'heart').replace('class="ico ', 'class="ico " style="width:36px;height:36px"')}</div>
            <div class="body"><div class="name">${def.name} <span class="muted">Lv ${lvl}</span></div><div class="desc">${def.description}</div>
            <div class="levelpips">${Array.from({ length: def.maxLevel }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>${btn}</div>`;
        }).join('');
      } else if (current === 'cosmetics') {
        body = COSMETICS.map((c) => {
          const owned = d.cosmetics.owned.includes(c.id);
          const equipped = d.cosmetics.castle === c.id || d.cosmetics.trail === c.id;
          let btn: string;
          if (equipped) btn = `<button class="btn small gold disabled" disabled>Equipped</button>`;
          else if (owned) btn = `<button class="btn small blue" data-equip="${c.id}">Equip</button>`;
          else {
            const parts = [c.cost ? costHtml(c.cost) : '', c.shardCost ? costHtml(c.shardCost, true) : ''].filter(Boolean).join(' ');
            const afford = d.coins >= c.cost && d.shards >= c.shardCost;
            btn = `<button class="btn small ${afford ? '' : 'disabled'}" data-buy="${c.id}">${parts}</button>`;
          }
          const th = c.kind === 'castle' ? `<img src="${thumb(`castle-${c.id}`)}" alt=""/>` : `<div style="width:36px;height:36px;border-radius:50%;background:radial-gradient(circle,${c.color},transparent 70%)"></div>`;
          return `<div class="list-item"><div class="thumb">${th}</div><div class="body"><div class="name">${c.name}</div><div class="desc">${c.kind === 'castle' ? 'Castle skin' : 'Projectile trail'}</div></div>${btn}</div>`;
        }).join('');
      } else {
        const left = meta.shopBundlesLeft();
        body = `<div class="list-item"><div class="thumb">${icon('coin').replace('class="ico ', 'class="ico " style="width:40px;height:40px"')}</div>
            <div class="body"><div class="name">Free coin bundle</div><div class="desc">${left} of ${AD_REWARDS.shopBundlePerDay} left today</div></div><div class="ad-slot"></div></div>
          <div class="list-item"><div class="thumb">${icon('tv').replace('class="ico ', 'class="ico " style="width:36px;height:36px;filter:invert(.6)"')}</div>
            <div class="body"><div class="name">Remove Ads</div><div class="desc">Removes interstitial ads. Rewarded ads stay optional. (Placeholder purchase)</div></div>
            ${d.ads.removeAds ? `<button class="btn small gold disabled" disabled>Owned</button>` : `<button class="btn small gold" data-removeads>$2.99</button>`}</div>`;
      }
      m.innerHTML = `<div class="ribbon">Shop</div>${currencyBar(game)}
        <div class="muted" style="text-align:center;margin:-4px 0 8px">Permanent upgrades paid with coins. They boost every tower, forever.</div>
        <div class="tabs">${(['towers', 'kingdom', 'cosmetics', 'free'] as const).map((t) => `<button class="tab ${t === current ? 'on' : ''}" data-tab="${t}">${{ towers: 'Towers', kingdom: 'Kingdom', cosmetics: 'Style', free: 'Free' }[t]}</button>`).join('')}</div>
        <div class="list">${body}</div>`;
      m.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => (b.onclick = () => {
        current = b.dataset.tab as typeof current;
        render();
      }));
      const buy = (ok: boolean, msg?: string) => {
        if (ok) {
          game.s.audio.play('upgrade');
          if (msg) game.s.ui.toast(msg);
        } else {
          game.s.audio.play('error');
          game.s.ui.toast('Not enough coins');
        }
        render();
        refreshCoins(game);
      };
      m.querySelectorAll<HTMLButtonElement>('[data-tower]').forEach((b) => (b.onclick = () => buy(meta.buyTowerUpgrade(b.dataset.tower as TowerId))));
      m.querySelectorAll<HTMLButtonElement>('[data-meta]').forEach((b) => (b.onclick = () => buy(meta.buyMetaUpgrade(b.dataset.meta as MetaUpgradeKey))));
      m.querySelectorAll<HTMLButtonElement>('[data-unlock]').forEach((b) => (b.onclick = () => buy(meta.unlockLightning(), 'Lightning Tower unlocked!')));
      m.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((b) => (b.onclick = () => {
        const ok = meta.buyCosmetic(b.dataset.buy!);
        if (!ok) game.s.ui.toast('Not enough coins or shards');
        else game.s.audio.play('upgrade');
        render();
        refreshCoins(game);
      }));
      m.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach((b) => (b.onclick = () => {
        meta.equipCosmetic(b.dataset.equip!);
        game.s.audio.play('select');
        render();
      }));
      m.querySelector<HTMLButtonElement>('[data-removeads]')?.addEventListener('click', () => {
        meta.d.ads.removeAds = true;
        meta.commit();
        game.s.ui.toast('Interstitial ads removed. Thank you!');
        render();
      });
      const slot = m.querySelector('.ad-slot');
      if (slot) {
        if (meta.shopBundlesLeft() > 0) {
          slot.append(adButton(game, 'shop_bundle', `+${AD_REWARDS.shopBundleCoins}`, 'coins', (b) => {
            const got = meta.grantShopBundle();
            flyCoins(game, b, got);
            setTimeout(render, 50);
          }, 'small'));
        } else slot.innerHTML = `<button class="btn small disabled" disabled>Tomorrow</button>`;
      }
    };
    render();
  }, { onClose });
}

// --- Heroes ----------------------------------------------------------------------------------------

export function heroes(game: Game): void {
  const { meta } = game.s;
  game.s.ui.modal((m) => {
    const render = () => {
      const d = meta.d;
      m.innerHTML = `<div class="ribbon">Heroes</div>${currencyBar(game)}<div class="list">${HERO_ORDER.map((id) => {
        const h = HEROES[id];
        const owned = d.unlocks.heroes.includes(id);
        const sel = d.selectedHero === id;
        const cost = HERO_UNLOCK_COST[id];
        const btn = sel ? `<button class="btn small gold disabled" disabled>Selected</button>` : owned ? `<button class="btn small blue" data-sel="${id}">Select</button>` : `<button class="btn small ${d.coins < cost ? 'disabled' : ''}" data-buy="${id}">${costHtml(cost)}</button>`;
        const bar = (label: string, v: number) => `<div class="hstat"><span>${label}</span><i><b style="width:${Math.round(Math.max(0.08, Math.min(1, v)) * 100)}%"></b></i></div>`;
        const dps = h.damage / h.cooldown;
        return `<div class="hero-card ${sel ? 'sel' : ''} ${owned ? '' : 'locked'}" style="--hc:${h.color}">
          <div class="portrait"><img src="${heroThumb(id)}" alt=""/>${owned ? '' : `<span class="lock">${ICONS.lock}</span>`}</div>
          <div class="body">
            <div class="name">${h.name} <span class="muted">${h.title}</span></div>
            <div class="desc">${h.description}</div>
            <div class="hstats">${bar('HP', h.hp / 560)}${bar('DPS', dps / 60)}${bar('Range', h.range / 3)}${bar('Speed', h.speed / 3.6)}</div>
            <div class="ability"><span class="aico">${ICONS[ABILITY_ICONS[h.ability.kind]]}</span><span><b>${h.ability.name}</b> ${h.ability.description}</span></div>
          </div>
          <div class="act">${btn}</div></div>`;
      }).join('')}</div><div class="muted" style="text-align:center;margin-top:8px">Hero Training in the Shop boosts every hero.</div>`;
      m.querySelectorAll<HTMLButtonElement>('[data-sel]').forEach((b) => (b.onclick = () => {
        meta.selectHero(b.dataset.sel as typeof d.selectedHero);
        render();
      }));
      m.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((b) => (b.onclick = () => {
        if (meta.unlockHero(b.dataset.buy as typeof d.selectedHero)) {
          game.s.audio.play('upgrade');
          game.s.ui.toast(`${HEROES[b.dataset.buy as typeof d.selectedHero].name} joins your kingdom!`);
        } else {
          game.s.audio.play('error');
          game.s.ui.toast('Not enough coins');
        }
        render();
        refreshCoins(game);
      }));
    };
    render();
  });
}

// --- Missions --------------------------------------------------------------------------------------

export function missions(game: Game): void {
  const { meta } = game.s;
  meta.refreshMissions();
  game.s.ui.modal((m) => {
    const render = () => {
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      m.innerHTML = `<div class="ribbon">Daily Missions</div><div class="muted" style="text-align:center;margin-bottom:8px">New missions in ${fmtTime(midnight.getTime() - Date.now())}</div>
        <div class="list">${meta.missions().map((x) => {
          const pct = Math.min(100, (x.progress / x.def.target) * 100);
          const btn = x.claimed ? `<button class="btn small disabled" disabled>Done</button>` : x.done ? `<button class="btn small gold" data-claim="${x.def.id}">Claim</button>` : `<span class="cost" style="font-weight:900">${icon('coin')}${x.def.reward}</span>`;
          return `<div class="list-item"><div class="body"><div class="name">${x.def.text}</div><div class="progress"><div style="width:${pct}%"></div></div>
            <div class="desc">${fmt(x.progress)} / ${fmt(x.def.target)}</div></div>${btn}</div>`;
        }).join('')}</div>`;
      m.querySelectorAll<HTMLButtonElement>('[data-claim]').forEach((b) => (b.onclick = () => {
        const got = meta.claimMission(b.dataset.claim!);
        if (got) flyCoins(game, b, got);
        render();
      }));
    };
    render();
  });
}

// --- Daily login -------------------------------------------------------------------------------------

export function daily(game: Game): void {
  const { meta } = game.s;
  game.s.ui.modal((m) => {
    const render = () => {
      const st = meta.dailyStatus();
      const cells = DAILY_LOGIN.map((r, i) => {
        const claimed = st.available ? i < st.dayIndex : i <= st.dayIndex;
        const today = st.available && i === st.dayIndex;
        const content = r.kind === 'coins' ? `${icon('coin')}${r.amount}` : `${icon('chest')}Chest`;
        return `<div class="daily-cell ${claimed ? 'claimed' : ''} ${today ? 'today' : ''} ${i === 6 ? 'big' : ''}"><small>Day ${i + 1}</small>${content}${claimed ? '<small>✓</small>' : ''}</div>`;
      }).join('');
      m.innerHTML = `<div class="ribbon">Daily Rewards</div><div class="muted" style="text-align:center;margin-bottom:8px">Log in every day. Missing a day restarts the cycle.</div>
        <div class="daily-grid">${cells}</div>
        <div class="actions">${st.available ? `<button class="btn big gold claim">Claim Day ${st.dayIndex + 1}</button>` : `<div class="muted">Come back tomorrow for Day ${(st.dayIndex + 1) % 7 + 1}!</div>`}</div>`;
      m.querySelector<HTMLButtonElement>('.claim')?.addEventListener('click', (e) => {
        const res = meta.claimDaily();
        if (!res) return;
        if (res.chest) chestReveal(game, res.chest);
        else flyCoins(game, e.currentTarget as HTMLElement, res.coins);
        render();
      });
    };
    render();
  });
}

// --- Chests ------------------------------------------------------------------------------------------

export function chestReveal(game: Game, reward: ChestReward): void {
  game.s.audio.play('chest');
  game.s.ui.modal((m, h) => {
    m.innerHTML = `<div class="ribbon purple">${reward.kind === 'milestone' ? 'Milestone Chest' : reward.kind === 'daily' ? 'Day 7 Chest' : 'Free Chest'}</div>
      <div class="chest-anim">${ICONS.chest}</div>
      <div class="reveal" style="opacity:0;transition:opacity .3s">
        <div class="reward-row">${icon('coin')}+${reward.coins}</div>
        <div class="reward-row">${icon('gem')}+${reward.shards} <span style="font-size:14px">shards</span></div>
      </div>
      <div class="actions"><button class="btn ok">Awesome!</button></div>`;
    const chestEl = $(m, '.chest-anim');
    setTimeout(() => {
      chestEl.classList.add('open');
      ($(m, '.reveal') as HTMLElement).style.opacity = '1';
      flyCoins(game, $(m, '.reveal'), reward.coins);
    }, 1200);
    $(m, '.ok').onclick = () => h.close();
  });
}

export function chest(game: Game): void {
  const { meta } = game.s;
  let handle: ModalHandle | null = null;
  const render = (m: HTMLElement) => {
    const ready = meta.freeChestReady();
    const pending = meta.d.chest.pendingMilestone;
    m.innerHTML = `<div class="ribbon purple">Chests</div>
      <div class="list">
        <div class="list-item"><div class="thumb">${icon('chest').replace('class="ico ', 'class="ico " style="width:44px;height:44px"')}</div>
          <div class="body"><div class="name">Free Chest</div><div class="desc">${ready ? 'Ready to open!' : `Opens in ${fmtTime(meta.freeChestRemaining())}`}<br/>Coins and cosmetic shards</div></div>
          <div class="slot"></div></div>
        <div class="list-item"><div class="thumb">${icon('chest').replace('class="ico ', 'class="ico " style="width:44px;height:44px;filter:hue-rotate(200deg)"')}</div>
          <div class="body"><div class="name">Milestone Chests</div><div class="desc">Earned the first time you reach each checkpoint. You have ${pending}.</div></div>
          ${pending > 0 ? `<button class="btn small gold ms">Open</button>` : `<button class="btn small disabled" disabled>0</button>`}</div>
      </div>`;
    const slot = $(m, '.slot');
    if (ready) {
      const b = el('button', 'btn small gold', 'Open');
      b.onclick = () => {
        const r = meta.openFreeChest();
        if (r) {
          handle?.close();
          chestReveal(game, r);
        }
      };
      slot.append(b);
    } else {
      slot.append(adButton(game, 'chest_skip', 'Open now', 'skip the timer', () => {
        const r = meta.openFreeChest(true);
        if (r) {
          handle?.close();
          chestReveal(game, r);
        }
      }, 'small'));
    }
    m.querySelector<HTMLButtonElement>('.ms')?.addEventListener('click', () => {
      const r = meta.openMilestoneChest();
      if (r) {
        handle?.close();
        chestReveal(game, r);
      }
    });
  };
  handle = game.s.ui.modal((m) => render(m), { onClose: () => refreshCoins(game) });
}

// --- Treasury ------------------------------------------------------------------------------------------

export function treasury(game: Game): void {
  const { meta } = game.s;
  game.s.ui.modal((m, h) => {
    const amt = meta.treasuryAmount();
    const hours = Math.min(TREASURY.capHours, (Date.now() - meta.d.treasury.lastCollect) / 3600000);
    m.innerHTML = `<div class="ribbon">Royal Treasury</div>
      <div style="text-align:center">${icon('castle').replace('class="ico ', 'class="ico " style="width:80px;height:80px;display:inline-block"')}</div>
      <div class="reward-row">${icon('coin')}${amt}</div>
      <div class="muted" style="text-align:center">Your kingdom earns ${meta.treasuryRate().toFixed(1)} coins/hour while you're away (up to ${TREASURY.capHours}h). Reach further waves to raise it.</div>
      <div class="progress" style="margin:10px 0"><div style="width:${(hours / TREASURY.capHours) * 100}%"></div></div>
      <div class="stack slot"></div>
      <div class="actions"><button class="btn collect ${amt < 1 ? 'disabled' : ''}">Collect</button></div>`;
    const collect = (doubled: boolean, from: HTMLElement) => {
      const got = meta.collectTreasury(doubled);
      flyCoins(game, from, got);
      h.close();
    };
    if (amt >= TREASURY.minCollect) {
      $(m, '.slot').append(adButton(game, 'treasury_double', `Collect ×2`, `+${amt * 2} coins instead of ${amt}`, (b) => collect(true, b)));
    }
    $(m, '.collect').onclick = (e) => {
      if (amt < 1) return;
      collect(false, e.currentTarget as HTMLElement);
    };
  }, { onClose: () => refreshCoins(game) });
}

// --- Settings -------------------------------------------------------------------------------------------

export function settings(game: Game): void {
  const { save } = game.s;
  game.s.ui.modal((m) => {
    const render = () => {
      const st = save.data.settings;
      const seg = (name: string, opts: [string, string][], val: string) =>
        `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${v === val ? 'on' : ''}">${l}</button>`).join('')}</div>`;
      m.innerHTML = `<div class="ribbon">Settings</div>
        <div class="setting"><label>Music</label><input type="range" min="0" max="1" step="0.05" class="music" value="${st.music}"/></div>
        <div class="setting"><label>Sound FX</label><input type="range" min="0" max="1" step="0.05" class="sfx" value="${st.sfx}"/></div>
        <div class="setting"><label>Graphics</label>${seg('quality', [['low', 'Low'], ['high', 'High']], st.quality)}</div>
        <div class="setting"><label>Show FPS</label>${seg('fps', [['0', 'Off'], ['1', 'On']], st.showFps ? '1' : '0')}</div>
        <div class="setting"><label>Ads</label><span class="muted">${save.data.ads.removeAds ? 'Interstitials removed' : 'Standard'}</span></div>
        <h3 style="margin:12px 0 4px;font-size:15px">Developer</h3>
        <div class="setting"><label>Mock ad result</label></div>
        ${seg('ad', [['completed', 'Complete'], ['skipped', 'Skip'], ['failed', 'Fail'], ['random', 'Random']], st.debugAdOutcome)}
        <div class="setting"><label>Ads unavailable</label>${seg('noads', [['0', 'No'], ['1', 'Yes']], st.debugAdsUnavailable ? '1' : '0')}</div>
        <div class="actions"><button class="btn small blue dbg">Analytics debug</button><button class="btn small red reset">Reset progress</button></div>
        <div class="muted" style="text-align:center;margin-top:8px">Tiny Kingdom Defender v1.0.0 · All art & audio generated in code.</div>`;
      const music = $(m, '.music') as HTMLInputElement;
      const sfx = $(m, '.sfx') as HTMLInputElement;
      music.oninput = () => {
        st.music = Number(music.value);
        game.applySettings();
      };
      sfx.oninput = () => {
        st.sfx = Number(sfx.value);
        game.applySettings();
        game.s.audio.play('coin');
      };
      m.querySelectorAll<HTMLElement>('[data-seg]').forEach((s) => {
        s.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => {
          const v = b.dataset.v!;
          switch (s.dataset.seg) {
            case 'quality': st.quality = v as 'low' | 'high'; break;
            case 'fps': st.showFps = v === '1'; break;
            case 'ad': st.debugAdOutcome = v as typeof st.debugAdOutcome; break;
            case 'noads': st.debugAdsUnavailable = v === '1'; break;
          }
          game.applySettings();
          render();
        }));
      });
      $(m, '.dbg').onclick = () => debug(game);
      let armed = false;
      $(m, '.reset').onclick = (e) => {
        const b = e.currentTarget as HTMLButtonElement;
        if (!armed) {
          armed = true;
          b.textContent = 'Tap again to confirm';
          return;
        }
        save.reset();
        game.s.ui.closeModals();
        game.s.ui.toast('Progress reset');
        game.goTitle();
      };
    };
    render();
  });
}

// --- Debug -----------------------------------------------------------------------------------------------

export function debug(game: Game): void {
  const { analytics, meta } = game.s;
  game.s.ui.modal((m) => {
    const render = () => {
      const events = analytics.sessionEvents();
      const s = summarise(events);
      const adRows = Object.entries(s.adViewsByPlacement).map(([p, v]) => `<tr><td>${p}</td><td>${v.offered}</td><td>${v.clicked}</td><td>${v.completed}</td><td>${v.skipped}</td><td>${v.failed}</td></tr>`).join('') || '<tr><td colspan="6">No ad activity yet</td></tr>';
      const src = Object.entries(s.coinsBySource).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('') || '<tr><td colspan="2">—</td></tr>';
      const sink = Object.entries(s.coinsBySink).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('') || '<tr><td colspan="2">—</td></tr>';
      const lv = Object.entries(s.levels).map(([k, v]) => `<tr><td>${k}</td><td>${v.plays}</td><td>${v.wins}</td><td>${Math.round((v.wins / v.plays) * 100)}%</td></tr>`).join('') || '<tr><td colspan="4">—</td></tr>';
      m.innerHTML = `<div class="ribbon">Debug · Session analytics</div>
        <div class="debug">
          <div class="muted">${s.totalEvents} events this session · interstitials shown: ${s.interstitials}</div>
          <h3>Ads per placement</h3><table><tr><th>Placement</th><th>Offer</th><th>Click</th><th>✓</th><th>Skip</th><th>Fail</th></tr>${adRows}</table>
          <h3>Coins earned by source</h3><table>${src}</table>
          <h3>Coins spent by sink</h3><table>${sink}</table>
          <h3>Checkpoint rate by segment</h3><table><tr><th>Waves</th><th>Pushes</th><th>Reached ⚑</th><th>Rate</th></tr>${lv}</table>
          <h3>Recent events</h3><pre>${events.slice(-30).reverse().map((e) => `${(e.t / 1000).toFixed(1)}s ${e.name} ${JSON.stringify(e.params)}`).join('\n')}</pre>
          <h3>Cheats (testing)</h3>
          <div class="actions"><button class="btn small gold coins">+1000 coins</button><button class="btn small blue unlock">+10 waves</button><button class="btn small gold gold5k">+5000 gold</button><button class="btn small treasury">Treasury +8h</button><button class="btn small chest">Chest ready</button><button class="btn small daily">Next day</button><button class="btn small blue auto">Autoplay battle</button></div>
        </div>`;
      $(m, '.coins').onclick = () => {
        meta.earn(1000, 'debug');
        refreshCoins(game);
        render();
      };
      $(m, '.unlock').onclick = () => {
        const d = meta.d;
        const base = game.battle ? game.battle.run.snapshot(game.battle.run.isQuiet() ? undefined : game.battle.run.currentWave) : d.base;
        if (!base) return game.s.ui.toast('Found your kingdom first');
        base.wave += 10;
        base.checkpoint = Math.floor(base.wave / 10) * 10;
        d.base = base;
        d.progress.bestWave = Math.max(d.progress.bestWave, base.wave);
        meta.commit();
        game.s.ui.closeModals();
        if (game.battle) game.enterKingdom();
        game.s.ui.toast(`Jumped to wave ${base.wave + 1}`);
      };
      $(m, '.gold5k').onclick = () => {
        if (!game.battle) return game.s.ui.toast('Open your kingdom first');
        game.battle.run.addGold(5000, false);
        game.battle.persist(true, game.battle.run.isQuiet() ? undefined : game.battle.run.currentWave);
      };
      $(m, '.treasury').onclick = () => {
        meta.d.treasury.lastCollect -= 8 * 3600000;
        meta.commit();
        game.s.ui.toast('Treasury filled');
      };
      $(m, '.chest').onclick = () => {
        meta.d.chest.nextFree = Date.now();
        meta.commit();
        game.s.ui.toast('Free chest ready');
      };
      $(m, '.auto').onclick = () => {
        game.autoplay();
        game.s.ui.toast(game.battle ? 'AI is now playing this battle' : 'Start a battle first');
      };
      $(m, '.daily').onclick = () => {
        const d = meta.d.daily;
        if (d.lastClaimDay) {
          const [y, mo, da] = d.lastClaimDay.split('-').map(Number);
          const prev = new Date(y, mo - 1, da - 1);
          d.lastClaimDay = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
        }
        meta.commit();
        game.s.ui.toast('Daily reward available');
      };
    };
    render();
  }, { wide: true, onClose: () => game.s.ui.currentScreen === 'title' && game.title.render() });
}

