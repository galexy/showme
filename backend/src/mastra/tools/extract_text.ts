import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/th>/gi, '\t')
    .replace(/<\/td>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\t+/g, '\t')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const extractTextTool = createTool({
  id: 'extract_text',
  description: 'Extract readable plaintext from an HTML snippet, stripping tags and normalising whitespace.',
  inputSchema: z.object({
    html: z.string().describe('HTML string to extract text from'),
  }),
  execute: async (input) => {
    const text = htmlToText(input.html);
    return { text, charCount: text.length };
  },
});
