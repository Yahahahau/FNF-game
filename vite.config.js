import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any sub-path or inside an iframe/WebView.
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 0 },
  server: { host: true },
});
