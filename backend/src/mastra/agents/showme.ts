import { Agent } from '@mastra/core/agent';
import { createAnthropic } from '@ai-sdk/anthropic';

const anthropic = createAnthropic({
  baseURL: process.env.ANTHROPIC_BASE_URL,
  apiKey: process.env.ANTHROPIC_API_KEY ?? 'not-needed-for-local-proxy',
});

export const showmeAgent = new Agent({
  id: 'showmeAgent',
  name: 'showme',
  description:
    'Generates bespoke visualizations for selected web content.',
  instructions: `You help users understand web content by generating bespoke visualizations.
You will be given a selection from a web page (HTML and/or parsed structure) and a user request.
Decide the most useful visualization for the data and intent.

Tool wiring (render_visualization, parse_table, extract_text) will be added in a later milestone.
For now, respond in plain text describing what you would render.`,
  model: anthropic('claude-sonnet-4-6'),
});
