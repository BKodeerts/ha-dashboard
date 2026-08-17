import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Two build targets from one source tree:
 *
 *   `npm run build:app`     → dist/        a standalone SPA (host it yourself)
 *   `npm run build:panel`   → dist/panel/  one ES module for HA's `panel_custom`
 *
 * Both mount the same `<ha-dashboard-panel>` custom element, so the app code and
 * the styling path (shadow root + inlined CSS) are identical in either target.
 *
 * The target comes from BUILD_TARGET rather than Vite's `--mode`, so both builds
 * stay in production mode — `--mode panel` would otherwise hand the panel a
 * development build of React.
 */
export default defineConfig(() => {
  const isPanel = process.env.BUILD_TARGET === 'panel';

  const config: UserConfig = {
    plugins: [react()],
    // The panel bundle is loaded by HA from /local/…, the SPA from its own root.
    base: isPanel ? './' : '/',
    build: {
      outDir: isPanel ? 'dist/panel' : 'dist',
      emptyOutDir: true,
      target: 'es2022',
    },
    server: { port: 5173, host: true },
  };

  if (isPanel) {
    // Library builds leave `process.env.NODE_ENV` to the consuming bundler, but
    // the browser loads this file directly — without this, HA gets React's
    // development build.
    config.define = { 'process.env.NODE_ENV': JSON.stringify('production') };
    config.build = {
      ...config.build,
      minify: true,
      // CSS is imported with `?inline` and injected into the shadow root, so
      // there is no stylesheet asset to emit or link.
      cssCodeSplit: false,
      lib: {
        entry: 'src/panel.ts',
        formats: ['es'],
        fileName: () => 'ha-dashboard-panel.js',
      },
    };
  }

  return config;
});
