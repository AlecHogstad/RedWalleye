/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Deployed to GitHub Pages at https://<user>.github.io/RedWalleye/
// so production assets need the repo name as the base path.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/RedWalleye/" : "/",
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
