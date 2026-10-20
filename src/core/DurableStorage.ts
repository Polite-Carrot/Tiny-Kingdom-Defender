// In the iOS app, saves live in the app's own storage (UserDefaults, via @capacitor/preferences),
// which iOS never clears the way it can clear a web view's localStorage. The save system reads and
// writes synchronously, so the native copy is loaded into memory once at start-up; every write then
// goes to memory, the native store and localStorage (kept as a fallback copy).

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { SAVE_KEY, BACKUP_KEY, type StorageLike } from './Save';

/** Keys loaded from the native store at start-up. */
const KEYS = [SAVE_KEY, BACKUP_KEY];

function webGet(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}

function webSet(k: string, v: string | null): void {
  try {
    if (v === null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, v);
  } catch {
    /* the native copy is the one that matters */
  }
}

function nativeSet(k: string, v: string | null): void {
  const p = v === null ? Preferences.remove({ key: k }) : Preferences.set({ key: k, value: v });
  p.catch((e: unknown) => console.warn('[save] native write failed', e));
}

/** Storage for the save system: native in the app, undefined (plain localStorage) on the web. */
export async function durableStorage(): Promise<StorageLike | undefined> {
  if (!Capacitor.isNativePlatform()) return undefined;
  const cache = new Map<string, string>();
  for (const key of KEYS) {
    let value: string | null = null;
    try {
      value = (await Preferences.get({ key })).value;
    } catch (e) {
      console.warn('[save] native read failed', e);
    }
    // First launch since saves moved: carry over what the web view had.
    if (value === null) {
      value = webGet(key);
      if (value !== null) nativeSet(key, value);
    }
    if (value !== null) cache.set(key, value);
  }
  return {
    getItem: (k) => (cache.has(k) ? cache.get(k)! : webGet(k)),
    setItem: (k, v) => {
      cache.set(k, v);
      nativeSet(k, v);
      webSet(k, v);
    },
    removeItem: (k) => {
      cache.delete(k);
      nativeSet(k, null);
      webSet(k, null);
    },
  };
}
