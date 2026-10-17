// All modal dialogs.

import { el, $, fmt, fmtTime } from './dom';
import { icon, ICONS } from './icons';
import { towerThumb, heroThumb, thumb, enemyThumb } from './Thumbnails';
import type { Game } from '../game/Game';
import type { Battle } from '../game/Battle';
import { TOWERS, TOWER_ORDER, isSupport, type TowerId } from '../data/towers';
import { HEROES, HERO_ORDER, HERO_GEAR, HERO_LEVELS, PERKS, PERK_TIERS, xpForLevel, gearTierFor, type AbilityKind, type HeroId } from '../data/heroes';

const ABILITY_ICONS: Record<AbilityKind, keyof typeof ICONS> = { arrowRain: 'arrows', taunt: 'shield', meteor: 'meteor', quake: 'quake', holyLight: 'holy', shadowStrike: 'shadow' };
import { TOWER_META, META_UPGRADES, UNLOCKS, AD_REWARDS, COSMETICS, HERO_UNLOCK_COST, TREASURY, DAILY_LOGIN } from '../data/economy';
import { summarise } from '../analytics/Analytics';
import type { RewardedPlacement } from '../data/ads';
import type { ChestReward, MetaUpgradeKey } from '../game/Meta';
import type { ModalHandle } from './UI';
import { ACHIEVEMENTS } from '../data/achievements';
import { ENEMIES, BOSS_BY_CHAPTER, type EnemyDef, type EnemyId } from '../data/enemies';
import { newKingdom } from '../game/Run';
import { TWISTS, CHALLENGE } from '../data/challenge';
import { BUILDINGS, BUILDING_BY_ID, type BuildingId } from '../data/kingdom';
import { MASTERY, masteryTitle } from '../data/mastery';
import { ageTitle } from '../game/Siege';
import { MAPS, MAP_BY_ID, type MapDef, type MapId } from '../data/maps';
import { GRID_SIZE } from '../data/base';
import { SPELLS, SPELL_RULES, spellPower, spellCooldown, type SpellId } from '../data/spells';

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

