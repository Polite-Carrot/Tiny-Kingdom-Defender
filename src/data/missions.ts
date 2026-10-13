// Daily mission pool. Three missions are drawn per day (deterministic from the date).

export type MissionStat =
  | 'kills'
  | 'wins'
  | 'heroAbility'
  | 'towersBuilt'
  | 'upgrades'
  | 'winFewTowers'
  | 'threeStars'
  | 'bossKills'
  | 'flyingKills'
  | 'goldEarned'
  | 'earlyCalls';

export interface MissionDef {
  id: string;
  stat: MissionStat;
  target: number;
  reward: number;
  text: string;
}

export const MISSION_POOL: MissionDef[] = [
  { id: 'kill200', stat: 'kills', target: 200, reward: 50, text: 'Defeat 200 enemies' },
  { id: 'kill400', stat: 'kills', target: 400, reward: 80, text: 'Defeat 400 enemies' },
  { id: 'win2', stat: 'wins', target: 2, reward: 45, text: 'Win 2 levels' },
  { id: 'win4', stat: 'wins', target: 4, reward: 80, text: 'Win 4 levels' },
  { id: 'hero10', stat: 'heroAbility', target: 10, reward: 50, text: 'Use your hero ability 10 times' },
  { id: 'build15', stat: 'towersBuilt', target: 15, reward: 40, text: 'Build 15 towers' },
  { id: 'upgrade12', stat: 'upgrades', target: 12, reward: 45, text: 'Upgrade towers 12 times' },
  { id: 'few3', stat: 'winFewTowers', target: 1, reward: 70, text: 'Win a level with 3 towers or fewer' },
  { id: 'stars3', stat: 'threeStars', target: 2, reward: 60, text: 'Earn 3 stars on 2 levels' },
  { id: 'boss1', stat: 'bossKills', target: 1, reward: 60, text: 'Defeat a boss' },
  { id: 'fly30', stat: 'flyingKills', target: 30, reward: 45, text: 'Shoot down 30 flying enemies' },
  { id: 'gold3k', stat: 'goldEarned', target: 3000, reward: 50, text: 'Earn 3000 gold in battle' },
  { id: 'early5', stat: 'earlyCalls', target: 5, reward: 40, text: 'Call 5 waves early' },
];

export const MISSIONS_PER_DAY = 3;
