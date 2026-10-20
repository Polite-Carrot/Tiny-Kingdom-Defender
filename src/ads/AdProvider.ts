// Ad SDK abstraction. Implement this interface for Unity Ads / AdMob.

export type RewardedResult = 'completed' | 'skipped' | 'failed';

export interface AdProvider {
  init(): Promise<void>;
  isRewardedReady(): boolean;
  showRewarded(placement: string): Promise<RewardedResult>;
  isInterstitialReady(): boolean;
  showInterstitial(placement: string): Promise<void>;
  /** Whether the player allows personalised ads (real ad networks only). */
  setPersonalised?(on: boolean): void;
}
