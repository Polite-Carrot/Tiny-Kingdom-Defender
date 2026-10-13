// Daily mission pool. Three missions are drawn per day (deterministic from the date).

export type MissionStat =
  | 'kills'
  | 'wavesCleared'
  | 'heroAbility'
  | 'towersBuilt'
  | 'upgrades'
  | 'bossKills'
  | 'flyingKills'
  | 'goldEarned'
  | 'earlyCalls'
  | 'landCleared'
  | 'checkpoints';

export interface MissionDef {
  id: string;
  stat: MissionStat;
  target: number;
  reward: number;
  text: string;
}

export const MISSION_POOL: MissionDef[] = [
  { id: 'kill200', stat: 'kills', target: 200, reward: 50, text: 'Defeat 200 enemies' },
  { id: 'kill500', stat: 'kills', target: 500, reward: 90, text: 'Defeat 500 enemies' },
  { id: 'waves10', stat: 'wavesCleared', target: 10, reward: 50, text: 'Clear 10 waves' },
  { id: 'waves25', stat: 'wavesCleared', target: 25, reward: 100, text: 'Clear 25 waves' },
  { id: 'hero10', stat: 'heroAbility', target: 10, reward: 50, text: 'Use your hero ability 10 times' },
  { id: 'build8', stat: 'towersBuilt', target: 8, reward: 40, text: 'Build 8 towers' },
  { id: 'upgrade15', stat: 'upgrades', target: 15, reward: 50, text: 'Upgrade towers 15 times' },
  { id: 'boss1', stat: 'bossKills', target: 1, reward: 60, text: 'Defeat a boss' },
  { id: 'fly30', stat: 'flyingKills', target: 30, reward: 45, text: 'Shoot down 30 flying enemies' },
  { id: 'gold3k', stat: 'goldEarned', target: 3000, reward: 50, text: 'Earn 3000 gold in battle' },
  { id: 'early5', stat: 'earlyCalls', target: 5, reward: 40, text: 'Call 5 waves early' },
  { id: 'land2', stat: 'landCleared', target: 2, reward: 45, text: 'Clear land for 2 new build pads' },
  { id: 'cp1', stat: 'checkpoints', target: 1, reward: 70, text: 'Reach a checkpoint' },
];

export const MISSIONS_PER_DAY = 3;
