// Unity Ads, through the native plugin in the apps (ios/App/App/UnityAdsPlugin.swift and
// android/app/src/main/java/com/politecarrot/tinykingdomdefender/UnityAdsPlugin.java).

import { Capacitor, registerPlugin } from '@capacitor/core';
import type { AdProvider, RewardedResult } from './AdProvider';
import { UNITY_ADS, type UnityAdIds } from '../data/ads';

interface UnityAdsPlugin {
  initialize(o: { gameId: string; testMode: boolean }): Promise<void>;
  setConsent(o: { personalised: boolean }): Promise<void>;
  load(o: { placementId: string }): Promise<void>;
  isLoaded(o: { placementId: string }): Promise<{ loaded: boolean }>;
  show(o: { placementId: string }): Promise<{ result: RewardedResult }>;
}

const UnityAds = registerPlugin<UnityAdsPlugin>('UnityAds');

/** This app's Unity ad IDs, or null where none are set yet (the game then keeps the mock ads). */
export function unityIds(): UnityAdIds | null {
  const p = Capacitor.getPlatform();
  const ids = p === 'ios' ? UNITY_ADS.ios : p === 'android' ? UNITY_ADS.android : null;
  return ids && ids.gameId ? ids : null;
}

export class UnityAdsProvider implements AdProvider {
  /** Whether each ad unit has an ad loaded, polled from the plugin (the game asks synchronously). */
  private loaded = { rewarded: false, interstitial: false };

  /** testMode: Unity's test ads (on for testers; real ads on your own phone can get the account flagged). */
  constructor(private ids: UnityAdIds, private testMode: boolean, private personalised: () => boolean) {}

  async init(): Promise<void> {
    const ids = this.ids;
    // Consent goes in before the SDK starts, so the first ad already respects it.
    await UnityAds.setConsent({ personalised: this.personalised() }).catch(() => {});
    await UnityAds.initialize({ gameId: ids.gameId, testMode: this.testMode });
    for (const id of [ids.rewarded, ids.interstitial]) await UnityAds.load({ placementId: id });
    const poll = async () => {
      try {
        this.loaded.rewarded = (await UnityAds.isLoaded({ placementId: ids.rewarded })).loaded;
        this.loaded.interstitial = (await UnityAds.isLoaded({ placementId: ids.interstitial })).loaded;
      } catch {
        /* keep the last known state */
      }
    };
    await poll();
    window.setInterval(poll, 2000);
  }

  setPersonalised(on: boolean): void {
    void UnityAds.setConsent({ personalised: on }).catch(() => {});
  }

  isRewardedReady(): boolean {
    return this.loaded.rewarded;
  }

  isInterstitialReady(): boolean {
    return this.loaded.interstitial;
  }

  async showRewarded(_placement: string): Promise<RewardedResult> {
    this.loaded.rewarded = false;
    return (await UnityAds.show({ placementId: this.ids.rewarded })).result;
  }

  async showInterstitial(_placement: string): Promise<void> {
    this.loaded.interstitial = false;
    await UnityAds.show({ placementId: this.ids.interstitial });
  }
}
