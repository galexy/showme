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
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
});
