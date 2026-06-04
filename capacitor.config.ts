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
      appId: 'ca-app-pub-6668442587084779~1183611388'
    }
  }
};

export default config;
