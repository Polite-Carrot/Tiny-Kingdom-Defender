// Unity Ads in the apps, through the shared @politecarrot/capacitor-unity-ads plugin (the same one
// Color Match & Merge uses). It owns the native SDK, consent signals and Apple's tracking prompt;
// this adapter keeps an ad of each kind loaded so the game can ask synchronously.

import { Capacitor } from '@capacitor/core';
import { createUnityAds, type UnityAdsClient } from '@politecarrot/capacitor-unity-ads';
import type { AdProvider, RewardedResult, TrackingStatus } from './AdProvider';
import { UNITY_ADS, type UnityAdIds } from '../data/ads';

/** How often a missing ad is asked for again. */
const RELOAD_MS = 15000;

/** This app's Unity ad IDs, or null where none are set yet (the game then keeps the mock ads). */
export function unityIds(): UnityAdIds | null {
  const p = Capacitor.getPlatform();
  const ids = p === 'ios' ? UNITY_ADS.ios : p === 'android' ? UNITY_ADS.android : null;
  return ids && ids.gameId ? ids : null;
}

export class UnityAdsProvider implements AdProvider {
  private client: UnityAdsClient;
  private started = false;
  private loading = { rewarded: false, interstitial: false };
  private ios: boolean;
  private testMode: boolean;
  /** Why the SDK didn't start, and why each kind of ad last failed to load (developer mode shows these). */
  private initError = '';
  private lastReason = { rewarded: '', interstitial: '' };

  /** testMode: Unity's test ads (on for testers; real ads on your own phone can get the account flagged). */
  constructor(ids: UnityAdIds, testMode: boolean, private personalised: () => boolean, bridge: typeof Capacitor = Capacitor) {
    const config = { gameId: ids.gameId, rewarded: ids.rewarded, interstitial: ids.interstitial };
    this.ios = bridge.getPlatform() === 'ios';
    this.testMode = testMode;
    this.client = createUnityAds({ ios: config, android: config, testMode, capacitor: bridge });
  }

  async init(): Promise<void> {
    // Consent goes in before the SDK starts, so the first ad already respects it.
    await this.client.setPersonalized(this.personalised()).catch(() => {});
    if (!(await this.client.init())) {
      this.initError = 'Unity Ads did not start (check the Game ID and the network); retrying';
      // No network at launch must not mean no ads all session: try again shortly.
      window.setTimeout(() => void this.init().catch(() => {}), RELOAD_MS);
      throw new Error(this.initError);
    }
    this.initError = '';
    this.started = true;
    this.prepare();
    window.setInterval(() => this.prepare(), RELOAD_MS);
  }

  /** Loads whichever ads are missing (after a show, a failed load, or a consent change). */
  private prepare(): void {
    if (!this.started) return;
    const { prepared, showing } = this.client.state();
    if (showing) return;
    for (const kind of ['rewarded', 'interstitial'] as const) {
      if (prepared[kind] || this.loading[kind]) continue;
      this.loading[kind] = true;
      const load = kind === 'rewarded' ? this.client.prepareRewarded() : this.client.prepareInterstitial();
      void load
        .then((r: { loaded: boolean; reason?: string; code?: unknown }) => {
          this.lastReason[kind] = r.loaded ? '' : `${r.reason ?? 'not loaded'}${r.code !== undefined ? ` (code ${String(r.code)})` : ''}`;
        })
        .catch((e: unknown) => (this.lastReason[kind] = String((e as Error)?.message ?? e)))
        .finally(() => (this.loading[kind] = false));
    }
  }

  setPersonalised(on: boolean): void {
    // A consent change discards loaded ads, so load fresh ones under the new choice.
    void this.client.setPersonalized(on).catch(() => {}).finally(() => this.prepare());
  }

  async requestTracking(): Promise<TrackingStatus | null> {
    if (!this.ios) return null;
    const status = await this.client.requestTracking().catch(() => null);
    return status === 'authorized' || status === 'denied' || status === 'restricted' || status === 'notDetermined' ? status : null;
  }

  status(): string[] {
    const st = this.client.state();
    const line = (kind: 'rewarded' | 'interstitial') =>
      `${kind === 'rewarded' ? 'Rewarded' : 'Interstitial'}: ${st.prepared[kind] ? 'ready' : this.loading[kind] ? 'loading…' : this.lastReason[kind] || 'not loaded yet'}`;
    return [
      `Unity Ads: ${this.initError || (st.ready ? 'started' : 'starting…')}${this.testMode ? ' · test ads' : ' · real ads'}`,
      line('rewarded'),
      line('interstitial'),
      `Personalised: ${st.effectivePersonalized ? 'yes' : 'no'}${this.ios ? ` · Apple tracking: ${st.attStatus ?? 'unknown'}` : ''}`,
    ];
  }

  isRewardedReady(): boolean {
    return this.client.state().prepared.rewarded;
  }

  isInterstitialReady(): boolean {
    return this.client.state().prepared.interstitial;
  }

  async showRewarded(_placement: string): Promise<RewardedResult> {
    try {
      const r = await this.client.showRewarded();
      return r.rewarded ? 'completed' : r.shown && r.finishState === 'skipped' ? 'skipped' : 'failed';
    } finally {
      this.prepare();
    }
  }

  async showInterstitial(_placement: string): Promise<void> {
    try {
      await this.client.showInterstitial();
    } finally {
      this.prepare();
    }
  }
}
