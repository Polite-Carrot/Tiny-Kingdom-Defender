// Ad placement and interstitial-rule configuration.

export type RewardedPlacement =
  | 'checkpoint_double'
  | 'revive'
  | 'treasury_double'
  | 'chest_skip'
  | 'shop_bundle'
  | 'welcome_triple';

export const REWARDED_PLACEMENTS: Record<RewardedPlacement, { label: string }> = {
  checkpoint_double: { label: 'Double checkpoint coins' },
  revive: { label: 'Revive castle' },
  treasury_double: { label: 'Double treasury' },
  chest_skip: { label: 'Open chest now' },
  shop_bundle: { label: 'Free coin bundle' },
  welcome_triple: { label: 'Triple treasury (welcome back)' },
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

/**
 * Unity Ads (iOS app only; the website keeps the mock ads). Every rewarded placement in the
 * game shares the one rewarded ad unit; interstitials only ever show at checkpoints.
 * Set testMode to false for the App Store build: real ads on your own phone can get the
 * account flagged, so keep it on while testing.
 */
export const UNITY_ADS = {
  gameId: '800404139',
  rewarded: 'BP_Rewarded_iOS',
  interstitial: 'BP_Interstitial_iOS',
  testMode: true,
};

export const MOCK_AD = {
  /** Countdown length of the mock ad in seconds. */
  durationSeconds: 5,
  /** Simulated load delay in ms. */
  loadDelayMs: 300,
};
