import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'showme',
  version: '0.0.0',
  description: 'Generative visualizations for selected web content.',
  action: {
    default_title: 'Open showme side panel',
  },
  permissions: ['sidePanel', 'activeTab', 'scripting', 'storage'],
  host_permissions: ['<all_urls>'],
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  background: {
    service_worker: 'src/background/background.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/content.ts'],
      run_at: 'document_idle',
    },
  ],
  // viz-frame.html lives in `public/` so Vite copies it verbatim to dist root
  // (no transforms — its inline bootstrap script must be preserved as-is).
  // CRXJS strips the `sandbox` and `content_security_policy` keys when it
  // emits the manifest, so the actual sandbox + CSP wiring is re-injected
  // post-build by the showme-patch-manifest plugin in vite.config.ts.
});
