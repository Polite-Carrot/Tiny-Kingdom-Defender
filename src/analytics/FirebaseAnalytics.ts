// Optional, consented Google Analytics for the apps (the same approach as Color Match & Merge).
//
// Every event still goes to the local log (the debug screen reads it). In the iOS and Android
// apps, once the player has said yes to "Send usage data", events are also sent through the
// Capacitor Firebase Analytics plugin to the tiny-kingdom-defender Firebase project (configured by
// ios/App/App/GoogleService-Info.plist and android/app/google-services.json).
//
// Nothing is sent until somebody has said yes. Firebase writes an install id, which UK PECR and
// GDPR require consent for before anything is stored, so native collection defaults to OFF (see
// the flags in AndroidManifest.xml and Info.plist) and is only switched on by setConsent().
//
// The plugin is reached with registerPlugin rather than by importing @capacitor-firebase/analytics,
// whose web build pulls in the whole Firebase JS SDK; the web game sends nothing.
//
// Every call is safe at any time: a tracking failure must never cost somebody their game.

import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Analytics, AnalyticsEvent, AnalyticsEventName, AnalyticsParams } from './Analytics';

type ConsentType = 'ANALYTICS_STORAGE' | 'AD_STORAGE' | 'AD_USER_DATA' | 'AD_PERSONALIZATION';
type FirebaseParams = Record<string, string | number | boolean>;

export interface FirebaseAnalyticsPlugin {
  setEnabled(o: { enabled: boolean }): Promise<void>;
  setConsent(o: { type: ConsentType; status: 'GRANTED' | 'DENIED' }): Promise<void>;
  logEvent(o: { name: string; params?: FirebaseParams }): Promise<void>;
}

/** Firebase rejects events with these reserved names, so they are sent under another. */
const RENAMED: Partial<Record<AnalyticsEventName, string>> = { session_start: 'game_launch' };

/** Firebase limits parameter names to 40 characters and string values to 100; trim rather than drop. */
export function firebaseParams(params: AnalyticsParams): FirebaseParams {
  const out: FirebaseParams = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue;
    out[k.slice(0, 40)] = typeof v === 'string' ? v.slice(0, 100) : v;
  }
  return out;
}

export class ConsentedAnalytics implements Analytics {
  private enabled = false;
  /** Consent changes are applied one after another, so a quick off/on cannot finish out of order. */
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private local: Analytics,
    private fb: FirebaseAnalyticsPlugin | null = Capacitor.isNativePlatform() ? registerPlugin<FirebaseAnalyticsPlugin>('FirebaseAnalytics') : null,
  ) {}

  /** Whether usage data can be sent on this platform (the apps), so the choice is worth asking. */
  get remote(): boolean {
    return this.fb !== null;
  }

  track(name: AnalyticsEventName, params: AnalyticsParams = {}): void {
    this.local.track(name, params);
    if (!this.enabled || !this.fb) return;
    const fb = this.fb;
    const event = { name: RENAMED[name] ?? name, params: firebaseParams(params) };
    // Queued behind any consent change still in flight, so the event is not sent before collection is on.
    void this.pending.then(() => fb.logEvent(event)).catch(() => {});
  }

  sessionEvents(): readonly AnalyticsEvent[] {
    return this.local.sessionEvents();
  }

  /**
   * Turns sending on or off. adsAllowed grants the ad-related Consent Mode v2 types only while the
   * player has personalised ads on; otherwise they stay denied even when usage data is allowed.
   */
  setConsent(usageData: boolean, adsAllowed: boolean): Promise<void> {
    // The flag stops events at once; the native calls catch up behind it.
    this.enabled = usageData;
    const fb = this.fb;
    if (!fb) return Promise.resolve();
    const analytics = usageData ? 'GRANTED' : 'DENIED';
    const ads = usageData && adsAllowed ? 'GRANTED' : 'DENIED';
    this.pending = this.pending.then(async () => {
      try {
        await fb.setEnabled({ enabled: usageData });
        await fb.setConsent({ type: 'ANALYTICS_STORAGE', status: analytics });
        await fb.setConsent({ type: 'AD_STORAGE', status: ads });
        await fb.setConsent({ type: 'AD_USER_DATA', status: ads });
        await fb.setConsent({ type: 'AD_PERSONALIZATION', status: ads });
      } catch (e) {
        console.warn('[analytics] Firebase consent failed', e);
      }
    });
    return this.pending;
  }
}
