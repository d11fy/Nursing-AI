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
