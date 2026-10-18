// The Reward Track: a monthly track of 30 tiers. Stars come from playing each day (capped, so the
// track takes a few weeks of regular play), the rewards are the same every month, and the last
// tier is a hero skin unique to that month. Progress resets when the month turns.

import type { HeroId } from './heroes';

export const PASS = {
  tiers: 30,
  /** Stars to climb one tier. */
  starsPerTier: 140,
  /** Stars per wave cleared (siege or challenge), up to `waveCapPerDay` stars a day. */
  starsPerWave: 2,
  waveCapPerDay: 100,
  /** Stars for each daily mission completed. */
  starsPerMission: 40,
  /** Stars for finishing the day's Daily Challenge attempt. */
  starsChallenge: 30,
  /** Stars for the first visit of the day. */
  starsLogin: 20,
  /** Once the track is complete, every this many stars pays a bonus chest. */
  bonusEvery: 300,
};

export type PassReward =
  | { kind: 'coins'; amount: number }
  | { kind: 'shards'; amount: number }
  | { kind: 'heroXp'; amount: number }
  | { kind: 'chest'; shards?: number }
  | { kind: 'skin'; shards: number };

/** The same 30 rewards every month (the skin at tier 30 is the month's own). */
export const PASS_TIERS: PassReward[] = [
  { kind: 'coins', amount: 150 }, { kind: 'shards', amount: 3 }, { kind: 'coins', amount: 200 }, { kind: 'heroXp', amount: 150 }, { kind: 'chest' },
  { kind: 'coins', amount: 250 }, { kind: 'shards', amount: 5 }, { kind: 'coins', amount: 300 }, { kind: 'heroXp', amount: 250 }, { kind: 'chest' },
  { kind: 'coins', amount: 350 }, { kind: 'shards', amount: 6 }, { kind: 'coins', amount: 400 }, { kind: 'heroXp', amount: 350 }, { kind: 'chest', shards: 10 },
  { kind: 'coins', amount: 450 }, { kind: 'shards', amount: 8 }, { kind: 'coins', amount: 500 }, { kind: 'heroXp', amount: 450 }, { kind: 'chest' },
  { kind: 'coins', amount: 550 }, { kind: 'shards', amount: 10 }, { kind: 'coins', amount: 600 }, { kind: 'heroXp', amount: 600 }, { kind: 'chest' },
  { kind: 'coins', amount: 700 }, { kind: 'shards', amount: 12 }, { kind: 'coins', amount: 800 }, { kind: 'chest', shards: 15 }, { kind: 'skin', shards: 20 },
];

export interface SeasonSkin {
  id: string;
  hero: HeroId;
  name: string;
  /** Multiplies the hero's colours. */
  tint: string;
  /** A soft glow added on top. */
  glow: string;
  /** The hero's aura on the ground. */
  aura: string;
}

export interface Season {
  /** 'YYYY-MM'. */
  month: string;
  name: string;
  blurb: string;
  /** Accent colour for the track's banner. */
  color: string;
  skin: SeasonSkin;
}

const S = (month: string, name: string, blurb: string, color: string, hero: HeroId, skinName: string, tint: string, glow: string, aura: string): Season =>
  ({ month, name, blurb, color, skin: { id: `skin_${month.replace('-', '_')}`, hero, name: skinName, tint, glow, aura } });

/** One season per month, October 2026 to December 2027. */
export const SEASONS: Season[] = [
  S('2026-10', 'Harvest Moon', 'Pumpkins ripen and the moon hangs low and orange over the fields.', '#e8822a', 'ranger', 'Harvest Robin', '#ff962c', '#682b00', '#ff9a3a'),
  S('2026-11', 'Emberfall', 'The forges burn day and night as the leaves turn to ash.', '#d9573f', 'dwarf', 'Forgefire Brokk', '#ff692c', '#731c00', '#ff6a2a'),
  S('2026-12', "Winter's Crown", 'Snow settles on the battlements and the court dresses in silver.', '#7ab8ff', 'mage', 'Snow Queen Elowen', '#bcdbff', '#123973', '#9fdcff'),
  S('2027-01', 'Frostbite', 'The deepest cold of the year, when even steel turns blue.', '#5aa8d8', 'knight', 'Glacier Bramble', '#78c4ff', '#0e4464', '#7fd0ff'),
  S('2027-02', 'Heartsong', 'Roses climb the castle walls and the valkyries sing.', '#ef6a9a', 'valkyrie', 'Rose Seraphine', '#ff87ad', '#680e2b', '#ff8ab4'),
  S('2027-03', 'Verdant Spring', 'Green returns to the kingdom, thorns and all.', '#5fbf4a', 'ranger', 'Thornwood Robin', '#86f058', '#124b0e', '#7dff6a'),
  S('2027-04', 'Storm Season', 'Thunder rolls in off the sea and lightning dances on the towers.', '#7a6aff', 'ninja', 'Stormblade Kage', '#8778ff', '#2b1c85', '#a090ff'),
  S('2027-05', 'Bloom', 'Petals drift across the roads and the mages work in blossom.', '#f08ad0', 'mage', 'Blossom Elowen', '#ffa6e2', '#561248', '#ff9ae0'),
  S('2027-06', 'Midsummer', 'The longest day: the sun never quite sets on the kingdom.', '#f2c94c', 'valkyrie', 'Solar Seraphine', '#ffd34a', '#734b00', '#ffd84a'),
  S('2027-07', 'Sunken Tide', 'The moat rises and old things stir beneath the water.', '#3ac0b0', 'knight', 'Tidecaller Bramble', '#58f0d9', '#00685d', '#5ae8d0'),
  S('2027-08', 'Sandstorm', 'Hot winds blow in from the dunes, carrying gold dust.', '#d8b060', 'dwarf', 'Dune Brokk', '#f8ca60', '#4b3200', '#ffd27a'),
  S('2027-09', 'Twilight', 'The evenings stretch long and shadows walk the walls.', '#7060c0', 'ninja', 'Duskwalker Kage', '#6244d8', '#241256', '#8a6aff'),
  S('2027-10', "Hallow's Eve", 'Lanterns glow in every window and something laughs in the woods.', '#ff8a2a', 'ranger', 'Lantern Robin', '#ff6900', '#852b00', '#ff7a1a'),
  S('2027-11', 'Iron Oath', 'The knights renew their vows in blackened steel.', '#6a6a80', 'knight', 'Obsidian Bramble', '#7676a0', '#241c32', '#b090ff'),
  S('2027-12', 'Starfall', 'Stars tumble from the winter sky and the court wears the night.', '#a090ff', 'mage', 'Starlight Elowen', '#b5a6ff', '#2e1c73', '#c0b0ff'),
];

export const SEASON_SKINS: SeasonSkin[] = SEASONS.map((s) => s.skin);
export const SKIN_BY_ID = Object.fromEntries(SEASON_SKINS.map((k) => [k.id, k])) as Record<string, SeasonSkin>;

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The season for a month. Past the written calendar, earlier seasons return as encores. */
export function seasonFor(d = new Date()): Season {
  const key = monthKey(d);
  const exact = SEASONS.find((s) => s.month === key);
  if (exact) return exact;
  const months = (d.getFullYear() - 2026) * 12 + d.getMonth() - 9; // months since October 2026
  const base = SEASONS[((months % SEASONS.length) + SEASONS.length) % SEASONS.length];
  return { ...base, month: key, name: `${base.name} (Encore)` };
}

/** Days left in the month (counting today). */
export function daysLeftInMonth(d = new Date()): number {
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return end.getDate() - d.getDate() + 1;
}
