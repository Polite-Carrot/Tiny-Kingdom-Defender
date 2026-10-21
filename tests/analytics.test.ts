import { describe, expect, it } from 'vitest';
import { LocalAnalytics } from '../src/analytics/Analytics';
import { ConsentedAnalytics, firebaseParams, type FirebaseAnalyticsPlugin } from '../src/analytics/FirebaseAnalytics';

function fakeFirebase() {
  const calls: string[] = [];
  const fb: FirebaseAnalyticsPlugin = {
    setEnabled: async (o) => void calls.push(`enabled:${o.enabled}`),
    setConsent: async (o) => void calls.push(`${o.type}:${o.status}`),
    logEvent: async (o) => void calls.push(`event:${o.name}:${JSON.stringify(o.params)}`),
  };
  return { fb, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('ConsentedAnalytics', () => {
  it('sends nothing to Firebase before consent, but still logs locally', async () => {
    const { fb, calls } = fakeFirebase();
    const a = new ConsentedAnalytics(new LocalAnalytics(false), fb);
    a.track('level_start', { level: 'x' });
    await flush();
    expect(calls).toEqual([]);
    expect(a.sessionEvents()).toHaveLength(1);
  });

  it('enables collection before sending, and renames reserved events', async () => {
    const { fb, calls } = fakeFirebase();
    const a = new ConsentedAnalytics(new LocalAnalytics(false), fb);
    void a.setConsent(true, false);
    a.track('session_start', { coins: 5, note: null });
    await flush();
    expect(calls).toEqual([
      'enabled:true', 'ANALYTICS_STORAGE:GRANTED', 'AD_STORAGE:DENIED', 'AD_USER_DATA:DENIED', 'AD_PERSONALIZATION:DENIED',
      'event:game_launch:{"coins":5}',
    ]);
  });

  it('grants ad consent types only with personalised ads, and stops on withdrawal', async () => {
    const { fb, calls } = fakeFirebase();
    const a = new ConsentedAnalytics(new LocalAnalytics(false), fb);
    await a.setConsent(true, true);
    expect(calls).toContain('AD_PERSONALIZATION:GRANTED');
    calls.length = 0;
    void a.setConsent(false, true);
    a.track('level_start', {});
    await flush();
    expect(calls).toEqual(['enabled:false', 'ANALYTICS_STORAGE:DENIED', 'AD_STORAGE:DENIED', 'AD_USER_DATA:DENIED', 'AD_PERSONALIZATION:DENIED']);
  });

  it('is inert without the native plugin', async () => {
    const a = new ConsentedAnalytics(new LocalAnalytics(false), null);
    expect(a.remote).toBe(false);
    await a.setConsent(true, true);
    expect(() => a.track('level_start', {})).not.toThrow();
  });

  it('trims parameter names and string values to Firebase limits', () => {
    const p = firebaseParams({ ['k'.repeat(50)]: 'v'.repeat(150), n: 1, b: true });
    expect(Object.keys(p)[0]).toHaveLength(40);
    expect(Object.values(p)[0]).toHaveLength(100);
    expect(p.n).toBe(1);
    expect(p.b).toBe(true);
  });
});
