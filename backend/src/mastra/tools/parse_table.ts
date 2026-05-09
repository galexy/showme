import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

function parseTableHtml(html: string): { headers: string[]; rows: (string | number)[][] } {
  const headers: string[] = [];
  const rows: (string | number)[][] = [];

  const thMatches = html.match(/<th[^>]*>([\s\S]*?)<\/th>/gi) ?? [];
  for (const th of thMatches) {
    headers.push(th.replace(/<[^>]+>/g, '').trim());
  }

  const trMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];
  const dataRows = headers.length > 0 ? trMatches.slice(1) : trMatches;

  for (const tr of dataRows) {
    const tdMatches = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) ?? [];
    if (!tdMatches.length) continue;
    const cells: (string | number)[] = tdMatches.map((td) => {
      const text = td.replace(/<[^>]+>/g, '').trim();
      const num = Number(text.replace(/[$,%\s]/g, ''));
      return isNaN(num) || text === '' ? text : num;
    });
    rows.push(cells);
  }

  return { headers, rows };
}

export const parseTableTool = createTool({
  id: 'parse_table',
  description: 'Parse an HTML table snippet into structured headers and rows with numeric type inference.',
  inputSchema: z.object({
    html: z.string().describe('HTML string containing a <table> element'),
  }),
  execute: async (input) => {
    const result = parseTableHtml(input.html);
    return {
      headers: result.headers,
      rows: result.rows,
      rowCount: result.rows.length,
      columnCount: result.headers.length || (result.rows[0]?.length ?? 0),
    };
  },
});
