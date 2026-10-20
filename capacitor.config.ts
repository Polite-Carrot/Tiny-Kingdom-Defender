import type { CapacitorConfig } from '@capacitor/cli';

// The iOS and Android apps wrap the single-file game build (`npm run ios:sync` / `npm run
// android:sync` copy it into www/).
const config: CapacitorConfig = {
  appId: 'com.politecarrot.tinykingdomdefender',
  appName: 'Tiny Kingdom',
  webDir: 'www',
  android: {
    backgroundColor: '#000000',
  },
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    backgroundColor: '#000000',
  },
};

export default config;
