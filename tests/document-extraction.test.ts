import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { PDFParse } from "pdf-parse";
import { getAIProvider } from "../lib/ai";
import { extractPagesFromFile } from "../lib/knowledge";
import { chunkText } from "../lib/ai/rag";
import { needsOcr } from "../lib/ai/document-ocr";

test("word-aware chunking covers the whole page without dropping words or units",()=>{
  const words=Array.from({length:500},(_,i)=>`word${i}`);const chunks=chunkText(words.join(" "),200,35);
  assert.ok(chunks.every(c=>c.length<=200));
  for(const word of words)assert.ok(chunks.some(c=>c.split(/\s+/).includes(word)),word);
  assert.throws(()=>chunkText("text",10,10));
});
test("PPTX and XLSX preserve labels, table values and XML escapes",async()=>{
  const slides=new JSZip();slides.file("ppt/slides/slide1.xml",'<a:p><a:r><a:t>Symptoms &amp; signs</a:t></a:r></a:p><a:p><a:r><a:t>10 &lt; 20</a:t></a:r></a:p>');
  const ppt=await extractPagesFromFile(await slides.generateAsync({type:"nodebuffer"}),"notes.pptx");
  assert.equal(ppt[0].pageNumber,1);assert.equal(ppt[0].text,"Symptoms & signs\n10 < 20");
  const sheet=new JSZip();sheet.file("xl/sharedStrings.xml","<sst><si><t>Label</t></si></sst>");
  sheet.file("xl/worksheets/sheet1.xml",'<worksheet><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>12.5</v></c><c r="C1" t="inlineStr"><is><t>mg</t></is></c></row></worksheet>');
  const xlsx=await extractPagesFromFile(await sheet.generateAsync({type:"nodebuffer"}),"table.xlsx");
  assert.match(xlsx[0].text,/A1: Label \| B1: 12.5 \| C1: mg/);
  await assert.rejects(extractPagesFromFile(Buffer.from("legacy binary"),"old.xls"),/موثوق/);
});
test("PDF pages with sparse text trigger OCR and retain real page numbers",async(t)=>{
  process.env.OPENAI_API_KEY="test-only";process.env.AI_PROVIDER="openai";
  const native="This text-based page already contains enough readable letters to avoid unnecessary visual extraction. ".repeat(3);
  t.mock.method(PDFParse.prototype,"getText",async()=>({pages:[{num:1,text:native},{num:2,text:""}],total:2}));
  let scanned:number[]=[];
  t.mock.method(PDFParse.prototype,"getScreenshot",async(options:{partial:number[]})=>{scanned=options.partial;return{pages:[{dataUrl:"data:image/png;base64,AA==",pageNumber:2}],total:2};});
  t.mock.method(getAIProvider(),"generateVisionResponse",async()=>({content:"Transcribed second page with visible labels.",inputTokens:1,outputTokens:1,model:"test"}));
  const result=await extractPagesFromFile(Buffer.from("%PDF-1.7\n"),"scan.pdf");
  assert.deepEqual(scanned,[2]);assert.equal(result.length,2);assert.equal(result[1].pageNumber,2);assert.equal(result[1].ocr,true);
  assert.equal(result[0].text,native.trim());assert.equal(needsOcr(""),true);
});
