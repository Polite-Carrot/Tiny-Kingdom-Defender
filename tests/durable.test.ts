import { describe, it, expect, vi, beforeEach } from 'vitest';

// A fake native store and a fake web view localStorage.
const native = new Map<string, string>();
const web = new Map<string, string>();
let isNative = true;

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => isNative } }));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: native.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void native.set(key, value),
    remove: async ({ key }: { key: string }) => void native.delete(key),
  },
}));

(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => web.get(k) ?? null,
    setItem: (k: string, v: string) => void web.set(k, v),
    removeItem: (k: string) => void web.delete(k),
  },
};

const { durableStorage } = await import('../src/core/DurableStorage');
const { SaveSystem, SAVE_KEY } = await import('../src/core/Save');
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('saves in the iOS app', () => {
  beforeEach(() => {
    native.clear();
    web.clear();
    isNative = true;
  });

  it('carries an existing web view save over to native storage on first launch', async () => {
    const old = new SaveSystem(await durableStorage());
    old.data.coins = 1234;
    old.save();
    // Pretend the save only existed in the web view (an older app version).
    native.clear();
    const storage = await durableStorage();
    expect(new SaveSystem(storage).data.coins).toBe(1234);
    await flush();
    expect(native.has(SAVE_KEY)).toBe(true);
  });

  it('survives iOS clearing the web view storage', async () => {
    const s = new SaveSystem(await durableStorage());
    s.data.coins = 777;
    s.save();
    await flush();
    web.clear();
    expect(new SaveSystem(await durableStorage()).data.coins).toBe(777);
  });

  it('the native copy wins over a stale web copy', async () => {
    const s = new SaveSystem(await durableStorage());
    s.data.coins = 50;
    s.save();
    await flush();
    web.set(SAVE_KEY, web.get(SAVE_KEY)!.replace('"coins":50', '"coins":1'));
    expect(new SaveSystem(await durableStorage()).data.coins).toBe(50);
  });

  it('on the website it leaves storage to localStorage', async () => {
    isNative = false;
    expect(await durableStorage()).toBeUndefined();
  });
});
