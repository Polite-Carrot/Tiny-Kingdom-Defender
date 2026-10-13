// Headless balance simulator for the endless kingdom siege.
//
//   npm run sim                         # career simulation: long-term progress per profile
//   npm run sim -- --hours 30           # longer careers
//   npm run sim -- --push               # single pushes from a fresh kingdom (no retreats)
//   npm run sim -- --waves              # per-wave composition / HP table
//
// "Career" plays ONE persistent kingdom like a player would: when the castle falls it retreats
// to the last checkpoint (towers and gold kept), coins from waves and checkpoints are spent on
// permanent upgrades, and play continues. It reports how long (game time at 1x) it takes to
// reach each checkpoint.

import { Run, newKingdom, type MetaBonuses } from '../src/game/Run';
import { AutoPlayer } from '../src/game/AutoPlayer';
import { siegeWave, waveCoins, checkpointCoins, ageTitle, hpMultFor } from '../src/game/Siege';
import { waveSummary } from '../src/game/WaveComposer';
import { META_UPGRADES, TOWER_META, UNLOCKS, metaCost } from '../src/data/economy';
import { TOWER_UNLOCK_WAVE, SIEGE } from '../src/data/base';
import { materialFor, type TowerId } from '../src/data/towers';

const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const DT = 1 / 30;

interface MetaState {
  towers: Record<TowerId, number>;
  castleHp: number;
  warChest: number;
  heroPower: number;
  lightning: boolean;
  coins: number;
}

const freshMeta = (): MetaState => ({ towers: { archer: 0, cannon: 0, frost: 0, lightning: 0 }, castleHp: 0, warChest: 0, heroPower: 0, lightning: false, coins: 0 });

function bonuses(m: MetaState): MetaBonuses {
  return {
    towerLevels: { ...m.towers },
    castleHpBonus: m.castleHp * META_UPGRADES.castleHp.perLevel,
    goldBonus: m.warChest * META_UPGRADES.warChest.perLevel,
    heroPower: m.heroPower * META_UPGRADES.heroPower.perLevel,
    heroId: 'ranger',
  };
}

function towersFor(m: MetaState, bestWave: number): TowerId[] {
  return (['archer', 'cannon', 'frost', 'lightning'] as TowerId[]).filter((t) => (t !== 'lightning' || m.lightning) && TOWER_UNLOCK_WAVE[t] <= bestWave);
}

/** Greedy "typical player" spending: cheapest permanent upgrade first. */
function spend(m: MetaState, bestWave: number): void {
  for (let guard = 0; guard < 100; guard++) {
    if (!m.lightning && bestWave >= UNLOCKS.lightning.requiresWave && m.coins >= UNLOCKS.lightning.cost) {
      m.coins -= UNLOCKS.lightning.cost;
      m.lightning = true;
      continue;
    }
    const opts: { cost: number; buy: () => void }[] = [];
    for (const t of ['archer', 'cannon', 'frost', 'lightning'] as const) {
      if (t === 'lightning' && !m.lightning) continue;
      if (m.towers[t] < TOWER_META.maxLevel) opts.push({ cost: metaCost(TOWER_META.baseCost, m.towers[t]), buy: () => m.towers[t]++ });
    }
    for (const k of ['castleHp', 'warChest', 'heroPower'] as const) {
      if (m[k] < META_UPGRADES[k].maxLevel) opts.push({ cost: metaCost(META_UPGRADES[k].baseCost, m[k]) * 1.25, buy: () => m[k]++ });
    }
    opts.sort((a, b) => a.cost - b.cost);
    const o = opts[0];
    if (!o || o.cost > m.coins) return;
    m.coins -= Math.round(o.cost);
    o.buy();
  }
}

