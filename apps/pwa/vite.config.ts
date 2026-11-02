import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The app is installed from the clinic server over HTTPS (needed for the microphone and the service worker).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "SETU",
        short_name: "SETU",
        description: "Tell us about your health problem before you see the doctor.",
        theme_color: "#0f766e",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        // Question audio clips are cached as they are played, so a slow clinic network does not stall the voice.
        runtimeCaching: [
          { urlPattern: /\/audio\//, handler: "CacheFirst", options: { cacheName: "setu-audio", expiration: { maxEntries: 2000 } } },
          { urlPattern: /\/api\/bank$/, handler: "StaleWhileRevalidate", options: { cacheName: "setu-bank" } },
        ],
      },
    }),
  ],
  server: { proxy: { "/api": "http://localhost:8080", "/audio": "http://localhost:8080" } },
});
