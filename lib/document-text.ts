export function decodeXmlText(value: string): string {
  return value.replace(/&#(x[0-9a-f]+|\d+);/gi, (match,n:string) => {
    const code = n.startsWith("x") || n.startsWith("X") ? parseInt(n.slice(1),16) : Number(n);
    return code>=0 && code<=0x10ffff ? String.fromCodePoint(code) : match;
  }).replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");
}
export function xmlTextNodes(xml: string): string {
  return [...xml.matchAll(/<(?:a:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:a:)?t>/g)].map(m=>decodeXmlText(m[1])).join("");
}
export function slideText(xml: string): string {
  return [...xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)].map(m=>xmlTextNodes(m[1])).filter(Boolean).join("\n");
}
/** Retain cell references and numeric values; shared-string indexes are not cell contents. */
export function worksheetText(xml: string, strings: string[]): string {
  return [...xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)].map(row=>
    [...row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(cell=>{
      const address=cell[1].match(/\br="([^"]+)"/)?.[1] ?? "";
      const type=cell[1].match(/\bt="([^"]+)"/)?.[1];
      const raw=cell[2].match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const value=type==="s" ? strings[Number(raw)] : type==="inlineStr" ? xmlTextNodes(cell[2]) : raw;
      return value==null ? "" : `${address}: ${decodeXmlText(value)}`;
    }).filter(Boolean).join(" | ")
  ).filter(Boolean).join("\n");
}

/** Heading level (1 = chapter level) for every paragraph style that is a heading, from word/styles.xml. */
export function docxHeadingLevels(stylesXml: string | undefined): Map<string, number> {
  const levels = new Map<string, number>();
  for (const style of (stylesXml ?? '').matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    const id = style[1], body = style[2];
    const name = body.match(/<w:name\b[^>]*w:val="([^"]+)"/)?.[1] ?? '';
    const outline = body.match(/<w:outlineLvl\b[^>]*w:val="(\d)"/)?.[1];
    const named = name.match(/^(?:heading|عنوان)\s*(\d)$/i)?.[1] ?? id.match(/^Heading(\d)$/i)?.[1];
    if (/^title$/i.test(name) || /^Title$/i.test(id)) levels.set(id, 1);
    else if (named) levels.set(id, Number(named));
    else if (outline !== undefined) levels.set(id, Number(outline) + 1);
  }
  return levels;
}

export function docxText(xml: string, stylesXml?: string): string {
  const body = xml.match(/<w:body[^>]*>([\s\S]*?)<\/w:body>/)?.[1] ?? xml;
  const levels = docxHeadingLevels(stylesXml);
  // Tabs and manual line breaks separate words; dropping them would glue "Bone" and "Structure" together.
  const text = (part:string) => [...part.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g)].map(m=>m[1]!==undefined?decodeXmlText(m[1]):m[0].startsWith('<w:tab')?' ':'\n').join('').replace(/[ \t]{2,}/g,' ').trim();
  return [...body.matchAll(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(m=> {
    if(m[0].startsWith('<w:tbl')) return [...m[0].matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)].map(row=>
      [...row[1].matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)].map(cell=>text(cell[1])).join(' | ')).join('\n');
    const value=text(m[0]), style=m[0].match(/<w:pStyle[^>]*w:val="([^"]+)"/i)?.[1] ?? '';
    const own=m[0].match(/<w:outlineLvl\b[^>]*w:val="(\d)"/)?.[1];
    // Word headings keep their depth so chapters (level 1) can be told apart from sections (level 2+).
    const level=own!==undefined ? Number(own)+1 : levels.get(style) ?? (/^heading\s*(\d)/i.exec(style)?.[1] ? Number(/^heading\s*(\d)/i.exec(style)![1]) : /^title$/i.test(style) ? 1 : 0);
    return value && level>0 ? `${'#'.repeat(Math.min(level,6))} ${value}` : /<w:numPr/.test(m[0]) ? `- ${value}` : value;
  }).filter(Boolean).join('\n\n').trim();
}

/** Plain-text files arrive as UTF-8, UTF-16 (Windows "Unicode") or legacy Arabic code pages; all must read correctly. */
export function decodeTextFile(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer[0] === 0xfe && buffer[1] === 0xff) return Buffer.from(buffer.subarray(2)).swap16().toString('utf16le');
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return buffer.subarray(3).toString('utf8');
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  // Latin text in UTF-16 without a BOM has a zero byte in every other position.
  if (sample.length > 8 && sample.filter(byte => byte === 0).length > sample.length / 4) return buffer.toString('utf16le');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return new TextDecoder('windows-1256').decode(buffer); }
}
