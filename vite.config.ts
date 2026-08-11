import { defineConfig } from 'vite';

// `base` differs between local dev and GitHub Pages. A Pages *project* site is
// served from /<repo>/, so CI sets BASE_PATH; locally it stays at the root.
// Getting this wrong produces 404s that only appear after deploy.
export default defineConfig({
  root: 'app',
  base: process.env.BASE_PATH ?? '/',
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    // Never inline binary assets. Inlined .glb/.ktx2 would be base64'd into JS,
    // defeating KTX2's whole purpose (staying GPU-compressed end to end).
    assetsInlineLimit: 0,
    sourcemap: true,
  },
  server: {
    // `host: true` exposes the dev server on the LAN, but the Quest reaches it
    // via `adb reverse` on localhost so the page counts as a secure context and
    // WebXR is allowed without a TLS certificate. See tools/dev-quest.mjs.
    host: true,
    port: 5173,
    strictPort: true,
  },
});
