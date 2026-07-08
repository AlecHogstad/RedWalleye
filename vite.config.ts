/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Deployed to GitHub Pages at https://<user>.github.io/RedWalleye/
// so production assets need the repo name as the base path.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/RedWalleye/" : "/",
  plugins: [
    react(),
    // Installable, offline-first PWA. A service worker precaches the whole app
    // shell — JS, CSS, the self-hosted fonts, and icons — so it opens with zero
    // bars at the tee box. Live scores still sync through the app's own write
    // queue when signal returns; the SW never touches Supabase requests.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Hayward Invitational",
        short_name: "Hayward Inv",
        description:
          "Team match-play scoring for the Red Walleye golf trip — live Nassau standings, scorecards, and the activity feed.",
        theme_color: "#1e4a2b",
        background_color: "#f4eddb",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache the app shell + fonts + icons for a true cold offline start.
        globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico,webmanifest}"],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
