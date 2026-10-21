// Ad SDK abstraction. Implement this interface for Unity Ads / AdMob.

export type RewardedResult = 'completed' | 'skipped' | 'failed';

/** Apple's App Tracking Transparency answer (iOS only). */
export type TrackingStatus = 'authorized' | 'denied' | 'restricted' | 'notDetermined';

export interface AdProvider {
  init(): Promise<void>;
  isRewardedReady(): boolean;
  showRewarded(placement: string): Promise<RewardedResult>;
  isInterstitialReady(): boolean;
  showInterstitial(placement: string): Promise<void>;
  /** Whether the player allows personalised ads (real ad networks only). */
  setPersonalised?(on: boolean): void;
  /** iOS: shows Apple's tracking prompt (once per install) and resolves with the answer; null elsewhere. */
  requestTracking?(): Promise<TrackingStatus | null>;
  /** What the ad network last reported, for the Developer section of Settings. */
  status?(): string[];
}
