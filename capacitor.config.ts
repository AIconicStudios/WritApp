import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.cashlessedit.app",
  appName: "Cashless Edit",
  webDir: "out",
  android: { allowMixedContent: true },
  server: { androidScheme: "https", cleartext: true },
  plugins: {
    // Route AI requests through Android's native HTTP stack (avoids browser CORS limits for AI providers).
    CapacitorHttp: { enabled: true },
  },
};

export default config;
