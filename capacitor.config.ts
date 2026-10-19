import type { CapacitorConfig } from '@capacitor/cli';

// The iOS app wraps the single-file game build (`npm run ios:sync` copies it into www/).
const config: CapacitorConfig = {
  appId: 'com.politecarrot.tinykingdomdefender',
  appName: 'Tiny Kingdom',
  webDir: 'www',
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    backgroundColor: '#000000',
  },
};

export default config;
