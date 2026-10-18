// Achievements (the trophy room). Each reads a progress number from the save; reaching the
// target unlocks it once and pays its reward.

import type { SaveData } from '../core/Save';
import { ENEMIES, REGULAR_ENEMIES, BOSS_BY_CHAPTER, type EnemyId } from './enemies';
import { HERO_ORDER, heroLevelFor } from './heroes';
import { TOWER_ORDER } from './towers';
import { SYNERGIES } from './synergies';
import { SIEGE, TOWER_UNLOCK_WAVE } from './base';
import { MAPS, type MapId } from './maps';
import { PERK_TIERS } from './heroes';
import { MASTERY, masteryLevelFor } from './mastery';
import { BUILDINGS } from './kingdom';

export type TrophyIcon = 'skull' | 'trophy' | 'castle' | 'star' | 'hero' | 'bolt' | 'gem' | 'coin' | 'shield' | 'scroll' | 'map';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: TrophyIcon;
  target: number;
  progress: (d: SaveData) => number;
  reward: { coins: number; gems?: number };
  /** "Foes defeated" trophies show the enemy's portrait. */
  enemy?: EnemyId;
}

const discovered = (d: SaveData) => (Object.keys(ENEMIES) as EnemyId[]).filter((id) => (d.bestiary[id]?.seen ?? 0) > 0).length;
const maxHeroLevel = (d: SaveData) => Math.max(1, ...HERO_ORDER.map((h) => heroLevelFor(d.heroXp[h] ?? 0)));

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'kills1', name: 'First Blood', description: 'Defeat your first enemy.', icon: 'skull', target: 1, progress: (d) => d.stats.kills, reward: { coins: 20 } },
  { id: 'kills500', name: 'Goblin Bane', description: 'Defeat 500 enemies.', icon: 'skull', target: 500, progress: (d) => d.stats.kills, reward: { coins: 100 } },
  { id: 'kills5k', name: 'Warlord', description: 'Defeat 5,000 enemies.', icon: 'skull', target: 5000, progress: (d) => d.stats.kills, reward: { coins: 400, gems: 10 } },
  { id: 'kills50k', name: 'Living Legend', description: 'Defeat 50,000 enemies.', icon: 'skull', target: 50000, progress: (d) => d.stats.kills, reward: { coins: 2000, gems: 40 } },
  { id: 'boss1', name: 'Giant Slayer', description: 'Defeat a boss.', icon: 'trophy', target: 1, progress: (d) => d.life.bossKills, reward: { coins: 60 } },
  { id: 'boss10', name: 'Boss Hunter', description: 'Defeat 10 bosses.', icon: 'trophy', target: 10, progress: (d) => d.life.bossKills, reward: { coins: 250, gems: 5 } },
  { id: 'boss50', name: 'Bane of Tyrants', description: 'Defeat 50 bosses.', icon: 'trophy', target: 50, progress: (d) => d.life.bossKills, reward: { coins: 1000, gems: 25 } },
  { id: 'elite5', name: 'Elite Hunter', description: 'Defeat 5 elite enemies.', icon: 'gem', target: 5, progress: (d) => d.life.eliteKills, reward: { coins: 80 } },
  { id: 'elite50', name: 'Crowned Collector', description: 'Defeat 50 elite enemies.', icon: 'gem', target: 50, progress: (d) => d.life.eliteKills, reward: { coins: 500, gems: 15 } },
  { id: 'fly200', name: 'Sky Watcher', description: 'Shoot down 200 flying enemies.', icon: 'bolt', target: 200, progress: (d) => d.life.flyingKills, reward: { coins: 150 } },
  { id: 'wave10', name: 'Holding the Line', description: 'Reach wave 10.', icon: 'castle', target: 10, progress: (d) => d.progress.bestWave, reward: { coins: 50 } },
  { id: 'age1', name: 'Into the Sands', description: 'Reach the Age of Sands.', icon: 'map', target: SIEGE.ageEvery, progress: (d) => d.progress.bestWave, reward: { coins: 150 } },
  { id: 'age2', name: 'Through the Frost', description: 'Reach the Age of Frost.', icon: 'map', target: SIEGE.ageEvery * 2, progress: (d) => d.progress.bestWave, reward: { coins: 300, gems: 5 } },
  { id: 'age3', name: 'Trial by Fire', description: 'Reach the Age of Fire.', icon: 'map', target: SIEGE.ageEvery * 3, progress: (d) => d.progress.bestWave, reward: { coins: 500, gems: 10 } },
  { id: 'cycle', name: 'Ages Upon Ages', description: 'Survive all four Ages and start the cycle again.', icon: 'map', target: SIEGE.ageEvery * 4, progress: (d) => d.progress.bestWave, reward: { coins: 1000, gems: 20 } },
  { id: 'wave150', name: 'Eternal Kingdom', description: 'Reach wave 150.', icon: 'castle', target: 150, progress: (d) => d.progress.bestWave, reward: { coins: 2500, gems: 50 } },
  { id: 'perfect', name: 'Untouchable', description: 'Reach a checkpoint without the castle losing any health.', icon: 'shield', target: 1, progress: (d) => d.life.perfectCheckpoints, reward: { coins: 100 } },
  { id: 'perfect10', name: 'Impregnable', description: 'Reach 10 checkpoints at full castle health.', icon: 'shield', target: 10, progress: (d) => d.life.perfectCheckpoints, reward: { coins: 500, gems: 10 } },
  { id: 'build25', name: 'Builder', description: 'Build 25 towers.', icon: 'castle', target: 25, progress: (d) => d.life.towersBuilt, reward: { coins: 80 } },
  { id: 'build200', name: 'Royal Architect', description: 'Build 200 towers.', icon: 'castle', target: 200, progress: (d) => d.life.towersBuilt, reward: { coins: 400 } },
  { id: 'celestial', name: 'Touched by the Heavens', description: 'Upgrade a tower all the way to Celestial.', icon: 'star', target: 1, progress: (d) => d.life.celestialTowers, reward: { coins: 300, gems: 10 } },
  { id: 'alltowers', name: 'Full Arsenal', description: `Unlock all ${TOWER_ORDER.length} towers.`, icon: 'star', target: TOWER_ORDER.length, progress: (d) => TOWER_ORDER.filter((t) => (t !== 'lightning' || d.unlocks.lightning) && TOWER_UNLOCK_WAVE[t] <= d.progress.bestWave).length, reward: { coins: 300 } },
  { id: 'walls20', name: 'Hold the Gate', description: 'Build 20 barricades.', icon: 'shield', target: 20, progress: (d) => d.life.barricades, reward: { coins: 150 } },
  { id: 'syn1', name: 'Better Together', description: 'Form a tower synergy.', icon: 'bolt', target: 1, progress: (d) => d.life.synergies, reward: { coins: 60 } },
  { id: 'synall', name: 'Grand Strategist', description: 'Discover every tower synergy.', icon: 'bolt', target: SYNERGIES.length, progress: (d) => d.life.synergyTypes.length, reward: { coins: 600, gems: 15 } },
  { id: 'hero10', name: 'Seasoned Hero', description: 'Raise a hero to level 10.', icon: 'hero', target: 10, progress: maxHeroLevel, reward: { coins: 200 } },
  { id: 'hero30', name: 'Legend of the Realm', description: 'Raise a hero to level 30.', icon: 'hero', target: 30, progress: maxHeroLevel, reward: { coins: 1500, gems: 30 } },
  { id: 'heroes', name: 'Fellowship', description: 'Recruit all six heroes.', icon: 'hero', target: HERO_ORDER.length, progress: (d) => d.unlocks.heroes.length, reward: { coins: 500, gems: 10 } },
  { id: 'abilities', name: 'Heroic Deeds', description: 'Use hero abilities 100 times.', icon: 'hero', target: 100, progress: (d) => d.life.abilityUses, reward: { coins: 150 } },
  { id: 'bestiary10', name: 'Field Notes', description: 'Discover 10 kinds of enemy.', icon: 'scroll', target: 10, progress: discovered, reward: { coins: 100 } },
  { id: 'bestiary', name: 'Monster Scholar', description: 'Discover every enemy in the bestiary.', icon: 'scroll', target: Object.keys(ENEMIES).length, progress: discovered, reward: { coins: 800, gems: 20 } },
  { id: 'rich', name: 'Royal Treasury', description: 'Earn 10,000 coins in total.', icon: 'coin', target: 10000, progress: (d) => d.stats.coinsEarned, reward: { coins: 300, gems: 5 } },
  // Realms.
  { id: 'realm_serpent', name: 'Snake Charmer', description: 'Reach wave 25 in Serpent Pass.', icon: 'map', target: 25, progress: (d) => realmBest(d, 'serpent'), reward: { coins: 400, gems: 10 } },
  { id: 'realm_winds', name: 'Eye of the Storm', description: 'Reach wave 25 in Four Winds.', icon: 'map', target: 25, progress: (d) => realmBest(d, 'winds'), reward: { coins: 500, gems: 10 } },
  { id: 'realm_crooked', name: 'Keeper of the Corner', description: 'Reach wave 25 in Crooked Keep.', icon: 'map', target: 25, progress: (d) => realmBest(d, 'crooked'), reward: { coins: 600, gems: 15 } },
  { id: 'realm_founder', name: 'Founder of Realms', description: 'Clear a wave in all four realms.', icon: 'castle', target: MAPS.length, progress: (d) => MAPS.filter((m) => realmBest(d, m.id) > 0).length, reward: { coins: 300, gems: 10 } },
  { id: 'realm_all50', name: 'High King', description: 'Reach wave 50 in every realm.', icon: 'trophy', target: 50, progress: (d) => Math.min(...MAPS.map((m) => realmBest(d, m.id))), reward: { coins: 3000, gems: 60 } },
  // Night, weather, spells, skills, mastery and the town.
  { id: 'night30', name: 'Night Watch', description: 'Clear 30 waves at night.', icon: 'star', target: 30, progress: (d) => d.life.nightWaves ?? 0, reward: { coins: 250, gems: 5 } },
  { id: 'storm20', name: 'Storm Chaser', description: 'Clear 20 waves in rain, fog, sand, snow or ash.', icon: 'bolt', target: 20, progress: (d) => d.life.weatherWaves ?? 0, reward: { coins: 250, gems: 5 } },
  { id: 'spells50', name: 'Archmage', description: 'Cast 50 spells.', icon: 'bolt', target: 50, progress: (d) => d.life.spellsCast ?? 0, reward: { coins: 300, gems: 5 } },
  { id: 'perks', name: 'Master of Skills', description: 'Choose all five skills for one hero.', icon: 'hero', target: PERK_TIERS.length, progress: (d) => Math.max(0, ...Object.values(d.heroPerks).map((p) => (p ?? []).filter((x) => x === 0 || x === 1).length)), reward: { coins: 800, gems: 20 } },
  { id: 'mastered', name: 'Tower Master', description: 'Reach Master with any tower type.', icon: 'star', target: MASTERY.masterLevel, progress: (d) => Math.max(0, ...TOWER_ORDER.map((t) => masteryLevelFor(d.mastery[t] ?? 0))), reward: { coins: 1000, gems: 25 } },
  { id: 'townfull', name: 'Thriving Kingdom', description: 'Build every building in your town.', icon: 'castle', target: BUILDINGS.length, progress: (d) => d.buildings.length, reward: { coins: 1500, gems: 30 } },
  ...foeTrophies(),
];

/** One trophy per enemy type, earned the first time you defeat one. */
function foeTrophies(): AchievementDef[] {
  const ids: EnemyId[] = [...REGULAR_ENEMIES, 'slugling', ...BOSS_BY_CHAPTER];
  return ids.map((id) => {
    const e = ENEMIES[id];
    const boss = !!e.boss;
    const raider = id === 'thief' || id === 'tunneler' || id === 'siege';
    return {
      id: `foe_${id}`,
      name: boss ? `${e.name} Slain` : `Beat a ${e.name}`,
      description: boss ? `Defeat the ${e.name}.` : `Defeat your first ${e.name}.`,
      icon: 'skull' as const,
      target: 1,
      progress: (d: SaveData) => d.bestiary[id]?.killed ?? 0,
      reward: boss ? { coins: 300, gems: 10 } : raider || e.age !== undefined ? { coins: 80, gems: 2 } : { coins: 40 },
      enemy: id,
    };
  });
}

/** Best wave in a realm (Kingdom Vale counts the old overall best for older saves). */
function realmBest(d: SaveData, id: MapId): number {
  return d.realms?.best?.[id] ?? (id === 'vale' ? d.progress.bestWave : 0);
}
