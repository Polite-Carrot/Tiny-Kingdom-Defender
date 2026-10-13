// Ad placement and interstitial-rule configuration.

export type RewardedPlacement =
  | 'checkpoint_double'
  | 'revive'
  | 'reinforcements'
  | 'treasury_double'
  | 'chest_skip'
  | 'gold_rush'
  | 'shop_bundle';

export const REWARDED_PLACEMENTS: Record<RewardedPlacement, { label: string }> = {
  checkpoint_double: { label: 'Double checkpoint coins' },
  revive: { label: 'Revive castle' },
  reinforcements: { label: 'Reinforcements' },
  treasury_double: { label: 'Double treasury' },
  chest_skip: { label: 'Open chest now' },
  gold_rush: { label: 'Gold Rush: double kill gold for 3 waves' },
  shop_bundle: { label: 'Free coin bundle' },
};

export const INTERSTITIAL_RULES = {
  /** Show after every Nth checkpoint reached (a checkpoint = 10 waves survived). */
  everyNthWin: 2,
  /** Never before the player's best wave reaches this. */
  minLevelsCompleted: 30,
  /** Never in the first N seconds of a session. */
  minSessionSeconds: 180,
  /** Skip if a rewarded ad was watched within N seconds. */
  rewardedCooldownSeconds: 180,
};

export const MOCK_AD = {
  /** Countdown length of the mock ad in seconds. */
  durationSeconds: 5,
  /** Simulated load delay in ms. */
  loadDelayMs: 300,
};
