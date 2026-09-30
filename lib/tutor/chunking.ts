import { createHash } from 'node:crypto';
export const hashText = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
// Conservative UTF-8 estimate handles Arabic as well as English; embedding API returns billed token counts.
export const estimateTokens = (text: string) => Math.ceil(Buffer.byteLength(text, 'utf8') / 3.5);
export type StructuredChunk = { content: string; contentHash: string; heading: string | null; chapter: string | null; section: string | null; tokenCount: number };

/** Structure first: headings, paragraphs, bullet groups and table rows. Repeat table headers on overflow. */
export function structureChunks(text: string, targetTokens = 700, maxTokens = 900): StructuredChunk[] {
  const cleaned = text.replace(/\r\n?/g,'\n').replace(/\u0000/g,'').trim();
  if (!cleaned) return [];
  const blocks = cleaned.split(/\n\s*\n/).flatMap(block => {
    if (estimateTokens(block) <= maxTokens) return [block];
    // Never cut in a table cell or bullet item. Oversized prose breaks at sentence/line boundaries, then words.
    const table = block.split('\n').every(line => line.includes('|'));
    if (table) return block.split('\n').slice(1).map(row => `${block.split('\n')[0]}\n${row}`);
    const units = block.split(/(?<=[.!?؟])\s+|\n/);
    return units.flatMap(unit => {
      if (estimateTokens(unit) <= maxTokens) return [unit];
      const result: string[] = []; let part = '';
      for (const word of unit.split(/\s+/)) {
        if (part && estimateTokens(`${part} ${word}`) > maxTokens) { result.push(part); part = ''; }
        part += (part ? ' ' : '') + word;
      }
      if (part) result.push(part);
      return result;
    });
  });
  const chunks: StructuredChunk[] = []; let current = '', heading: string | null = null, chapter: string | null = null;
  const flush = () => { if (current.trim()) chunks.push({ content: current.trim(), contentHash: hashText(current.trim()), heading,
    chapter, section: heading, tokenCount: estimateTokens(current.trim()) }); current = ''; };
  for (const block of blocks) {
    const first = block.split('\n')[0];
    const isHeading = /^#{1,6}\s|^(?:chapter|section|unit|الفصل|القسم)\s/i.test(first)
      || (first.length < 100 && /:\s*$/.test(first));
    if (isHeading && current && estimateTokens(current) >= 350) flush();
    if (isHeading) { heading = first.replace(/^#+\s*/, ''); if (/^(?:chapter|الفصل)/i.test(heading)) chapter = heading; }
    if (current && estimateTokens(`${current}\n\n${block}`) > maxTokens) {
      flush();
      if (heading && !block.startsWith(heading)) current = heading;
    }
    current += (current ? '\n\n' : '') + block;
    if (estimateTokens(current) >= targetTokens && !isHeading) flush();
  }
  flush(); return chunks;
}
