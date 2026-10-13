// Headless wave simulator: plays every level with a heuristic AI at several
// meta-upgrade levels and reports win rate and remaining castle HP.
//
//   npm run sim                 # full campaign table
//   npm run sim -- --seeds 3    # fewer seeds (faster)
//   npm run sim -- --levels 1-15
//   npm run sim -- --endless

import { Run, type MetaBonuses } from '../src/game/Run';
import { AutoPlayer } from '../src/game/AutoPlayer';
import { buildCampaignLevel, buildEndlessLevel, buildWeeklyLevel, type LevelDef } from '../src/game/Levels';
import { TOTAL_LEVELS, TOWER_UNLOCK_LEVEL, FEATURE_UNLOCK_LEVEL } from '../src/data/levels';
import { META_UPGRADES, TOWER_META, UNLOCKS, LEVEL_REWARDS, metaCost } from '../src/data/economy';
import type { TowerId } from '../src/data/towers';

const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const SEEDS = Number(arg('seeds', '4'));
const ONLY = arg('profiles', '');
const [from, to] = arg('levels', `1-${TOTAL_LEVELS}`).split('-').map(Number);
const DT = 1 / 30;
const MAX_TIME = 60 * 15;

interface Profile {
  name: string;
  meta: (level: number) => MetaBonuses;
  lightning: boolean;
}

const lvl = (n: number) => ({ archer: n, cannon: n, frost: n, lightning: n });

/** Coins a typical (no-ads) player has earned before playing level i. */
const EXTRA_COINS_PER_LEVEL = 30; // missions, treasury, daily login, chests (approx.)
function typicalMeta(levelIndex: number): { meta: MetaBonuses; lightning: boolean } {
  let coins = 0;
  for (let k = 0; k < levelIndex; k++) {
    coins += Math.round(LEVEL_REWARDS.winBase + LEVEL_REWARDS.winPerLevel * k) + 2.3 * LEVEL_REWARDS.perStar + EXTRA_COINS_PER_LEVEL;
  }
  const towers = { archer: 0, cannon: 0, frost: 0, lightning: 0 };
  const m = { castleHp: 0, startGold: 0, heroPower: 0 };
  let lightning = false;
  for (let guard = 0; guard < 200; guard++) {
    if (!lightning && levelIndex >= UNLOCKS.lightning.requiresLevel && coins >= UNLOCKS.lightning.cost) {
      coins -= UNLOCKS.lightning.cost;
      lightning = true;
      continue;
    }
    const options: { cost: number; buy: () => void }[] = [];
    for (const t of ['archer', 'cannon', 'frost', 'lightning'] as const) {
      if (t === 'lightning' && !lightning) continue;
      if (towers[t] < TOWER_META.maxLevel) options.push({ cost: metaCost(TOWER_META.baseCost, towers[t]), buy: () => towers[t]++ });
    }
    for (const k of ['castleHp', 'startGold', 'heroPower'] as const) {
      if (m[k] < META_UPGRADES[k].maxLevel) options.push({ cost: metaCost(META_UPGRADES[k].baseCost, m[k]) * 1.3, buy: () => m[k]++ });
    }
    options.sort((a, b) => a.cost - b.cost);
    const o = options[0];
    if (!o || o.cost > coins) break;
    coins -= Math.round(o.cost);
    o.buy();
  }
  return {
    lightning,
    meta: {
      towerLevels: towers,
      castleHpBonus: m.castleHp * META_UPGRADES.castleHp.perLevel,
      startGoldBonus: m.startGold * META_UPGRADES.startGold.perLevel,
      heroPower: m.heroPower * META_UPGRADES.heroPower.perLevel,
      heroId: 'ranger',
    },
  };
}

const PROFILES: Profile[] = [
  {
    name: 'none', lightning: false,
    meta: () => ({ towerLevels: lvl(0), castleHpBonus: 0, startGoldBonus: 0, heroPower: 0, heroId: 'ranger' }),
  },
  {
    name: 'typ', lightning: true,
    meta: (i) => typicalMeta(i).meta,
  },
  {
    name: 'high', lightning: true,
    meta: () => ({ towerLevels: lvl(8), castleHpBonus: 8 * META_UPGRADES.castleHp.perLevel, startGoldBonus: 8 * META_UPGRADES.startGold.perLevel, heroPower: 8 * META_UPGRADES.heroPower.perLevel, heroId: 'ranger' }),
  },
];

function towersFor(level: LevelDef, profile: Profile): TowerId[] {
  const idx = Math.min(level.globalIndex, 999);
  return (['archer', 'cannon', 'frost', 'lightning'] as TowerId[]).filter((t) => {
    if (t === 'lightning' && !(profile.name === 'typ' ? typicalMeta(level.globalIndex).lightning : profile.lightning)) return false;
    return TOWER_UNLOCK_LEVEL[t] <= idx;
  });
}

interface Result {
  won: boolean;
  hpFrac: number;
  wave: number;
  time: number;
}

