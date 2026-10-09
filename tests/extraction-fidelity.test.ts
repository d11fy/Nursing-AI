// What the student's file becomes before indexing: complete, ordered, with headings and slide numbers intact.
import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractPagesFromFile } from "../lib/knowledge";
import { decodeTextFile, docxHeadingLevels } from "../lib/document-text";
import { buildDocumentIndex } from "../lib/tutor/document-index";

const paragraph = (style: string | null, text: string) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t>${text}</w:t></w:r></w:p>`;
const styles = `<w:styles>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
  <w:style w:type="paragraph" w:styleId="ar1"><w:name w:val="عنوان 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Custom"><w:name w:val="Chapter Title"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
</w:styles>`;

test("DOCX keeps heading depth so chapters differ from sections, and the last paragraph is never dropped", async () => {
  const zip = new JSZip();
  const body = [
    paragraph("Heading1", "Introduction"), paragraph(null, "Intro body. ".repeat(30)),
    paragraph("Heading2", "Scope"), paragraph(null, "Scope body. ".repeat(30)),
    paragraph("Heading1", "Cells"), paragraph(null, "Cell body. ".repeat(30)),
    paragraph("Custom", "Tissues"), paragraph(null, "Tissue body. ".repeat(30)),
    paragraph("ar1", "الجهاز الهيكلي"), paragraph(null, "نص الجهاز الهيكلي. ".repeat(20)),
    paragraph(null, "FINAL-SENTENCE-OF-THE-BOOK"),
  ].join("");
  zip.file("word/document.xml", `<w:document><w:body>${body}</w:body></w:document>`);
  zip.file("word/styles.xml", styles);
  const pages = await extractPagesFromFile(await zip.generateAsync({ type: "nodebuffer" }), "book.docx");
  assert.equal(pages.length, 1);
  const text = pages[0].text;
  assert.match(text, /^# Introduction$/m);
  assert.match(text, /^## Scope$/m);
  assert.match(text, /^# Cells$/m);
  assert.match(text, /^# Tissues$/m, "a custom style with an outline level is a chapter-level heading");
  assert.match(text, /^# الجهاز الهيكلي$/m, "localized heading styles are understood");
  assert.ok(text.endsWith("FINAL-SENTENCE-OF-THE-BOOK"), "nothing is cut from the end");
  const { outline, chunks } = buildDocumentIndex(pages, { title: "Docx book" });
  assert.equal(outline.chapterCount, 4);
  assert.deepEqual(outline.chapters.map((chapter) => chapter.title), ["Introduction", "Cells", "Tissues", "الجهاز الهيكلي"]);
  assert.equal(outline.chapters[0].sections[0]?.title, "Scope");
  assert.ok(chunks.some((chunk) => chunk.chapterIndex === 4 && chunk.content.includes("FINAL-SENTENCE-OF-THE-BOOK")), "the end of the file belongs to the last chapter");
  assert.equal(docxHeadingLevels(styles).get("Custom"), 1);
});

test("DOCX tabs and line breaks separate words instead of gluing them", async () => {
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document><w:body><w:p><w:r><w:t>Bone</w:t><w:tab/><w:t>Structure</w:t><w:br/><w:t>Marrow</w:t></w:r></w:p></w:body></w:document>`);
  const [page] = await extractPagesFromFile(await zip.generateAsync({ type: "nodebuffer" }), "tabs.docx");
  assert.equal(page.text, "Bone Structure\nMarrow");
});

test("PPTX slides are numbered in presentation order and each slide keeps its own speaker notes", async () => {
  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml", "<a:p><a:r><a:t>Second in the deck</a:t></a:r></a:p>");
  zip.file("ppt/slides/slide2.xml", "<a:p><a:r><a:t>First in the deck</a:t></a:r></a:p>");
  zip.file("ppt/presentation.xml", `<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId9"/><p:sldId id="257" r:id="rId8"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<Relationships><Relationship Id="rId8" Type="x/slide" Target="slides/slide1.xml"/><Relationship Id="rId9" Type="x/slide" Target="slides/slide2.xml"/></Relationships>`);
  zip.file("ppt/slides/_rels/slide2.xml.rels", `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide7.xml"/></Relationships>`);
  zip.file("ppt/notesSlides/notesSlide7.xml", "<a:p><a:r><a:t>Notes for the first slide</a:t></a:r></a:p>");
  const pages = await extractPagesFromFile(await zip.generateAsync({ type: "nodebuffer" }), "deck.pptx");
  assert.equal(pages[0].pageNumber, 1);
  assert.match(pages[0].text, /^First in the deck/);
  assert.match(pages[0].text, /Notes for the first slide/);
  assert.equal(pages[1].pageNumber, 2);
  assert.doesNotMatch(pages[1].text, /Notes for the first slide/);
});

test("text files in UTF-8, UTF-16 and Windows Arabic code pages all read correctly", async () => {
  const arabic = "الفصل الأول: مقدمة في التشريح";
  assert.equal(decodeTextFile(Buffer.from(arabic, "utf8")), arabic);
  assert.equal(decodeTextFile(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(arabic, "utf8")])), arabic);
  assert.equal(decodeTextFile(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(arabic, "utf16le")])), arabic);
  assert.equal(decodeTextFile(Buffer.from("Chapter 1 text", "utf16le")), "Chapter 1 text");
  const cp1256 = Buffer.from([0xc7, 0xe1, 0xdd, 0xd5, 0xe1]); // "الفصل" in windows-1256
  assert.equal(decodeTextFile(cp1256), "الفصل");
  const [page] = await extractPagesFromFile(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`${arabic}\n${"نص ".repeat(50)}`, "utf16le")]), "notes.txt");
  assert.ok(page.text.startsWith("الفصل الأول"));
});
