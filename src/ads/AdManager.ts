// AdManager: wraps an AdProvider, enforces interstitial rules, tracks analytics,
// and pauses/mutes the game while an ad is showing.

import type { AdProvider, RewardedResult } from './AdProvider';
import type { Analytics } from '../analytics/Analytics';
import { INTERSTITIAL_RULES, type RewardedPlacement } from '../data/ads';

export interface InterstitialState {
  /** Wins since the last interstitial (including this one). */
  winsSinceLast: number;
  /** Highest campaign levels completed. */
  levelsCompleted: number;
  sessionSeconds: number;
  /** Seconds since the last completed rewarded ad (Infinity if none). */
  secondsSinceRewarded: number;
  result: 'win' | 'loss';
  /** A revive offer was shown during this level. */
  reviveOffered: boolean;
  removeAds: boolean;
}

export type InterstitialDecision = { show: true } | { show: false; reason: string };

/** Pure rule evaluation (unit-tested). */
export function evaluateInterstitial(s: InterstitialState, rules = INTERSTITIAL_RULES): InterstitialDecision {
  if (s.removeAds) return { show: false, reason: 'remove_ads' };
  if (s.result !== 'win') return { show: false, reason: 'not_a_win' };
  if (s.reviveOffered) return { show: false, reason: 'after_revive_offer' };
  if (s.levelsCompleted < rules.minLevelsCompleted) return { show: false, reason: 'early_levels' };
  if (s.sessionSeconds < rules.minSessionSeconds) return { show: false, reason: 'early_session' };
  if (s.secondsSinceRewarded < rules.rewardedCooldownSeconds) return { show: false, reason: 'recent_rewarded' };
  if (s.winsSinceLast < rules.everyNthWin) return { show: false, reason: 'frequency' };
  return { show: true };
}

export interface AdHooks {
  onOpen(): void;
  onClose(): void;
  toast(msg: string): void;
}

export class AdManager {
  private sessionStart = Date.now();
  private lastRewardedAt = -Infinity;
  private busy = false;

  constructor(private provider: AdProvider, private analytics: Analytics, private hooks: AdHooks) {}

  async init(): Promise<void> {
    try {
      await this.provider.init();
    } catch (e) {
      console.warn('[ads] init failed', e);
    }
  }

  get showing(): boolean {
    return this.busy;
  }

  /** Passes the player's personalised-ads choice to the ad network. */
  setPersonalised(on: boolean): void {
    this.provider.setPersonalised?.(on);
  }

  /** Whether real ad networks are in use (the apps), so the privacy choice matters. */
  get real(): boolean {
    return !!this.provider.setPersonalised;
  }

  isRewardedReady(): boolean {
    return this.provider.isRewardedReady();
  }

  /** Call when a rewarded button becomes visible. */
  offerShown(placement: RewardedPlacement): void {
    this.analytics.track('ad_offer_shown', { placement });
  }

  /** Shows a rewarded ad. Resolves true ONLY when the result is 'completed'. */
  async showRewarded(placement: RewardedPlacement): Promise<boolean> {
    this.analytics.track('ad_offer_clicked', { placement });
    if (this.busy) return false;
    if (!this.provider.isRewardedReady()) {
      this.analytics.track('ad_result', { placement, result: 'failed', reason: 'not_ready' });
      this.hooks.toast('Ad not available, try again later');
      return false;
    }
    this.busy = true;
    this.hooks.onOpen();
    let result: RewardedResult = 'failed';
    try {
      result = await this.provider.showRewarded(placement);
    } catch {
      result = 'failed';
    } finally {
      this.busy = false;
      this.hooks.onClose();
    }
    this.analytics.track('ad_result', { placement, result });
    if (result === 'completed') {
      this.lastRewardedAt = Date.now();
      return true;
    }
    this.hooks.toast(result === 'skipped' ? 'Ad skipped — no reward this time' : 'Ad not available, try again later');
    return false;
  }

  secondsSinceRewarded(): number {
    return (Date.now() - this.lastRewardedAt) / 1000;
  }

  sessionSeconds(): number {
    return (Date.now() - this.sessionStart) / 1000;
  }

  /** Evaluates the rules and shows an interstitial if allowed. Returns true if one was shown. */
  async maybeShowInterstitial(placement: string, state: Omit<InterstitialState, 'sessionSeconds' | 'secondsSinceRewarded'>): Promise<boolean> {
    const decision = evaluateInterstitial({ ...state, sessionSeconds: this.sessionSeconds(), secondsSinceRewarded: this.secondsSinceRewarded() });
    if (!decision.show) {
      console.debug('[ads] interstitial skipped:', decision.reason);
      return false;
    }
    if (!this.provider.isInterstitialReady() || this.busy) return false;
    this.busy = true;
    this.hooks.onOpen();
    this.analytics.track('interstitial_shown', { placement });
    try {
      await this.provider.showInterstitial(placement);
    } catch {
      /* ignore */
    } finally {
      this.busy = false;
      this.hooks.onClose();
    }
    return true;
  }
}
