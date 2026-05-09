import { createTool } from '@mastra/core/tools';
import * as cheerio from 'cheerio';
import { z } from 'zod';

export const parseTableTool = createTool({
  id: 'parse_table',
  description:
    'Parse the first <table> in an HTML fragment into structured headers and rows. ' +
    'Numeric-looking cells are coerced to numbers (handles commas, $, %, and (parens) for negatives). ' +
    'Use this when the user selection includes a table and you need clean data to drive a visualization.',
  inputSchema: z.object({
    html: z
      .string()
      .describe('HTML containing a <table>. If multiple tables exist, the first is used.'),
  }),
  outputSchema: z.object({
    headers: z.array(z.string()),
    rows: z.array(z.array(z.union([z.string(), z.number()]))),
  }),
  execute: async ({ html }) => {
    const $ = cheerio.load(html);
    const $table = $('table').first();
    if ($table.length === 0) {
      throw new Error('No <table> element found in the provided HTML.');
    }

    const allRows: string[][] = $table
      .find('tr')
      .map((_, tr) =>
        $(tr)
          .find('th, td')
          .map((_i, cell) => $(cell).text().trim().replace(/\s+/g, ' '))
          .get(),
      )
      .get() as unknown as string[][];

    if (allRows.length === 0) return { headers: [], rows: [] };

    const hasThead = $table.find('thead').length > 0;
    const firstRowAllTh =
      $table.find('tr').first().find('td').length === 0 &&
      $table.find('tr').first().find('th').length > 0;

    let headers: string[] = [];
    let dataRows: string[][] = allRows;
    if (hasThead || firstRowAllTh) {
      headers = allRows[0];
      dataRows = allRows.slice(1);
    }

    const rows = dataRows.map((row) => row.map(coerceNumeric));
    return { headers, rows };
  },
});

function coerceNumeric(text: string): string | number {
  if (text === '') return text;
  const negParen = /^\((.*)\)$/.exec(text);
  const candidate = (negParen ? `-${negParen[1]}` : text).replace(/[$,\s%]/g, '');
  if (candidate === '' || candidate === '-') return text;
  const n = Number(candidate);
  return Number.isFinite(n) ? n : text;
}