export function simulate(level: LevelDef, profile: Profile, seed: number): Result {
  const meta = profile.meta(level.globalIndex);
  if (level.globalIndex < FEATURE_UNLOCK_LEVEL.hero) meta.heroId = null;
  const run = new Run({
    level,
    meta,
    availableTowers: towersFor(level, profile),
    allowSpecialisation: level.globalIndex >= FEATURE_UNLOCK_LEVEL.specialisation,
    seed: seed * 7919 + level.globalIndex,
  });
  const ai = new AutoPlayer(run, seed * 31 + 7);
  let t = 0;
  while ((run.state === 'prep' || run.state === 'playing') && t < MAX_TIME) {
    ai.update(DT);
    run.update(DT);
    t += DT;
  }
  return { won: run.state === 'won', hpFrac: run.castleHp / run.castleMaxHp, wave: run.waveIndex, time: run.time };
}

function pad(s: string | number, n: number) {
  return String(s).padStart(n);
}

function main() {
  if (ONLY) PROFILES.splice(0, PROFILES.length, ...PROFILES.filter((p) => ONLY.split(',').includes(p.name)));
  const t0 = Date.now();
  if (args.includes('--endless')) {
    for (const p of PROFILES) {
      const waves: number[] = [];
      for (let s = 0; s < SEEDS; s++) waves.push(simulate(buildEndlessLevel(), p, s).wave);
      console.log(`Endless [${p.name}] waves reached: ${waves.join(', ')}`);
    }
    return;
  }
  if (args.includes('--debug')) {
    const li = Number(arg('debug', '1')) - 1;
    const level = buildCampaignLevel(li);
    const p = PROFILES.find((x) => x.name === arg('profile', 'typ'))!;
    const meta = p.meta(li);
    const run = new Run({ level, meta, availableTowers: towersFor(level, p), allowSpecialisation: li >= FEATURE_UNLOCK_LEVEL.specialisation, seed: Number(arg('seed', '0')) * 7919 + li });
    const ai = new AutoPlayer(run, Number(arg('seed', '0')) * 31 + 7);
    const leaks: Record<string, number> = {};
    run.events.on('enemyLeak', ({ enemy }) => (leaks[`w${enemy.wave + 1}:${enemy.def.id}`] = (leaks[`w${enemy.wave + 1}:${enemy.def.id}`] ?? 0) + 1));
    run.events.on('waveStart', ({ index }) => {
      const w = run.waveDef(index)!;
      console.log(`t=${run.time.toFixed(0)}s wave ${index + 1}: ${w.groups.map((g) => `${g.count}x${g.enemy}@p${g.path}`).join(', ')} hp×${w.hpMult.toFixed(2)} gold=${run.gold} towers=${run.towers.map((t) => t.def.id[0] + t.tier).join(' ')}`);
    });
    let t = 0;
    while ((run.state === 'prep' || run.state === 'playing') && t < MAX_TIME) {
      ai.update(DT);
      run.update(DT);
      t += DT;
    }
    console.log(level.name, 'paths', run.map.paths.map((x) => x.length.toFixed(1)).join('/'), 'spots', run.map.buildSpots.length, '→', run.state, 'hp', run.castleHp, 'leaks', leaks);
    return;
  }
  if (args.includes('--weekly')) {
    for (const p of PROFILES) {
      const lv = buildWeeklyLevel(new Date());
      const r = Array.from({ length: SEEDS }, (_, s) => simulate(lv, p, s));
      console.log(`Weekly ${lv.name} [${p.name}] win ${r.filter((x) => x.won).length}/${SEEDS}`);
    }
    return;
  }
  console.log(`Tiny Kingdom Defender — balance simulation (${SEEDS} seeds per cell)\n`);
  if (args.includes('--meta')) for (const i of [0, 5, 10, 15, 20, 30, 40, 50, 59]) console.log(`meta@${i + 1}`, JSON.stringify(typicalMeta(i)));
  console.log('Level  Name                    Boss  Waves |' + PROFILES.map((p) => ` ${p.name.padEnd(4)} win  hp%  |`).join(''));
  console.log('-'.repeat(46 + PROFILES.length * 18));
  const totals = PROFILES.map(() => ({ wins: 0, n: 0 }));
  for (let i = from - 1; i < to; i++) {
    const level = buildCampaignLevel(i);
    let line = `${pad(i + 1, 4)}   ${level.name.padEnd(22).slice(0, 22)}  ${level.isBoss ? ' B ' : '   '}  ${pad(level.waves.length, 4)}  |`;
    PROFILES.forEach((p, pi) => {
      const res = Array.from({ length: SEEDS }, (_, s) => simulate(level, p, s));
      const wins = res.filter((r) => r.won).length;
      const hp = res.reduce((a, r) => a + r.hpFrac, 0) / SEEDS;
      totals[pi].wins += wins;
      totals[pi].n += SEEDS;
      line += `  ${pad(Math.round((wins / SEEDS) * 100), 4)}% ${pad(Math.round(hp * 100), 4)}%  |`;
    });
    console.log(line);
    if ((i + 1) % 15 === 0) console.log('-'.repeat(46 + PROFILES.length * 18));
  }
  console.log('\nOverall win rate: ' + PROFILES.map((p, i) => `${p.name} ${Math.round((totals[i].wins / totals[i].n) * 100)}%`).join(' · '));
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
