/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Deployed to GitHub Pages at https://<user>.github.io/RedWalleye/
// so production assets need the repo name as the base path.
// A human-comparable build id (UTC minute + short commit sha when CI sets it)
// so two phones can be checked at a glance to see if one is on a stale build.
const buildId =
  new Date().toISOString().slice(0, 16).replace("T", " ") +
  (process.env.GITHUB_SHA ? ` · ${process.env.GITHUB_SHA.slice(0, 7)}` : "");

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/RedWalleye/" : "/",
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    react(),
    // Installable web app (home-screen icon + manifest), but NO precaching
    // service worker. `selfDestroying` ships a worker that UNREGISTERS any
    // previously-installed SW and clears its caches on every phone — so nobody
    // gets pinned to a stale bundle (the precache SW was serving old builds
    // against the live DB during testing). Cold-start-offline can come back
    // later with a forced-update guard once the app is stable; the write queue
    // already keeps scores flowing through dead zones regardless.
    VitePWA({
      selfDestroying: true,
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
    }),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
