import { PDFParse } from "pdf-parse";
import JSZip from "jszip";
import { downloadKnowledgeDocument } from "@/lib/storage";
import { createSystemClient } from "@/lib/db/server";
import { getAIProvider } from "@/lib/ai";
import { chunkText } from "@/lib/ai/rag";
import { getPool } from "@/lib/db/pool";
import { getAIConfig } from "@/lib/ai/config.mjs";
import { needsOcr, transcribePage } from "@/lib/ai/document-ocr";
import type { PoolClient } from "pg";
import { slideText, worksheetText, xmlTextNodes } from "@/lib/document-text";

const EMBEDDING_BATCH_SIZE = 32;

export interface ExtractedPage {
  pageNumber: number | null;
  text: string;
  ocr?: boolean;
}

export async function extractPagesFromFile(
  buffer: Buffer,
  fileName: string,
  userId?: string
): Promise<ExtractedPage[]> {
  const ext = fileName.split(".").pop()?.toLowerCase();

  if (ext === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const pages: ExtractedPage[] = result.pages.map(p => ({pageNumber:p.num,text:p.text.trim()}));
      const images = await parser.getImage({ imageThreshold:180, imageDataUrl:false, imageBuffer:false });
      const diagramPages = new Set(images.pages.filter(p => p.images.length > 0).map(p => p.pageNumber));
      const tables = await parser.getTable();
      for (const page of pages) {
        const pageTables = tables.pages.find(p => p.num === page.pageNumber)?.tables ?? [];
        if (pageTables.length) page.text += '\n\n' + pageTables.map(table => table.map(row => row.join(' | ')).join('\n')).join('\n\n');
      }
      const scanned = pages.filter(p => needsOcr(p.text) || diagramPages.has(p.pageNumber!));
      const limit = Number(process.env.KNOWLEDGE_MAX_OCR_PAGES || 200);
      if (!Number.isInteger(limit) || limit < 0) throw new Error("KNOWLEDGE_MAX_OCR_PAGES must be a non-negative integer");
      if (scanned.length > limit) throw new Error(`يحتاج الملف قراءة بصرية لـ ${scanned.length} صفحة؛ قسّمه إلى أجزاء أو ارفع حد KNOWLEDGE_MAX_OCR_PAGES (${limit}). لم يتم اعتماد فهرس ناقص.`);
      for (const page of scanned) {
        const screenshot = await parser.getScreenshot({partial:[page.pageNumber!],desiredWidth:1600});
        const image = screenshot.pages[0];
        if (!image) throw new Error(`تعذر قراءة صفحة ${page.pageNumber}`);
        const transcription = await transcribePage(image.dataUrl, getAIProvider(), userId);
        // Retain native text if the visual pass finds no additional content.
        if (transcription) page.text = transcription;
        page.ocr = true;
      }
      return pages;
    } finally {
      await parser.destroy();
    }
  }

  if (ext === "docx") {
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml')?.async('text');
    if (!xml) throw new Error('DOCX has no document body');
    const { docxText } = await import('@/lib/document-text');
    return [{ pageNumber:null, text:docxText(xml) }];
  }

  if (ext === "pptx") {
      const zip = await JSZip.loadAsync(buffer);
      const slideFiles = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => Number(a.match(/slide(\d+)\.xml/)![1]) - Number(b.match(/slide(\d+)\.xml/)![1]));

      const {renderSlides}=await import('@/lib/tutor/slide-renderer');
      const rendered=await renderSlides(buffer);
      if(rendered){
        const extracted=await extractPagesFromFile(rendered,'slides.pdf',userId);
        for(const page of extracted){const notes=await zip.file(`ppt/notesSlides/notesSlide${page.pageNumber}.xml`)?.async('text');if(notes)page.text+='\n\nSpeaker notes:\n'+slideText(notes);}
        return extracted;
      }
      const hasVisuals=Object.keys(zip.files).some(name=>/^ppt\/(?:media|charts|diagrams)\//.test(name));
      if(hasVisuals)throw new Error('Visual PPTX slides need LibreOffice slide rendering. Configure LIBREOFFICE_PATH or upload an exported PDF; no incomplete visual index was published.');

      const pages: ExtractedPage[] = [];
      for (let i = 0; i < slideFiles.length; i++) {
        const xml = await zip.files[slideFiles[i]].async("text");
        let text = slideText(xml);
        const notes = await zip.file(`ppt/notesSlides/notesSlide${i+1}.xml`)?.async('text');
        if (notes) text += '\n\nSpeaker notes:\n' + slideText(notes);
        const rels = await zip.file(`ppt/slides/_rels/slide${i+1}.xml.rels`)?.async('text') ?? '';
        for (const relationship of rels.matchAll(/<Relationship\b[^>]*Type="[^"]*\/image"[^>]*Target="([^"]+)"[^>]*\/?\s*>/g)) {
          const target = relationship[1].replace(/^\.\.\//,'ppt/');
          const image = await zip.file(target)?.async('nodebuffer');
          if (image) {
            const { toVisionDataUri } = await import('@/lib/vision-image');
            text += '\n\nSlide diagram:\n' + await transcribePage(await toVisionDataUri(image),getAIProvider(),userId);
          }
        }
        if (text) pages.push({ pageNumber: i + 1, text });
      }
      if (pages.length) return pages;
  }

  if (["txt", "md", "csv", "json"].includes(ext || "")) {
    return [{ pageNumber: null, text: buffer.toString("utf-8").trim() }];
  }

  if (ext === "xlsx") {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const shared = await zip.file("xl/sharedStrings.xml")?.async("text") ?? "";
      const strings = [...shared.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>xmlTextNodes(m[1]));
      const sheetFiles = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
        .sort((a,b)=>Number(a.match(/sheet(\d+)/)![1])-Number(b.match(/sheet(\d+)/)![1]));
      const chunks: string[] = [];
      for (const name of sheetFiles) {
        const xml = await zip.files[name].async("text");
        const text = worksheetText(xml,strings);
        if (text) chunks.push(`${name}\n${text}`);
      }
      if (chunks.length) return [{ pageNumber: null, text: chunks.join("\n") }];
    } catch {
      // Fallback
    }
  }

  throw new Error(`تعذر استخراج نص موثوق من ${ext || "نوع الملف المجهول"}. للملفات القديمة استخدم PDF أو DOCX أو PPTX أو XLSX.`);
}

