export default defineNuxtConfig({
  modules: [
    // Dev only — the module checks nuxt.options.dev and is a no-op in production.
    "@feedthrough/nuxt",
  ],
  devtools: { enabled: false },
});
