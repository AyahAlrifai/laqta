import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';
import { CONTENT_SECURITY_POLICY } from './src/main/window-policy';

// The direct Anthropic provider is compiled in only for development builds (spec section 7).
// `LAQTA_RELEASE=1` (set by the release pipeline) turns it off so the bundle never contains
// the developer key name.
const devProvider = process.env.LAQTA_RELEASE !== '1';

const pages = ['overlay', 'workbench', 'toast', 'settings'] as const;

/**
 * Writes the CSP meta tag (spec section 10). Builds get the strict policy. The dev server
 * needs inline scripts and styles for hot reload, so only `serve` loosens it.
 */
function cspPlugin(): Plugin {
  let serve = false;
  return {
    name: 'laqta-csp',
    configResolved(config) {
      serve = config.command === 'serve';
    },
    transformIndexHtml(html) {
      const policy = serve
        ? "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:*"
        : CONTENT_SECURITY_POLICY;
      return html.replace('%LAQTA_CSP%', policy);
    },
  };
}

export default defineConfig({
  main: {
    define: { __LAQTA_DEV_PROVIDER__: JSON.stringify(devProvider) },
    build: {
      rollupOptions: {
        external: ['get-windows'],
      },
    },
  },
  preload: {},
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), cspPlugin()],
    build: {
      rollupOptions: {
        input: Object.fromEntries(
          pages.map((p) => [p, resolve(__dirname, `src/renderer/${p}/index.html`)]),
        ),
      },
    },
  },
});
