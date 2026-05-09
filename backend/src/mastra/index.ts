import { Mastra } from '@mastra/core/mastra';
import { registerCopilotKit } from '@ag-ui/mastra/copilotkit';
import { showmeAgent } from './agents/showme';

export const mastra = new Mastra({
  agents: { default: showmeAgent },
  server: {
    cors: {
      origin: '*',
      allowMethods: ['*'],
      allowHeaders: ['*'],
    },
    apiRoutes: [
      registerCopilotKit({
        path: '/copilotkit',
        resourceId: 'default',
        // Pull the AG-UI `context` array out of the request body and stash it
        // on the RequestContext so the agent's dynamic instructions can read
        // it. The Mastra adapter (1.0.2) otherwise drops `context` entirely.
        setContext: async (c, requestContext) => {
          try {
            const json = (await c.req.raw.clone().json()) as
              | { body?: { context?: Array<{ description?: string; value?: unknown }> } }
              | undefined;
            const ctx = json?.body?.context;
            if (Array.isArray(ctx) && ctx.length > 0) {
              requestContext.set('agUiContext', ctx);
            }
          } catch {
            // non-JSON or malformed body — let the downstream handler error.
          }
        },
      }),
    ],
  },
  bundler: {
    externals: true,
  },
});
