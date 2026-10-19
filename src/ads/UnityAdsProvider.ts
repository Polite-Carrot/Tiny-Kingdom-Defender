// Unity Ads, through the native plugin in the iOS app (ios/App/App/UnityAdsPlugin.swift).

import { registerPlugin } from '@capacitor/core';
import type { AdProvider, RewardedResult } from './AdProvider';
import { UNITY_ADS } from '../data/ads';

interface UnityAdsPlugin {
  initialize(o: { gameId: string; testMode: boolean }): Promise<void>;
  load(o: { placementId: string }): Promise<void>;
  isLoaded(o: { placementId: string }): Promise<{ loaded: boolean }>;
  show(o: { placementId: string }): Promise<{ result: RewardedResult }>;
}

const UnityAds = registerPlugin<UnityAdsPlugin>('UnityAds');

export class UnityAdsProvider implements AdProvider {
  /** Whether each ad unit has an ad loaded, polled from the plugin (the game asks synchronously). */
  private loaded = { rewarded: false, interstitial: false };

  async init(): Promise<void> {
    await UnityAds.initialize({ gameId: UNITY_ADS.gameId, testMode: UNITY_ADS.testMode });
    for (const id of [UNITY_ADS.rewarded, UNITY_ADS.interstitial]) await UnityAds.load({ placementId: id });
    const poll = async () => {
      try {
        this.loaded.rewarded = (await UnityAds.isLoaded({ placementId: UNITY_ADS.rewarded })).loaded;
        this.loaded.interstitial = (await UnityAds.isLoaded({ placementId: UNITY_ADS.interstitial })).loaded;
      } catch {
        /* keep the last known state */
      }
    };
    await poll();
    window.setInterval(poll, 2000);
  }

  isRewardedReady(): boolean {
    return this.loaded.rewarded;
  }

  isInterstitialReady(): boolean {
    return this.loaded.interstitial;
  }

  async showRewarded(_placement: string): Promise<RewardedResult> {
    this.loaded.rewarded = false;
    return (await UnityAds.show({ placementId: UNITY_ADS.rewarded })).result;
  }

  async showInterstitial(_placement: string): Promise<void> {
    this.loaded.interstitial = false;
    await UnityAds.show({ placementId: UNITY_ADS.interstitial });
  }
}
