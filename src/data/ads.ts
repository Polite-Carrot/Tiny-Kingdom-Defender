// Ad placement and interstitial-rule configuration.

export type RewardedPlacement =
  | 'checkpoint_double'
  | 'revive'
  | 'treasury_double'
  | 'chest_skip'
  | 'shop_bundle';

export const REWARDED_PLACEMENTS: Record<RewardedPlacement, { label: string }> = {
  checkpoint_double: { label: 'Double checkpoint coins' },
  revive: { label: 'Revive castle' },
  treasury_double: { label: 'Double treasury' },
  chest_skip: { label: 'Open chest now' },
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