/**
 * Full RAG ingestion pipeline for one document: download -> extract ->
 * chunk -> embed -> store.
 */
export async function processDocument(documentId: string): Promise<void> {
  if (process.env.AI_ARCHITECTURE !== 'legacy') {
    const { registerDocument,processKnowledgeDocument } = await import('@/lib/tutor/ingestion');
    return processKnowledgeDocument(await registerDocument(documentId));
  }
  const lock = await getPool().connect();
  let acquired = false;
  try {
    const result = await lock.query("SELECT pg_try_advisory_lock(73194026) AS acquired");
    acquired = result.rows[0].acquired;
    if (!acquired) throw new Error("تتم معالجة ملف آخر حاليًا؛ حاول بعد انتهاء المعالجة");
    await ingestDocument(documentId, lock);
  } finally {
    try { if (acquired) await lock.query("SELECT pg_advisory_unlock(73194026)"); }
    finally { lock.release(); }
  }
}

async function ingestDocument(documentId: string, staging: PoolClient): Promise<void> {
  const db = createSystemClient();

  const { data: doc, error: docError } = await db
    .from("documents")
    .select("id, file_url, file_name, subject_id, title, source_type, exam_year, semester, exam_type, doctor_name")
    .eq("id", documentId)
    .single();

  if (docError || !doc) throw new Error(docError?.message ?? "Document not found");

  const processing = await db.from("documents").update({ status: "processing" }).eq("id", documentId);
  if (processing.error) throw new Error(processing.error.message);

  try {
    const buffer = await downloadKnowledgeDocument(doc.file_url);
    const pages = await extractPagesFromFile(buffer, doc.file_name);

    if (pages.length === 0) throw new Error("لم يتم العثور على نص داخل الملف");

    // Build in a connection-local staging table. Old chunks survive a failed reindex.
    await staging.query(`CREATE TEMP TABLE IF NOT EXISTS ingestion_chunks (
      document_id uuid, subject_id uuid, content text, page_number integer, chunk_index integer,
      embedding double precision[], embedding_provider text, embedding_model text, embedding_dimensions integer
    )`);
    await staging.query("TRUNCATE ingestion_chunks");

    const provider = getAIProvider();
    const providerName = getAIConfig().provider;
    let embeddingSpace = "";
    let chunkIndex = 0;
    for (const page of pages) {
      const chunks = chunkText(page.text);
      for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        const embeddings = await provider.createEmbeddings(batch);
        if (embeddings.length !== batch.length) throw new Error("Embedding count mismatch");
        for (const result of embeddings) {
          const space = `${result.model}:${result.embedding.length}`;
          if (!result.embedding.length || !result.embedding.every(Number.isFinite) || (embeddingSpace && embeddingSpace !== space)) throw new Error("Embedding model/dimensions changed during indexing");
          embeddingSpace = space;
        }
        const rows = batch.map((content, j) => ({
            document_id: documentId,
            subject_id: doc.subject_id,
            content,
            page_number: page.pageNumber,
            chunk_index: chunkIndex++,
            embedding: embeddings[j].embedding,
            embedding_provider: providerName,
            embedding_model: embeddings[j].model,
            embedding_dimensions: embeddings[j].embedding.length,
        }));
        await staging.query(`INSERT INTO ingestion_chunks SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
          document_id uuid,subject_id uuid,content text,page_number integer,chunk_index integer,
          embedding double precision[],embedding_provider text,embedding_model text,embedding_dimensions integer)`,[JSON.stringify(rows)]);
      }
    }

    if (!chunkIndex) throw new Error("لم أجد نصًا مقروءًا للفهرسة؛ الملف يحتاج نسخة أوضح");
    await staging.query("BEGIN");
    try {
      await staging.query("DELETE FROM document_chunks WHERE document_id=$1",[documentId]);
      await staging.query(`INSERT INTO document_chunks(document_id,subject_id,content,page_number,chunk_index,
        embedding,embedding_provider,embedding_model,embedding_dimensions) SELECT * FROM ingestion_chunks`);
      await staging.query(`UPDATE documents SET status='ready',chunk_count=$2,error_message=NULL,
        extraction_page_count=$3,ocr_page_count=$4,index_version=2 WHERE id=$1`,
        [documentId,chunkIndex,pages.length,pages.filter(p=>p.ocr).length]);
      await staging.query("COMMIT");

      // Auto-trigger specialized exam / summary pipeline if applicable
      const sType = (doc.source_type || "").toUpperCase();
      if (["PAST_EXAM", "QUESTION_BANK", "QUESTIONS"].includes(sType) && doc.subject_id) {
        const pool = getPool();
        const { rows: existingExams } = await pool.query<{ id: string }>(
          "SELECT id FROM public.exams WHERE document_id = $1",
          [documentId]
        );
        let examId = existingExams[0]?.id;
        if (!examId) {
          const { rows: newExam } = await pool.query<{ id: string }>(
            `INSERT INTO public.exams (
               subject_id, title, exam_year, semester, exam_type, doctor_name, document_id, status
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'UPLOADED')
             RETURNING id`,
            [
              doc.subject_id,
              doc.title,
              doc.exam_year || null,
              doc.semester || null,
              doc.exam_type || "PAST_EXAM",
              doc.doctor_name || null,
              documentId,
            ]
          );
          examId = newExam[0]?.id;
        }
        if (examId) {
          const { processExamDocument } = await import("@/lib/exams/exam-pipeline");
          void processExamDocument(examId).catch((err) => {
            console.error(`[ExamPipeline] Error processing exam ${examId}:`, err);
          });
        }
      } else if (["SUMMARY", "REVIEW_NOTES"].includes(sType) && doc.subject_id) {
        const { processSummaryDocument } = await import("@/lib/exams/summary-processor");
        void processSummaryDocument(documentId, doc.subject_id, pages).catch((err) => {
          console.error(`[SummaryProcessor] Error processing summary ${documentId}:`, err);
        });
      }
    } catch(error) { await staging.query("ROLLBACK"); throw error; }
  } catch (err) {
    await db
      .from("documents")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : "فشلت المعالجة",
      })
      .eq("id", documentId);
    throw err;
  }
}
