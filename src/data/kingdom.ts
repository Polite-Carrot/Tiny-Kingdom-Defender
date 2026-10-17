// The kingdom around the castle: buildings that appear on the land beyond the moat as you
// progress. Each unlocks at a best wave, is bought once with coins, and gives a small bonus.

export type BuildingId = 'farm' | 'blacksmith' | 'market' | 'chapel' | 'wizard' | 'windmill' | 'barracks';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  description: string;
  /** Best wave needed before it can be built. */
  unlockWave: number;
  cost: number;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'farm', name: 'Farmstead', description: 'Treasury earns 25% more while you are away', unlockWave: 5, cost: 300 },
  { id: 'blacksmith', name: 'Blacksmith', description: 'All towers deal 5% more damage', unlockWave: 10, cost: 600 },
  { id: 'market', name: 'Market', description: '+8% gold from defeated enemies', unlockWave: 15, cost: 900 },
  { id: 'chapel', name: 'Chapel', description: '+3 castle HP', unlockWave: 20, cost: 1200 },
  { id: 'wizard', name: 'Wizard Tower', description: 'Your hero deals 10% more damage', unlockWave: 30, cost: 1700 },
  { id: 'windmill', name: 'Windmill', description: '+20% coins for every wave cleared', unlockWave: 40, cost: 2300 },
  { id: 'barracks', name: 'Barracks', description: 'Barricades have 30% more HP', unlockWave: 50, cost: 3000 },
];

export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b])) as Record<BuildingId, BuildingDef>;

/** Where each building stands on the land beyond the moat (x, z). */
export const BUILDING_PLOTS: Record<BuildingId, [number, number]> = {
  farm: [-4.5, 12.5],
  market: [3.6, 12.5],
  chapel: [12.5, 2.6],
  blacksmith: [-12.5, 3.4],
  wizard: [-12.6, -5.6],
  windmill: [5.4, -12.6],
  barracks: [12.6, -5.6],
};

export const KINGDOM_BONUS = {
  farmTreasury: 0.25,
  blacksmithDamage: 0.05,
  marketGold: 0.08,
  chapelHp: 3,
  wizardHero: 0.1,
  windmillCoins: 0.2,
  barracksHp: 0.3,
};