export function fallen(game: Game, fromWave: number, toWave: number, near: NearMiss | null = null): void {
  const b = game.battle;
  if (!b) return;
  const { meta, ui } = game.s;
  ui.modal((m, h) => {
    m.innerHTML = `
      <div class="ribbon lose">The castle has fallen</div>
      <div class="reward-row">${icon('castle')} Wave ${fromWave + 1}</div>
      ${nearMissHtml(near)}
      <div style="text-align:center;font-weight:800">Your army regroups at the last checkpoint: <b>wave ${toWave + 1}</b>.</div>
      <div class="muted" style="text-align:center;margin-top:6px">Every tower, upgrade and piece of gold is kept. Rebuild, upgrade, and push further!</div>
      <div class="tip">💡 ${b.lossTip()}</div>
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
      <div class="muted" style="text-align:center;margin-bottom:10px">${b.challenge ? `Daily Challenge · ${b.challengeScore} waves survived. Leaving ends today's attempt.` : `Wave ${Math.max(1, b.run.waveIndex)} · progress is saved at the start of every wave`}</div>
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

export function shop(game: Game, tab: 'towers' | 'spells' | 'kingdom' | 'cosmetics' | 'free' = 'towers', onClose?: () => void): void {
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
          const ml = meta.masteryLevel(t);
          const [have, need] = meta.masteryProgress(t);
          const mastery = locked ? '' : `<div class="mastery ${ml >= MASTERY.masterLevel ? 'gold' : ml >= MASTERY.veteranLevel ? 'silver' : ''}" title="Mastery: earned by this tower type's kills">
              <span>★ ${masteryTitle(ml)} ${ml}</span><div class="mbar"><i style="width:${ml >= MASTERY.maxLevel ? 100 : Math.round((have / need) * 100)}%"></i></div>
              <small>${ml >= MASTERY.maxLevel ? 'Mastered' : `${need - have} ${isSupport(t) ? 'XP' : 'kills'} to ${ml + 1}`}</small></div>`;
          return `<div class="list-item"><div class="thumb"><img src="${towerThumb(t, Math.min(10, 1 + Math.floor(lvl / 2)))}" alt=""/></div>
            <div class="body"><div class="name">${def.name} ${locked ? icon('lock').replace('class="ico ', 'class="ico " style="width:16px;height:16px;display:inline-block"') : `<span class="muted">Lv ${lvl}</span>`}</div>
            <div class="desc">${locked ? 'Chains lightning between 3-5 enemies.' : `+${Math.round(lvl * TOWER_META.damagePerLevel * 100)}% damage · +${Math.round(lvl * TOWER_META.rangePerLevel * 100)}% range${ml ? ` · mastery +${Math.round(ml * MASTERY.damagePerLevel * 100)}% damage` : ''}`}</div>
            <div class="levelpips">${Array.from({ length: TOWER_META.maxLevel }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>${mastery}</div>${btn}</div>`;
        }).join('');
      } else if (current === 'spells') {
        body = SPELLS.map((sp) => {
          const open = meta.spellUnlocked(sp.id);
          const lvl = meta.spellLevel(sp.id);
          const cost = meta.spellUpgradeCost(sp.id);
          const btn = !open ? `<button class="btn small disabled" disabled>Wave ${sp.unlockWave}</button>`
            : cost === null ? `<button class="btn small gold disabled" disabled>MAX</button>`
            : `<button class="btn small ${d.coins < cost ? 'disabled' : ''}" data-spell="${sp.id}">${costHtml(cost)}</button>`;
          return `<div class="list-item ${open ? '' : 'locked-row'}"><div class="thumb bld">${sp.icon}</div>
            <div class="body"><div class="name">${sp.name} ${open ? `<span class="muted">Lv ${lvl}</span>` : ''}</div><div class="desc">${sp.description}</div>
            <div class="desc" style="font-weight:800">${spellPower(sp.id, lvl).text} · recharges in ${Math.round(spellCooldown(sp.id, lvl))}s</div>
            <div class="levelpips">${Array.from({ length: SPELL_RULES.maxLevel }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>${btn}</div>`;
        }).join('');
      } else if (current === 'kingdom') {
        body = (Object.keys(META_UPGRADES) as MetaUpgradeKey[]).map((k) => {
          const def = META_UPGRADES[k];
          const lvl = d.meta[k];
          const cost = meta.metaUpgradeCost(k);
          const ic = k === 'castleHp' ? 'heart' : k === 'battlements' ? 'castle' : k === 'warChest' ? 'coin' : 'sword';
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
        <div class="tabs">${(['towers', 'spells', 'kingdom', 'cosmetics', 'free'] as const).map((t) => `<button class="tab ${t === current ? 'on' : ''}" data-tab="${t}">${{ towers: 'Towers', spells: 'Spells', kingdom: 'Castle', cosmetics: 'Style', free: 'Free' }[t]}</button>`).join('')}</div>
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
      m.querySelectorAll<HTMLButtonElement>('[data-spell]').forEach((b) => (b.onclick = () => buy(meta.buySpellUpgrade(b.dataset.spell as SpellId))));
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
            ${owned ? (() => {
              const lvl = meta.heroLevel(id), xp = meta.heroXp(id);
              const lo = xpForLevel(lvl), hi = xpForLevel(lvl + 1);
              const frac = lvl >= HERO_LEVELS.max ? 1 : (xp - lo) / Math.max(1, hi - lo);
              const gear = HERO_GEAR[gearTierFor(lvl)];
              const nextGear = HERO_GEAR.find((g) => g.level > lvl);
              return `<div class="hlevel"><span class="lv">Lv ${lvl}</span><span class="gear" style="--gc:${gear.color}">${gear.name}</span><i><b style="width:${Math.round(frac * 100)}%"></b></i><span class="muted">${nextGear ? `${nextGear.name} gear at Lv ${nextGear.level}` : 'Max gear'}</span></div>`;
            })() : ''}
            <div class="desc">${h.description}</div>
            <div class="hstats">${bar('HP', h.hp / 560)}${bar('DPS', dps / 60)}${bar('Range', h.range / 3)}${bar('Speed', h.speed / 3.6)}</div>
            <div class="ability"><span class="aico">${ICONS[ABILITY_ICONS[h.ability.kind]]}</span><span><b>${h.ability.name}</b> ${h.ability.description}</span></div>
            ${owned ? perkRow(game, id) : ''}
          </div>
          <div class="act">${btn}</div></div>`;
      }).join('')}</div><div class="muted" style="text-align:center;margin-top:8px">Hero Training in the Shop boosts every hero.</div>`;
      m.querySelectorAll<HTMLButtonElement>('[data-sel]').forEach((b) => (b.onclick = () => {
        meta.selectHero(b.dataset.sel as typeof d.selectedHero);
        render();
      }));
      m.querySelectorAll<HTMLButtonElement>('[data-perk]').forEach((b) => (b.onclick = () => {
        const id = b.dataset.perk as HeroId;
        perkChoice(game, id, meta.pendingPerkTier(id), render);
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
          <div class="actions"><button class="btn small gold coins">+1000 coins <small>(shop)</small></button><button class="btn small blue unlock">+10 waves</button><button class="btn small gold gold5k">+5000 gold <small>(in-game)</small></button><button class="btn small treasury">Treasury +8h</button><button class="btn small chest">Chest ready</button><button class="btn small daily">Next day</button><button class="btn small blue auto">Autoplay battle</button></div>
        </div>`;
      $(m, '.coins').onclick = () => {
        meta.earn(1000, 'debug');
        refreshCoins(game);
        render();
        game.s.ui.toast('+1000 coins: spend them in the Shop and on heroes');
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
        // Gold belongs to the kingdom: add it to the live battle, or to the saved kingdom from the menus.
        if (game.battle) {
          game.battle.run.addGold(5000, false);
          game.battle.persist(true, game.battle.run.isQuiet() ? undefined : game.battle.run.currentWave);
        } else {
          const d = meta.d;
          d.base = d.base ?? newKingdom();
          d.base.gold += 5000;
          meta.commit();
        }
        game.s.ui.toast(`+5000 gold for building towers (kingdom now has ${fmt(game.battle ? game.battle.run.gold : meta.d.base!.gold)})`);
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


// --- Trophy room ----------------------------------------------------------------------

export function trophies(game: Game): void {
  const { meta } = game.s;
  for (const a of meta.checkAchievements()) game.s.ui.achievement(a.name, a.description, a.reward.coins, a.reward.gems ?? 0);
  game.s.ui.modal((m) => {
    const d = meta.d;
    const done = ACHIEVEMENTS.filter((a) => d.achievements.includes(a.id)).length;
    const rows = ACHIEVEMENTS.map((a) => {
      const got = d.achievements.includes(a.id);
      const p = Math.min(a.target, a.progress(d));
      const frac = got ? 1 : p / a.target;
      return `<div class="trophy ${got ? 'got' : ''}">
        <div class="tico">${icon(a.icon as 'trophy')}</div>
        <div class="tbody"><b>${a.name}</b><span>${a.description}</span>
          <i class="tbar"><b style="width:${Math.round(frac * 100)}%"></b></i>
          <small>${got ? 'Unlocked' : `${fmt(Math.floor(p))} / ${fmt(a.target)}`}</small></div>
        <div class="treward">${got ? '✓' : `+${a.reward.coins} 🪙${a.reward.gems ? `<br/>+${a.reward.gems} 💎` : ''}`}</div>
      </div>`;
    }).join('');
    m.innerHTML = `<div class="ribbon purple">Trophy Room</div>
      <div class="trophy-summary"><b>${done}</b> of ${ACHIEVEMENTS.length} trophies<i class="tbar"><b style="width:${Math.round((done / ACHIEVEMENTS.length) * 100)}%"></b></i></div>
      <div class="trophies">${rows}</div>`;
  }, { wide: true });
}

// --- Bestiary -------------------------------------------------------------------------

const AGE_NAMES = ['Age of Meadows', 'Age of Sands', 'Age of Frost', 'Age of Fire'];

/** Plain-language counters for an enemy, from its stats. */
function enemyTips(e: EnemyDef): string[] {
  const t: string[] = [];
  if (e.flying) t.push('Flies: only Archer, Frost, Mage, Ballista and Lightning can hit it.');
  if (e.armor >= 0.3) t.push('Heavy armour: magic (Mage, Lightning, Frost, Flame) cuts through it; Alchemist melts the armour.');
  if (e.magicResist >= 0.3) t.push('Resists magic: use Archer, Cannon or Ballista.');
  if (e.speed >= 1.5) t.push('Fast: slow it with Frost, or hold it with a barricade.');
  if (e.burrow) t.push('Burrows under the sand: towers can only hit it when it surfaces, but burning and poison keep working.');
  if (e.freezeTowers) t.push('Freezes nearby towers: kill it fast with a Ballista or your hero, or keep towers spread out.');
  if (e.split) t.push('Splits when killed: splash damage (Cannon, Alchemist, Flame) mops up the pieces.');
  if (e.dotImmune) t.push('Immune to burning and poison.');
  if (e.heal) t.push('Heals nearby allies: target it first with "Strongest" targeting or your hero.');
  if (e.shield) t.push('Shields the enemies right behind it: kill it first.');
  if (e.boss?.mechanics.includes('summon')) t.push('Summons minions as it marches: splash towers help.');
  if (e.boss?.mechanics.includes('charge')) t.push('Charges forward at speed: barricades and stuns blunt it.');
  if (e.boss?.mechanics.includes('immune')) t.push('Becomes briefly immune at low health: save your hero ability.');
  if (!t.length) t.push('No special tricks: any tower will do.');
  return t;
}

export function bestiary(game: Game): void {
  const { meta } = game.s;
  game.s.ui.modal((m) => {
    const d = meta.d;
    const ids = (Object.keys(ENEMIES) as EnemyId[]).sort((a, b) => (ENEMIES[a].age ?? 0) - (ENEMIES[b].age ?? 0) || (ENEMIES[a].boss ? 1 : 0) - (ENEMIES[b].boss ? 1 : 0));
    const found = ids.filter((id) => (d.bestiary[id]?.seen ?? 0) > 0).length;
    const cards = ids.map((id) => {
      const e = ENEMIES[id];
      const rec = d.bestiary[id];
      const seen = (rec?.seen ?? 0) > 0;
      const bossAge = BOSS_BY_CHAPTER.indexOf(id);
      const where = bossAge >= 0 ? `Boss of the ${AGE_NAMES[bossAge]}` : e.age !== undefined ? AGE_NAMES[e.age] : id === 'minion' ? 'Summoned by bosses' : 'Every Age';
      if (!seen) {
        return `<div class="beast unknown"><div class="bimg"><img src="${enemyThumb(id)}" alt=""/></div><div class="bbody"><b>???</b><span class="where">${where}</span><span class="muted">Not yet encountered.</span></div></div>`;
      }
      const pct = (v: number) => `${Math.round(v * 100)}%`;
      return `<div class="beast ${e.boss ? 'boss' : ''}">
        <div class="bimg"><img src="${enemyThumb(id)}" alt=""/></div>
        <div class="bbody"><b>${e.name}${e.boss ? ' <span class="btag">BOSS</span>' : ''}</b><span class="where">${where}</span>
          <span class="bdesc">${e.description}</span>
          <div class="bstats"><span>❤ ${e.hp}</span><span>👟 ${e.speed}</span><span>🛡 ${pct(e.armor)}</span><span>✨ ${pct(e.magicResist)}</span>${e.flying ? '<span>🪽 Flies</span>' : ''}</div>
          <ul class="btips">${enemyTips(e).map((t) => `<li>${t}</li>`).join('')}</ul>
          <small class="muted">Seen ${fmt(rec!.seen)} · Defeated ${fmt(rec!.killed)}</small></div>
      </div>`;
    }).join('');
    m.innerHTML = `<div class="ribbon">Bestiary</div>
      <div class="trophy-summary"><b>${found}</b> of ${ids.length} discovered<i class="tbar"><b style="width:${Math.round((found / ids.length) * 100)}%"></b></i></div>
      <div class="beasts">${cards}</div>`;
  }, { wide: true });
}

// --- Daily Challenge -------------------------------------------------------------------------------

function untilMidnight(): number {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).getTime() - n.getTime();
}

export function challenge(game: Game): void {
  const { meta } = game.s;
  const c = meta.challengeFor();
  const st = meta.challengeState();
  game.s.ui.modal((m, h) => {
    const twists = c.twists.map((t) => `<div class="twist"><span class="tw-ico">${TWISTS[t].icon}</span><div><b>${TWISTS[t].name}</b><small>${TWISTS[t].description}</small></div></div>`).join('');
    const arsenal = c.towers ? `<div class="ch-towers">${c.towers.map((t) => `<img src="${towerThumb(t)}" alt="${TOWERS[t].name}" title="${TOWERS[t].name}"/>`).join('')}</div>` : '';
    const hist = st.history.slice(-7).map((x) => `<div class="hbar" title="${x.day}"><i style="height:${Math.max(6, (x.score / Math.max(1, st.best)) * 100)}%"></i><small>${x.score}</small></div>`).join('');
    const played = st.attempted;
    m.innerHTML = `<div class="ribbon purple">${icon('swords')} Daily Challenge</div>
      <div class="muted" style="text-align:center;margin-bottom:8px">Everyone gets the same siege today. Survive as many waves as you can: <b>one attempt</b> per day.</div>
      <div class="ch-card">
        <div class="ch-row"><span>${ageTitle(c.startWave)}</span><span>Starts at wave ${c.startWave + 1}</span></div>
        <div class="ch-row"><span>${icon('coin')} ${c.gold} gold</span><span>Every pad cleared</span></div>
        ${twists}
        ${arsenal}
      </div>
      <div class="stat-grid">
        <div>${played ? st.score : '–'}<small>TODAY</small></div>
        <div>${st.best}<small>YOUR BEST</small></div>
        <div>${CHALLENGE.coinsPerWave}${icon('coin')}<small>PER WAVE</small></div>
      </div>
      ${hist ? `<div class="hist">${hist}</div>` : ''}
      <div class="muted" style="text-align:center">Beat your best for a ${icon('chest')} chest. Your towers' permanent upgrades and mastery count.</div>
      <div class="actions">${played
        ? `<div class="muted">Today's attempt: <b>${st.score} waves</b>. A new challenge in ${fmtTime(untilMidnight())}.</div>`
        : `<button class="btn big go">${icon('swords')} Begin the challenge</button>`}</div>`;
    m.querySelector<HTMLButtonElement>('.go')?.addEventListener('click', () => {
      h.close();
      game.enterChallenge();
    });
  });
}

/** The Daily Challenge ended: score, reward, and how close the next wave came. */
export function challengeResult(game: Game, score: number, res: { coins: number; newBest: boolean; prevBest: number; chest: ChestReward | null }, near: NearMiss | null, tip: string): void {
  const { ui, audio } = game.s;
  audio.play(res.newBest ? 'victory' : 'defeat');
  ui.modal((m, h) => {
    m.innerHTML = `<div class="ribbon ${res.newBest ? 'win' : 'purple'}">${res.newBest ? 'New personal best!' : 'Challenge over'}</div>
      <div class="reward-row">${icon('swords')} ${score} wave${score === 1 ? '' : 's'}</div>
      ${res.newBest && res.prevBest > 0 ? `<div style="text-align:center;font-weight:800">Beat your old best of ${res.prevBest}!</div>` : !res.newBest ? `<div class="muted" style="text-align:center">Your best is ${res.prevBest} waves.</div>` : ''}
      ${nearMissHtml(near)}
      <div class="reward-row coins-row">${icon('coin')}<span class="amt">+${res.coins}</span></div>
      ${res.chest ? `<div style="text-align:center;font-weight:900">${icon('chest')} Personal best chest!</div>` : ''}
      <div class="tip">💡 ${tip}</div>
      <div class="muted" style="text-align:center">A new challenge arrives in ${fmtTime(untilMidnight())}.</div>
      <div class="actions"><button class="btn big ok">${icon('home')} Main menu</button></div>`;
    $(m, '.ok').onclick = () => {
      h.close();
      game.goTitle();
      if (res.chest) setTimeout(() => chestReveal(game, res.chest!), 400);
    };
  }, { closable: false });
}

export interface NearMiss {
  wave: number;
  enemiesLeft: number;
  boss: { name: string; hpFrac: number } | null;
}

/** "So close!" line for a loss (empty when it wasn't close). */
function nearMissHtml(n: NearMiss | null): string {
  if (!n) return '';
  if (n.boss && n.boss.hpFrac <= 0.35) {
    return `<div class="near">So close! The <b>${n.boss.name}</b> had only <b>${Math.max(1, Math.round(n.boss.hpFrac * 100))}%</b> HP left.</div>`;
  }
  if (n.enemiesLeft > 0 && n.enemiesLeft <= 8) {
    return `<div class="near">So close! Just <b>${n.enemiesLeft} enem${n.enemiesLeft === 1 ? 'y' : 'ies'}</b> stood between you and clearing wave ${n.wave + 1}.</div>`;
  }
  return '';
}

// --- Kingdom (town buildings) -------------------------------------------------------------------------

export function town(game: Game): void {
  const { meta } = game.s;
  game.s.ui.modal((m) => {
    const render = () => {
      const d = meta.d;
      const rows = BUILDINGS.map((b) => {
        const built = meta.hasBuilding(b.id);
        const open = meta.buildingUnlocked(b.id);
        const btn = built ? `<button class="btn small gold disabled" disabled>Built ✓</button>`
          : !open ? `<button class="btn small disabled" disabled>Wave ${b.unlockWave}</button>`
          : `<button class="btn small ${d.coins < b.cost ? 'disabled' : ''}" data-b="${b.id}">${costHtml(b.cost)}</button>`;
        return `<div class="list-item ${built ? 'built' : ''} ${open ? '' : 'locked-row'}"><div class="thumb bld">${b.icon}</div>
          <div class="body"><div class="name">${b.name}</div><div class="desc">${b.description}</div></div>${btn}</div>`;
      }).join('');
      const n = d.buildings.length;
      m.innerHTML = `<div class="ribbon">${icon('town')} Your Kingdom</div>${currencyBar(game)}
        <div class="muted" style="text-align:center;margin:-4px 0 8px">Build on the land beyond the moat. Each building gives a lasting bonus and appears around your castle. ${n}/${BUILDINGS.length} built.</div>
        <div class="list">${rows}</div>`;
      m.querySelectorAll<HTMLButtonElement>('[data-b]').forEach((btn) => (btn.onclick = () => {
        const id = btn.dataset.b as BuildingId;
        if (meta.buyBuilding(id)) {
          game.s.audio.play('upgrade');
          game.s.ui.toast(`${BUILDING_BY_ID[id].name} built!`);
          game.refreshKingdomView();
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

// --- Welcome back --------------------------------------------------------------------------------------

function awayText(ms: number): string {
  const h = Math.floor(ms / 3600000);
  if (h >= 48) return `${Math.floor(h / 24)} days`;
  if (h >= 1) return `${h} hour${h > 1 ? 's' : ''}`;
  return `${Math.max(1, Math.round(ms / 60000))} minutes`;
}

export function welcomeBack(game: Game, info: NonNullable<ReturnType<Game['s']['meta']['welcomeBack']>>): void {
  const { meta } = game.s;
  game.s.ui.modal((m, h) => {
    const ready: string[] = [];
    if (info.daily) ready.push(`<button class="ready-item" data-go="daily">${icon('calendar')}<span>Daily reward</span></button>`);
    if (info.chestReady) ready.push(`<button class="ready-item" data-go="chest">${icon('chest')}<span>Chest ready</span></button>`);
    if (info.challenge) ready.push(`<button class="ready-item" data-go="challenge">${icon('swords')}<span>New challenge</span></button>`);
    if (info.building) ready.push(`<button class="ready-item" data-go="town">${icon('town')}<span>You can build the ${info.building}</span></button>`);
    if (info.towerUpgrades) ready.push(`<button class="ready-item" data-go="shop">${icon('shop')}<span>${info.towerUpgrades} tower upgrade${info.towerUpgrades > 1 ? 's' : ''} affordable</span></button>`);
    m.innerHTML = `<div class="ribbon win">Welcome back!</div>
      <div class="muted" style="text-align:center">You were away for <b>${awayText(info.awayMs)}</b>. Your kingdom kept working:</div>
      <div class="reward-row coins-row">${icon('coin')}<span class="amt">${info.treasury}</span></div>
      <div class="muted" style="text-align:center;margin-top:-6px">in the Royal Treasury</div>
      <div class="stack slot" style="margin-top:10px"></div>
      ${ready.length ? `<div class="ready-list">${ready.join('')}</div>` : ''}
      <div class="goal">🎯 <b>Next goal:</b> ${info.goal}</div>
      <div class="actions"><button class="btn collect">${info.treasury > 0 ? `Collect ${info.treasury}` : 'Continue'}</button></div>`;
    let collected = false;
    const collect = (mult: number, from: HTMLElement) => {
      if (collected) return;
      collected = true;
      const got = meta.collectTreasury(mult);
      if (got > 0) flyCoins(game, from, got);
    };
    if (info.treasury >= TREASURY.minCollect) {
      $(m, '.slot').append(adButton(game, 'welcome_triple', 'Triple it!', `+${info.treasury * 3} coins instead of ${info.treasury}`, (b) => {
        collect(3, b);
        $(m, '.coins-row .amt').textContent = `${info.treasury * 3}`;
        markUsed(b, `Tripled! +${info.treasury * 3}`);
        ($(m, '.collect') as HTMLElement).textContent = 'Continue';
      }));
    }
    $(m, '.collect').onclick = (e) => {
      if (info.treasury > 0) collect(1, e.currentTarget as HTMLElement);
      h.close();
    };
    m.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) => (b.onclick = () => {
      if (info.treasury > 0) collect(1, b);
      h.close();
      const go = b.dataset.go;
      setTimeout(() => {
        if (go === 'daily') daily(game);
        else if (go === 'chest') chest(game);
        else if (go === 'challenge') challenge(game);
        else if (go === 'town') town(game);
        else if (go === 'shop') shop(game);
      }, 250);
    }));
  }, { closable: false, onClose: () => refreshCoins(game) });
}

// --- Realms (maps) ------------------------------------------------------------------------------

/** A tiny top-down sketch of a realm's roads and castle. */
function mapSketch(def: MapDef): string {
  const N = GRID_SIZE + 2;
  const s = (v: number) => ((v + 1) / N) * 100;
  const lines = def.roads.map((r, i) => `<polyline points="${r.points.map(([c, rr]) => `${s(c) + 3.3},${s(rr) + 3.3}`).join(' ')}" fill="none" stroke="${i === 0 ? '#c9a66b' : '#8f8070'}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" ${i ? 'stroke-dasharray="4 4"' : ''}/>`).join('');
  const [cc, cr] = def.roads[0].points[def.roads[0].points.length - 1];
  return `<svg viewBox="0 0 100 100" class="map-sketch"><rect x="3" y="3" width="94" height="94" rx="10" fill="#7bbf5a"/>${lines}<rect x="${s(cc) - 1.5}" y="${s(cr) - 1.5}" width="10" height="10" rx="2" fill="#e8e0d0" stroke="#5a4a3a" stroke-width="2"/></svg>`;
}

export function realms(game: Game): void {
  const { meta } = game.s;
  game.s.ui.modal((m, h) => {
    const cur = meta.mapId();
    const rows = MAPS.map((def) => {
      const open = meta.mapUnlocked(def.id);
      const here = def.id === cur;
      const base = meta.mapBase(def.id);
      const status = here ? 'Current realm' : base ? `Wave ${base.wave + 1} · best ${meta.mapBest(def.id)}` : open ? 'Not yet founded' : `Reach wave ${def.unlockWave} anywhere`;
      const btn = here ? `<button class="btn small gold disabled" disabled>Here</button>`
        : !open ? `<button class="btn small disabled" disabled>${icon('lock').replace('class="ico ', 'class="ico " style="width:16px;height:16px"')} W${def.unlockWave}</button>`
        : `<button class="btn small" data-map="${def.id}">${base ? 'Go' : 'Found'}</button>`;
      return `<div class="list-item realm ${here ? 'built' : ''} ${open ? '' : 'locked-row'}"><div class="thumb">${mapSketch(def)}</div>
        <div class="body"><div class="name">${def.icon} ${def.name}</div><div class="desc">${def.description}</div><div class="desc" style="font-weight:900">${status}</div></div>${btn}</div>`;
    }).join('');
    m.innerHTML = `<div class="ribbon">${icon('map')} Realms</div>
      <div class="muted" style="text-align:center;margin:-4px 0 8px">Each realm is its own kingdom with its own roads, towers and best wave. Your upgrades, heroes, mastery and town come with you.</div>
      <div class="list">${rows}</div>`;
    m.querySelectorAll<HTMLButtonElement>('[data-map]').forEach((b) => (b.onclick = () => {
      h.close();
      game.switchMap(b.dataset.map as MapId);
      game.s.ui.toast(`Welcome to ${MAP_BY_ID[b.dataset.map as MapId].name}!`);
    }));
  });
}

// --- Hero skills ------------------------------------------------------------------------------------

/** The hero's skill tiers: chosen perks, the one waiting to be picked, and locked ones. */
function perkRow(game: Game, id: HeroId): string {
  const meta = game.s.meta;
  const lvl = meta.heroLevel(id);
  const picks = meta.d.heroPerks[id] ?? [];
  const pending = meta.pendingPerkTier(id);
  const chips = PERK_TIERS.map((t, i) => {
    const p = picks[i];
    if (lvl >= t.level && (p === 0 || p === 1)) {
      const perk = PERKS[t.options[p]];
      return `<span class="perk on" title="${perk.description}">${perk.icon} ${perk.name}</span>`;
    }
    if (lvl >= t.level) return `<span class="perk pending">★ Lv ${t.level}</span>`;
    return `<span class="perk locked">Lv ${t.level}</span>`;
  }).join('');
  return `<div class="perks">${chips}${pending >= 0 ? `<button class="btn small gold" data-perk="${id}">Choose skill!</button>` : ''}</div>`;
}

/** Pick one of the two perks of a skill tier. */
export function perkChoice(game: Game, id: HeroId, tier: number, onDone?: () => void): void {
  if (tier < 0) return;
  const { meta, ui, audio } = game.s;
  const t = PERK_TIERS[tier];
  const h = HEROES[id];
  ui.modal((m, handle) => {
    m.innerHTML = `<div class="ribbon purple">New skill: ${h.name}</div>
      <div class="muted" style="text-align:center;margin-bottom:10px">Level ${t.level} reached. Choose one: it's kept forever for ${h.name}.</div>
      <div class="perk-choice">${t.options.map((pid, i) => {
        const p = PERKS[pid];
        return `<button class="perk-card" data-opt="${i}"><span class="pi">${p.icon}</span><b>${p.name}</b><span>${p.description}</span></button>`;
      }).join('')}</div>`;
    m.querySelectorAll<HTMLButtonElement>('[data-opt]').forEach((b) => (b.onclick = () => {
      meta.choosePerk(id, tier, Number(b.dataset.opt) as 0 | 1);
      audio.play('upgrade');
      ui.toast(`${h.name} learned ${PERKS[t.options[Number(b.dataset.opt)]].name}!`);
      game.battle?.refreshHero();
      handle.close();
      // Another tier may be waiting (a big level jump).
      const next = meta.pendingPerkTier(id);
      if (next >= 0) setTimeout(() => perkChoice(game, id, next, onDone), 300);
      else onDone?.();
    }));
  }, { closable: false });
}

// --- Stats ----------------------------------------------------------------------------------------

export function stats(game: Game): void {
  const { meta } = game.s;
  const d = meta.d;
  const hours = d.stats.playTime / 3600;
  const time = hours >= 1 ? `${hours.toFixed(1)} h` : `${Math.round(d.stats.playTime / 60)} min`;
  // Favourite tower: the one with the most mastery XP.
  const fav = TOWER_ORDER.reduce((a, t) => (meta.masteryXp(t) > meta.masteryXp(a) ? t : a), TOWER_ORDER[0]);
  const seen = Object.values(d.bestiary).filter((b) => b && b.seen > 0).length;
  const tile = (v: string | number, label: string) => `<div>${typeof v === 'number' ? fmt(v) : v}<small>${label}</small></div>`;
  game.s.ui.modal((m) => {
    m.innerHTML = `<div class="ribbon">${icon('scroll')} Your Records</div>
      <div class="stat-section">Kingdom</div>
      <div class="stat-grid wide">
        ${tile(meta.bestWave(), 'BEST WAVE')}
        ${tile(d.stats.wavesCleared, 'WAVES CLEARED')}
        ${tile(d.stats.kills, 'ENEMIES DEFEATED')}
        ${tile(d.life.bossKills, 'BOSSES')}
        ${tile(d.life.eliteKills, 'ELITES')}
        ${tile(time, 'TIME PLAYED')}
      </div>
      <div class="stat-section">Building</div>
      <div class="stat-grid wide">
        ${tile(d.life.towersBuilt, 'TOWERS BUILT')}
        ${tile(d.life.celestialTowers, 'CELESTIAL TOWERS')}
        ${tile(d.life.barricades, 'BARRICADES')}
        ${tile(d.life.synergies, 'SYNERGIES')}
        ${tile(d.buildings.length + '/7', 'TOWN BUILDINGS')}
        ${tile(d.life.abilityUses + (d.life.spellsCast ?? 0), 'ABILITIES & SPELLS')}
      </div>
      <div class="stat-section">Treasure</div>
      <div class="stat-grid wide">
        ${tile(d.stats.coinsEarned, 'COINS EARNED')}
        ${tile(d.achievements.length + '/' + ACHIEVEMENTS.length, 'TROPHIES')}
        ${tile(seen + '/' + Object.keys(ENEMIES).length, 'ENEMIES MET')}
        ${tile(d.challenge.best, 'CHALLENGE BEST')}
        ${tile(d.daily.streak, 'LOGIN STREAK')}
        ${tile(d.unlocks.heroes.length + '/' + HERO_ORDER.length, 'HEROES')}
      </div>
      <div class="stat-section">Favourite tower</div>
      <div class="list-item"><div class="thumb"><img src="${towerThumb(fav, Math.max(1, Math.min(10, meta.masteryLevel(fav) + 1)))}" alt=""/></div>
        <div class="body"><div class="name">${TOWERS[fav].name}</div><div class="desc">Mastery ${meta.masteryLevel(fav)} · ${fmt(meta.masteryXp(fav))} XP</div></div></div>
      <div class="stat-section">Realms</div>
      <div class="list">${MAPS.map((r) => `<div class="list-item ${meta.mapUnlocked(r.id) ? '' : 'locked-row'}"><div class="thumb">${mapSketch(r)}</div>
        <div class="body"><div class="name">${r.icon} ${r.name}</div><div class="desc">${meta.mapUnlocked(r.id) ? `Best wave ${meta.mapBest(r.id)}` : `Opens at wave ${r.unlockWave}`}</div></div></div>`).join('')}</div>`;
  });
}

// --- Menu hubs ---------------------------------------------------------------------------------------

export interface HubTile {
  label: string;
  icon: string;
  dot?: boolean;
  locked?: string | null;
  sub?: string;
  open: () => void;
}

/** A group of menu tiles (Rewards, Kingdom, Records). */
export function hub(game: Game, title: string, tiles: HubTile[]): void {
  game.s.ui.modal((m, h) => {
    m.innerHTML = `<div class="ribbon">${title}</div><div class="hub-grid">${tiles.map((t, i) => `<button class="hub-tile ${t.locked ? 'locked' : ''}" data-i="${i}">
      ${t.icon}<span>${t.label}</span>${t.sub ? `<small>${t.sub}</small>` : ''}${t.locked ? `<small>${t.locked}</small>` : ''}<i class="dot ${t.dot ? 'on' : ''}"></i></button>`).join('')}</div>`;
    m.querySelectorAll<HTMLButtonElement>('[data-i]').forEach((b) => (b.onclick = () => {
      const t = tiles[Number(b.dataset.i)];
      if (t.locked) {
        game.s.ui.toast(t.locked);
        return;
      }
      h.close();
      setTimeout(t.open, 120);
    }));
  });
}
