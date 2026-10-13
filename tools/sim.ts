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
import { META_UPGRADES } from '../src/data/economy';
import type { TowerId } from '../src/data/towers';

const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const SEEDS = Number(arg('seeds', '4'));
const [from, to] = arg('levels', `1-${TOTAL_LEVELS}`).split('-').map(Number);
const DT = 1 / 30;
const MAX_TIME = 60 * 15;

interface Profile {
  name: string;
  meta: (level: number) => MetaBonuses;
  lightning: boolean;
}

const lvl = (n: number) => ({ archer: n, cannon: n, frost: n, lightning: n });
const PROFILES: Profile[] = [
  {
    name: 'none', lightning: false,
    meta: () => ({ towerLevels: lvl(0), castleHpBonus: 0, startGoldBonus: 0, heroPower: 0, heroId: 'ranger' }),
  },
  {
    name: 'mid', lightning: true,
    meta: () => ({ towerLevels: lvl(3), castleHpBonus: 3 * META_UPGRADES.castleHp.perLevel, startGoldBonus: 3 * META_UPGRADES.startGold.perLevel, heroPower: 3 * META_UPGRADES.heroPower.perLevel, heroId: 'ranger' }),
  },
  {
    name: 'high', lightning: true,
    meta: () => ({ towerLevels: lvl(6), castleHpBonus: 6 * META_UPGRADES.castleHp.perLevel, startGoldBonus: 6 * META_UPGRADES.startGold.perLevel, heroPower: 6 * META_UPGRADES.heroPower.perLevel, heroId: 'ranger' }),
  },
];

function towersFor(level: LevelDef, profile: Profile): TowerId[] {
  const idx = Math.min(level.globalIndex, 999);
  return (['archer', 'cannon', 'frost', 'lightning'] as TowerId[]).filter((t) => {
    if (t === 'lightning' && !profile.lightning) return false;
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
  const t0 = Date.now();
  if (args.includes('--endless')) {
    for (const p of PROFILES) {
      const waves: number[] = [];
      for (let s = 0; s < SEEDS; s++) waves.push(simulate(buildEndlessLevel(), p, s).wave);
      console.log(`Endless [${p.name}] waves reached: ${waves.join(', ')}`);
    }
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
