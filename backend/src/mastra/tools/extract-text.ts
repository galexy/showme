import { createTool } from '@mastra/core/tools';
import { htmlToText } from 'html-to-text';
import { z } from 'zod';

export const extractTextTool = createTool({
  id: 'extract_text',
  description:
    'Convert an HTML fragment into clean plaintext, preserving paragraph and list structure. ' +
    'Use this when the user selection is prose and you want to read the content without HTML noise.',
  inputSchema: z.object({
    html: z.string(),
  }),
  outputSchema: z.object({
    text: z.string(),
  }),
  execute: async ({ html }) => {
    const text = htmlToText(html, {
      wordwrap: false,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
        { selector: 'script', format: 'skip' },
        { selector: 'style', format: 'skip' },
      ],
    });
    return { text };
  },
});
