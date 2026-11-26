// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from "node:url";

export default defineNuxtConfig({
  ssr: false,
  experimental: {
    viteEnvironmentApi: true,
  },
  app: {
    head: {
      charset: "utf-8",
      viewport: "width=device-width, initial-scale=1, height=device-height",
      title: "Storywriter",
      meta: [
        { name: "description", content: "storywriter" },
        { name: "theme-color", content: "#212121" },
      ],
      link: [
        { rel: "icon", type: "image/svg+xml", href: "/images/logo.svg" },
        { rel: "apple-touch-icon", href: "/images/logo-192.png" },
      ],
    },
  },
  css: [
    "@picocss/pico",
    "bootstrap-icons/font/bootstrap-icons.css",
    "~/assets/css/main.css",
  ],
  modules: ["@pinia/nuxt", "@vite-pwa/nuxt"],
  // common-web is consumed as raw .vue/.ts sources (not as a Nuxt layer, so its
  // global CSS does not leak here). Map the package to its installed directory
  // so both Vite and the generated tsconfig resolve the raw subpath imports.
  alias: {
    "@devopsplaybook.io/common-web": fileURLToPath(
      new URL("./node_modules/@devopsplaybook.io/common-web", import.meta.url),
    ),
  },
  // Raw sources must go through Vite's transform pipeline and stay out of
  // pre-bundling.
  build: {
    transpile: ["@devopsplaybook.io/common-web"],
  },
  vite: {
    optimizeDeps: {
      exclude: ["@devopsplaybook.io/common-web"],
    },
  },
  imports: {
    dirs: ["./stores"],
  },
  pinia: {
    autoImports: ["defineStore", "acceptHMRUpdate"],
  },
  pwa: {
    // Prompt mode keeps the old worker controlling until the user accepts the
    // shared update banner (components/AppUpdatePrompt.vue): a new build must
    // never silently reload the tab and lose an in-progress draft.
    registerType: "prompt",
    // Keep the sw.js fetch off the HTTP cache so a new build is noticed.
    updateViaCache: "none",
    // @vite-pwa/nuxt v2 renamed the `workbox` option to `generateSW`
    generateSW: {
      globPatterns: ["**/*.{js,css,html}", "images/*.{svg,png}"],
      // the module rewrites index.html entries to "/" in the precache
      // manifest, so the fallback must reference "/" not "index.html"
      navigateFallback: "/",
      // Never answer a navigation to the build manifest with the app shell.
      // (The module re-adds _nuxt/builds/latest.json to the precache through its
      // manifestTransforms, so detection cannot rely on excluding it; the probe
      // uses a cache-busting URL instead — see components/AppUpdatePrompt.vue.)
      navigateFallbackDenylist: [/\/_nuxt\/builds\//],
      cleanupOutdatedCaches: true,
      // Only hashed build assets are cached at runtime: the urlPattern matches
      // /_nuxt/ asset URLs only, so private media and every /api/ response can
      // never enter a cache (see USER_INTERFACE spec).
      runtimeCaching: [
        {
          urlPattern: /\/_nuxt\/.*\.(?:png|jpg|jpeg|gif|webp|svg|woff2?)$/,
          handler: "CacheFirst",
          options: {
            cacheName: "static-assets",
            expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
          },
        },
      ],
    },
    manifest: {
      name: "Storywriter",
      short_name: "Storywriter",
      lang: "en-US",
      start_url: "/",
      display: "standalone",
      background_color: "#12191f",
      theme_color: "#12191f",
      icons: [
        {
          src: "images/logo.svg",
          sizes: "512x512",
          type: "image/svg+xml",
        },
        {
          src: "images/logo-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "images/logo-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "images/logo-maskable-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "maskable",
        },
        {
          src: "images/logo-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
  },
});
