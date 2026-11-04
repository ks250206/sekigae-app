import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig, lazyPlugins } from "vite-plus";

// https://viteplus.dev/config/
export default defineConfig({
  base: "./",
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  worker: { format: "es" },
  fmt: {
    ignorePatterns: ["src/components/ui/**", "pnpm-lock.yaml", "dist/**"],
  },
  lint: {
    ignorePatterns: ["dist/**", "dev-dist/**", "src/components/ui/**"],
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": ["warn", { allowConstantExport: true }],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    overrides: [
      {
        // domain / engine / lib は React・UI 非依存に保つ
        files: ["src/domain/**", "src/engine/**", "src/lib/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  group: ["react", "react-dom", "react/*"],
                  message: "Keep domain/engine/lib framework-agnostic.",
                },
                {
                  group: ["@/components/*", "@/features/*", "@/app/*", "@/store/*"],
                  message: "Keep domain/engine/lib independent from UI layers.",
                },
              ],
            },
          ],
        },
      },
    ],
    options: { typeAware: true, typeCheck: true },
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
  plugins: lazyPlugins(() => [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Sekigae — 研究室 席決め",
        short_name: "Sekigae",
        description: "研究室の席配置をブラウザだけで決めるアプリ / Seat planner for labs",
        lang: "ja",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#0f1220",
        theme_color: "#4f46e5",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,json}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "index.html",
      },
      devOptions: { enabled: false },
    }),
  ]),
});
