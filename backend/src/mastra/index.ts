import { Mastra } from '@mastra/core/mastra';
import { registerCopilotKit } from '@ag-ui/mastra/copilotkit';
import { showmeAgent } from './agents/showme';

export const mastra = new Mastra({
  agents: { showmeAgent },
  server: {
    cors: {
      origin: '*',
      allowMethods: ['*'],
      allowHeaders: ['*'],
    },
    apiRoutes: [
      registerCopilotKit({
        path: '/copilotkit',
        resourceId: 'showmeAgent',
      }),
    ],
  },
  bundler: {
    externals: true,
  },
});
