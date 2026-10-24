// https://nuxt.com/docs/api/configuration/nuxt-config
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
  imports: {
    dirs: ["./stores"],
  },
  pinia: {
    autoImports: ["defineStore", "acceptHMRUpdate"],
  },
  pwa: {
    registerType: "autoUpdate",
    workbox: {
      globPatterns: ["**/*.{js,css,html}", "images/*.{svg,png}"],
      // @vite-pwa/nuxt rewrites index.html entries to "/" in the precache
      // manifest, so the fallback must reference "/" not "index.html"
      navigateFallback: "/",
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
