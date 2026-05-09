import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// Frontend-handled tool. The side panel registers a CopilotKit useCopilotAction
// with the same name and mounts the html in a sandboxed iframe. The execute
// here is a no-op fallback so the agent can still call it in the Mastra
// playground (where there is no frontend handler) without erroring.
export const renderVisualizationTool = createTool({
  id: 'render_visualization',
  description:
    "Render a self-contained HTML document as an interactive visualization in the user's side panel. " +
    'The HTML runs in a sandboxed iframe (allow-scripts only, no same-origin). ' +
    'You may include <style> and <script>, and load D3, Chart.js, or Plotly from cdn.jsdelivr.net. ' +
    'Do not use external fonts, analytics, or attempt to read cookies / storage. ' +
    'This is the primary delivery mechanism for any visualization the user asks for.',
  inputSchema: z.object({
    title: z.string().describe('Short title shown above the visualization card.'),
    html: z
      .string()
      .describe('Complete <!doctype html>...</html> document. Must be self-contained.'),
    notes: z
      .string()
      .optional()
      .describe('Brief notes shown to the user alongside the card.'),
  }),
  outputSchema: z.object({
    rendered: z.boolean(),
  }),
  execute: async () => {
    return { rendered: true };
  },
});
