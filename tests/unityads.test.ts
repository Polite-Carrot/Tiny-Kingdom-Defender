import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Capacitor } from '@capacitor/core';
import { UnityAdsProvider } from '../src/ads/UnityAdsProvider';

const IDS = { gameId: '1', rewarded: 'R', interstitial: 'I' };

/** A fake native Unity plugin behind a fake Capacitor bridge. */
function fakeBridge(platform: 'ios' | 'android', show: Record<string, unknown> = { shown: true, rewarded: true, finishState: 'completed' }) {
  const calls: string[] = [];
  let att = 'notDetermined';
  const plugin = {
    initialize: async () => void calls.push('initialize'),
    setConsent: async (o: { granted: boolean }) => void calls.push(`consent:${o.granted}`),
    prepareRewarded: async () => (calls.push('prepareRewarded'), { loaded: true }),
    prepareInterstitial: async () => (calls.push('prepareInterstitial'), { loaded: true }),
    showRewarded: async () => (calls.push('showRewarded'), show),
    showInterstitial: async () => (calls.push('showInterstitial'), { shown: true }),
    trackingAuthorizationStatus: async () => ({ status: att }),
    requestTrackingAuthorization: async () => ({ status: (att = 'denied') }),
  };
  const bridge = { isNativePlatform: () => true, getPlatform: () => platform, registerPlugin: () => plugin } as unknown as typeof Capacitor;
  return { bridge, calls };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('UnityAdsProvider', () => {
  beforeEach(() => vi.stubGlobal('window', { setInterval: () => 0 }));
  afterEach(() => vi.unstubAllGlobals());

  it('applies consent before starting, then loads both ads', async () => {
    const { bridge, calls } = fakeBridge('android');
    const p = new UnityAdsProvider(IDS, true, () => true, bridge);
    await p.init();
    await settle();
    expect(calls.slice(0, 2)).toEqual(['consent:true', 'initialize']);
    expect(p.isRewardedReady()).toBe(true);
    expect(p.isInterstitialReady()).toBe(true);
  });

  it('maps a rewarded show onto completed / skipped / failed and reloads afterwards', async () => {
    for (const [show, want] of [
      [{ shown: true, rewarded: true, finishState: 'completed' }, 'completed'],
      [{ shown: true, rewarded: false, finishState: 'skipped' }, 'skipped'],
      [{ shown: false, rewarded: false, reason: 'not loaded' }, 'failed'],
    ] as const) {
      const { bridge, calls } = fakeBridge('android', show);
      const p = new UnityAdsProvider(IDS, true, () => false, bridge);
      await p.init();
      await settle();
      expect(await p.showRewarded('x')).toBe(want);
      await settle();
      expect(calls.filter((c) => c === 'prepareRewarded')).toHaveLength(2);
    }
  });

  it('asks Apple for tracking only on iOS', async () => {
    expect(await new UnityAdsProvider(IDS, true, () => false, fakeBridge('android').bridge).requestTracking()).toBeNull();
    expect(await new UnityAdsProvider(IDS, true, () => false, fakeBridge('ios').bridge).requestTracking()).toBe('denied');
  });
});
