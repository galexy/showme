import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Frontend intercepts this tool call via useCopilotAction and mounts a
 * sandboxed iframe. Backend just validates and echoes — the HTML never
 * executes server-side.
 */
export const renderVisualizationTool = createTool({
  id: 'render_visualization',
  description:
    'Render a bespoke, interactive visualization for the selected web content. ' +
    'Provide a complete self-contained <!doctype html> document with all scripts and styles inline. ' +
    'The document runs in a sandboxed iframe with no network access except cdn.jsdelivr.net (D3, Chart.js, Plotly). ' +
    'Prefer interactivity (tooltips, hover highlights) when it adds value.',
  inputSchema: z.object({
    title: z.string().describe('Short title shown on the visualization card (≤ 60 chars)'),
    html: z.string().describe('Full self-contained <!doctype html> document'),
    notes: z.string().optional().describe('Optional 1-2 sentence explanation shown in chat alongside the card'),
  }),
  execute: async (input) => {
    return {
      title: input.title,
      html: input.html,
      notes: input.notes ?? null,
      renderedAt: new Date().toISOString(),
    };
  },
});
