import type { CapacitorConfig } from '@capacitor/cli';

// The iOS and Android apps wrap the single-file game build (`npm run ios:sync` / `npm run
// android:sync` copy it into www/).
const config: CapacitorConfig = {
  appId: 'com.politecarrot.tinykingdom',
  appName: 'Tiny Kingdom',
  webDir: 'www',
  android: {
    backgroundColor: '#000000',
  },
  plugins: {
    // Full screen: no status bar, and on iOS the home indicator auto-hides.
    SystemBars: { hidden: true },
  },
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    backgroundColor: '#000000',
  },
};

export default config;
