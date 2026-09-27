import "server-only";
import { randomUUID } from "node:crypto";
import { createSystemClient } from "@/lib/db/server";
import { getPool } from "@/lib/db/pool";
import { processDocument } from "@/lib/knowledge";
import { logEvent } from "@/lib/log";

/**
 * Approves a pending contribution by handing its extracted lecture text to
 * the existing admin document pipeline (lib/knowledge.ts's processDocument) —
 * reused as-is so the shared knowledge base gets fresh chunks/embeddings in
 * the current provider's space, and "reprocess" on the admin knowledge page
 * keeps working for it exactly like any other document.
 */
export async function approveContribution(contributionId: string, adminUserId: string): Promise<void> {
  const db = createSystemClient();
  const { data: contribution } = await db
    .from("knowledge_contributions")
    .select("id, lecture_id, subject_id, status")
    .eq("id", contributionId)
    .single();
  if (!contribution) throw new Error("المساهمة غير موجودة");
  if (contribution.status !== "pending") throw new Error("تمت مراجعة هذه المساهمة مسبقًا");

  const { data: lecture } = await db.from("lectures").select("id, title").eq("id", contribution.lecture_id).single();
  if (!lecture) throw new Error("المحاضرة غير موجودة");

  const { data: chunks } = await db
    .from("lecture_chunks")
    .select("content")
    .eq("lecture_id", contribution.lecture_id)
    .order("chunk_index", { ascending: true });
  const text = (chunks ?? []).map((c) => c.content).join("\n\n").trim();
  if (!text) throw new Error("لا يوجد محتوى لهذه المحاضرة");

  const path = `knowledge/${randomUUID()}`;
  const buffer = Buffer.from(text, "utf-8");
  await getPool().query(
    "INSERT INTO stored_files(path,bucket,owner_id,mime_type,content) VALUES($1,'knowledge-documents',$2,'text/plain',$3)",
    [path, adminUserId, buffer]
  );

  const { data: document, error } = await db
    .from("documents")
    .insert({
      title: lecture.title,
      file_url: path,
      file_name: `${lecture.title}.txt`,
      file_size: buffer.byteLength,
      subject_id: contribution.subject_id,
      source_type: "student_contribution",
      status: "uploading",
      created_by: adminUserId,
      contribution_id: contributionId,
    })
    .select("id")
    .single();
  if (error || !document) throw new Error("تعذر إنشاء سجل المعرفة المشتركة");

  await processDocument(document.id);

  await db
    .from("knowledge_contributions")
    .update({ status: "approved", reviewed_by: adminUserId, reviewed_at: new Date().toISOString(), approved_document_id: document.id })
    .eq("id", contributionId);
  await db.from("lectures").update({ contribution_status: "approved" }).eq("id", contribution.lecture_id);
  logEvent("CONTRIBUTION_APPROVED", { contributionId, lectureId: contribution.lecture_id, documentId: document.id });
}

export async function rejectContribution(contributionId: string, adminUserId: string): Promise<void> {
  const db = createSystemClient();
  const { data: contribution } = await db
    .from("knowledge_contributions")
    .select("id, lecture_id, status")
    .eq("id", contributionId)
    .single();
  if (!contribution) throw new Error("المساهمة غير موجودة");
  if (contribution.status !== "pending") throw new Error("تمت مراجعة هذه المساهمة مسبقًا");

  await db
    .from("knowledge_contributions")
    .update({ status: "rejected", reviewed_by: adminUserId, reviewed_at: new Date().toISOString() })
    .eq("id", contributionId);
  await db.from("lectures").update({ contribution_status: "rejected" }).eq("id", contribution.lecture_id);
  logEvent("CONTRIBUTION_REJECTED", { contributionId, lectureId: contribution.lecture_id });
}