const fmtH = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)}h` : `${Math.round(s / 60)}m`);

interface Milestone {
  wave: number;
  time: number;
  retreats: number;
  towers: string;
}

interface CareerResult {
  milestones: Milestone[];
  bestWave: number;
  retreats: number;
}

/**
 * One persistent kingdom over `hours` of play time.
 * spendCoins=false models a player who never buys permanent upgrades.
 * coinsPerHour = extra coins from missions, daily rewards, chests and treasury (no ads).
 */
function career(hours: number, seed: number, spendCoins: boolean, coinsPerHour: number): CareerResult {
  const meta = freshMeta();
  let best = 0;
  let checkpointsPaid = 0;
  const run = new Run({ snapshot: newKingdom(), meta: bonuses(meta), availableTowers: towersFor(meta, 0), seed });
  const ai = new AutoPlayer(run, seed * 31 + 7);
  const res: CareerResult = { milestones: [], bestWave: 0, retreats: 0 };
  const limit = hours * 3600;
  let t = 0;
  let lastIncome = 0;
  let lastSpend = 0;
  const refresh = () => {
    if (spendCoins) spend(meta, best);
    run.applyMeta(bonuses(meta));
    run.config.availableTowers.splice(0, run.config.availableTowers.length, ...towersFor(meta, best));
  };
  run.events.on('waveCleared', ({ index }) => {
    meta.coins += waveCoins(index);
    if (index + 1 > best) best = index + 1;
  });
  run.events.on('checkpoint', ({ wave }) => {
    const first = wave > checkpointsPaid;
    meta.coins += checkpointCoins(wave, first);
    if (!first) return;
    checkpointsPaid = wave;
    const tiers = run.towers.map((x) => x.tier);
    const avg = tiers.length ? tiers.reduce((a, b) => a + b, 0) / tiers.length : 1;
    res.milestones.push({
      wave, time: t, retreats: res.retreats,
      towers: `${run.towers.length} towers, avg ${materialFor(Math.round(avg)).name} (${avg.toFixed(1)}), best ${materialFor(Math.max(...tiers, 1)).name}; meta Lv ${meta.towers.archer}`,
    });
  });
  while (t < limit) {
    ai.update(DT);
    run.update(DT);
    t += DT;
    if (t - lastIncome >= 600) {
      meta.coins += (coinsPerHour * (t - lastIncome)) / 3600;
      lastIncome = t;
    }
    if (run.state === 'lost') {
      res.retreats++;
      refresh();
      run.retreat();
    } else if (t - lastSpend > 120 && run.isQuiet()) {
      lastSpend = t;
      refresh();
    }
  }
  res.bestWave = best;
  return res;
}

function push(seed: number, metaLevel: number): { wave: number; time: number } {
  const m = freshMeta();
  m.lightning = metaLevel > 0;
  for (const k of ['archer', 'cannon', 'frost', 'lightning'] as const) m.towers[k] = metaLevel;
  m.castleHp = m.warChest = m.heroPower = Math.min(15, metaLevel);
  const run = new Run({ snapshot: newKingdom(), meta: bonuses(m), availableTowers: towersFor(m, 999), seed });
  const ai = new AutoPlayer(run, seed * 31 + 7);
  let t = 0;
  while (run.state !== 'lost' && t < 8 * 3600) {
    ai.update(DT);
    run.update(DT);
    t += DT;
  }
  return { wave: run.currentWave + 1, time: t };
}

function main() {
  const t0 = Date.now();
  if (args.includes('--waves')) {
    console.log('Wave  Age                   HP×    Gold×  Enemies');
    for (const n of [0, 1, 2, 4, 9, 14, 19, 24, 29, 39, 49, 59, 74, 99, 124, 149, 199]) {
      const w = siegeWave(n);
      console.log(`${String(n + 1).padStart(4)}  ${ageTitle(n).padEnd(20)}  ${hpMultFor(n).toFixed(2).padStart(5)}  ${w.goldMult.toFixed(2).padStart(5)}  ${waveSummary(w).map((x) => `${x.count}×${x.enemy}`).join(', ')}`);
    }
    return;
  }
  if (args.includes('--push')) {
    const seeds = Number(arg('seeds', '3'));
    console.log('Single push from a fresh kingdom, no retreats (waves survived):');
    for (const lv of [0, 5, 10, 15, 20]) {
      const r = Array.from({ length: seeds }, (_, s) => push(s + 1, lv));
      console.log(`  all permanent upgrades at Lv ${String(lv).padStart(2)}: waves ${r.map((x) => x.wave).join(', ')}  (avg ${fmtH(r.reduce((a, b) => a + b.time, 0) / r.length)})`);
    }
    console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return;
  }

  const hours = Number(arg('hours', '20'));
  const seeds = Number(arg('seeds', '2'));
  const profiles = [
    { name: 'Typical player (spends coins on upgrades, no ads)', spend: true, extra: 60 },
    { name: 'Never buys permanent upgrades', spend: false, extra: 0 },
  ];
  console.log(`Tiny Kingdom Defender — career simulation (${hours}h of play at 1x per kingdom, ${seeds} seeds)\n`);
  for (const p of profiles) {
    console.log(`== ${p.name} ==`);
    const results = Array.from({ length: seeds }, (_, s) => career(hours, s + 1, p.spend, p.extra));
    const allWaves = [...new Set(results.flatMap((r) => r.milestones.map((m) => m.wave)))].sort((a, b) => a - b);
    console.log('Checkpoint   ' + results.map((_, i) => `seed ${i + 1} time (falls)`.padEnd(22)).join('') + 'kingdom at checkpoint (seed 1)');
    for (const w of allWaves) {
      const cells = results.map((r) => {
        const m = r.milestones.find((x) => x.wave === w);
        return (m ? `${fmtH(m.time)} (${m.retreats})` : '—').padEnd(22);
      });
      const m1 = results[0].milestones.find((x) => x.wave === w);
      console.log(`  wave ${String(w).padStart(3)}   ${cells.join('')}${m1 ? m1.towers : ''}`);
    }
    console.log(`  best wave after ${hours}h: ${results.map((r) => r.bestWave).join(', ')} · castle falls: ${results.map((r) => r.retreats).join(', ')}\n`);
  }
  console.log(`Times are game time at 1x speed (2x halves them). Wave gap ${SIEGE.waveGap}s.`);
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
