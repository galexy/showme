import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import manifest from './manifest.config';

// CRXJS doesn't understand `sandbox` or `content_security_policy` and silently
// drops them from the emitted manifest. Patch them back in after CRXJS writes
// dist/manifest.json. The viz iframe relies on the sandbox CSP allowing
// inline scripts + jsdelivr; without this patch every visualization fails
// with `script-src 'self'` violations.
function patchManifestSandboxCsp(): PluginOption {
  return {
    name: 'showme:patch-manifest-sandbox',
    apply: 'build',
    closeBundle: {
      sequential: true,
      order: 'post',
      handler() {
        const manifestPath = resolve(__dirname, 'dist/manifest.json');
        const m = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        m.sandbox = { pages: ['viz-frame.html'] };
        m.content_security_policy = {
          ...(m.content_security_policy ?? {}),
          sandbox:
            "sandbox allow-scripts; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob:; " +
            // jsdelivr is whitelisted so DevTools can fetch sourceMappingURL
            // .map files for libraries we already allow as scripts. Without
            // this, every chart logs a noisy "connect-src 'none'" CSP error.
            "connect-src https://cdn.jsdelivr.net; " +
            "font-src 'none';",
        };
        writeFileSync(manifestPath, JSON.stringify(m, null, 2));
        // eslint-disable-next-line no-console
        console.log('[showme:patch-manifest-sandbox] injected sandbox + CSP into dist/manifest.json');
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), crx({ manifest }), patchManifestSandboxCsp()],
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5174 },
  },
});
