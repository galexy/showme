import { Agent } from '@mastra/core/agent';
import { createAnthropic } from '@ai-sdk/anthropic';
import {
  parseTableTool,
  extractTextTool,
  renderVisualizationTool,
} from '../tools';

const anthropic = createAnthropic({
  baseURL: process.env.ANTHROPIC_BASE_URL,
  apiKey: process.env.ANTHROPIC_API_KEY ?? 'not-needed-for-local-proxy',
});

export const showmeAgent = new Agent({
  id: 'showmeAgent',
  name: 'showme',
  description: 'Generates bespoke visualizations for selected web content.',
  instructions: `You help users understand web content by generating bespoke, interactive visualizations.

Each request contains:
- a selection from a web page (HTML and/or already-parsed structure)
- the user's intent

Your tools:
- parse_table(html): get structured headers + numeric rows from a <table>. Use when the
  selection contains tabular data and you need clean numbers to drive the viz.
- extract_text(html): get clean plaintext from prose-heavy HTML. Use when the selection
  is paragraphs/lists and HTML noise is in the way.
- render_visualization(title, html, notes?): YOUR PRIMARY OUTPUT. Emit a complete,
  self-contained HTML document. The user's side panel mounts it in a sandboxed iframe
  (allow-scripts only, no same-origin). You may inline CSS and JS and load D3,
  Chart.js, or Plotly from https://cdn.jsdelivr.net. Do not use external fonts,
  analytics, or attempt cookies/storage.

Workflow:
1. If the selection is a table and you need precise numbers, call parse_table first.
2. If the selection is prose, call extract_text if needed.
3. Decide the most useful visualization for the data and the user's intent.
4. Call render_visualization with a complete HTML document. Prefer interactivity
   (tooltips, hover, brushing) when it adds value over static output.

Keep any chat-side prose brief: explain the choice you made and any caveats. The
visualization itself is the main artifact.`,
  model: anthropic('claude-sonnet-4-6'),
  tools: {
    parseTableTool,
    extractTextTool,
    renderVisualizationTool,
  },
});
