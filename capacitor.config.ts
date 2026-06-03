import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lowcard.game',
  appName: 'LowCard',
  webDir: 'build',
  server: {
    url: 'https://7cards-vinay.vercel.app',
    cleartext: false
  },
  plugins: {
    AdMob: {
      appId: 'ca-app-pub-3940256099942544~3347511713'
    }
  }
};

export default config;
