// Ad placement and interstitial-rule configuration.

export type RewardedPlacement =
  | 'level_end_double'
  | 'revive'
  | 'reinforcements'
  | 'treasury_double'
  | 'chest_skip'
  | 'prelevel_gold'
  | 'shop_bundle';

export const REWARDED_PLACEMENTS: Record<RewardedPlacement, { label: string }> = {
  level_end_double: { label: 'Double coins' },
  revive: { label: 'Revive castle' },
  reinforcements: { label: 'Reinforcements' },
  treasury_double: { label: 'Double treasury' },
  chest_skip: { label: 'Open chest now' },
  prelevel_gold: { label: '+50% starting gold' },
  shop_bundle: { label: 'Free coin bundle' },
};

export const INTERSTITIAL_RULES = {
  /** Show after every Nth completed (won) level. */
  everyNthWin: 3,
  /** Never during the first N levels of the campaign (by highest level completed). */
  minLevelsCompleted: 5,
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
