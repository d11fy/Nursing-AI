import "server-only";
import { identityDb, withIdentity, workerDb } from "@/lib/tutor/db";
import { getAccessibleLibraryDocument } from "@/lib/library";
import type { StudyPack, StudyContentType, GenerationStatus, ExtractedPageItem } from "../types";

export async function getOrCreateStudyPack(lectureId: string, userId: string): Promise<StudyPack> {
  const db = identityDb(userId);

  // 1. Verify lecture exists, belongs to student and is ready
  const lectureRes = await db.query<{
    id: string;
    user_id: string;
    subject_id: string;
    title: string;
    file_hash: string;
    status: string;
  }>(
    "SELECT id, user_id, subject_id, title, file_hash, status FROM lectures WHERE id = $1 AND user_id = $2",
    [lectureId, userId]
  );
  const lecture = lectureRes.rows[0];
  if (!lecture) throw new Error("المحاضرة غير موجودة أو ليس لديك صلاحية الوصول إليها");
  if (lecture.status !== "ready" && lecture.status !== "expired") {
    throw new Error("المحاضرة قيد المعالجة ولم تجهز بعد للدراسة");
  }

  // 2. Find document_id from knowledge_documents if available
  const docRes = await db.query<{ id: string }>(
    "SELECT id FROM knowledge_documents WHERE lecture_id = $1 AND owner_id = $2 LIMIT 1",
    [lectureId, userId]
  );
  const documentId = docRes.rows[0]?.id ?? null;

  // 3. Find or create study pack
  const existingRes = await db.query<StudyPack>(
    "SELECT * FROM study_packs WHERE lecture_id = $1 AND user_id = $2 LIMIT 1",
    [lectureId, userId]
  );

  if (existingRes.rows.length > 0) {
    const pack = existingRes.rows[0];
    // Check if lecture file_hash changed -> mark content outdated if modified
    if (pack.source_hash !== lecture.file_hash) {
      await withIdentity(userId, async (client) => {
        await client.query(
          "UPDATE study_packs SET source_hash = $1, title = $2, updated_at = now() WHERE id = $3",
          [lecture.file_hash, lecture.title, pack.id]
        );
        await client.query(
          "UPDATE study_pack_content SET generation_status = 'outdated', updated_at = now() WHERE study_pack_id = $1",
          [pack.id]
        );
      });
      pack.source_hash = lecture.file_hash;
      pack.title = lecture.title;
    }
    return pack;
  }

  // Insert new study pack
  return withIdentity(userId, async (client) => {
    const insertRes = await client.query<StudyPack>(
      `INSERT INTO study_packs (user_id, lecture_id, document_id, subject_id, title, status, source_hash)
       VALUES ($1, $2, $3, $4, $5, 'ready', $6)
       ON CONFLICT (lecture_id) DO UPDATE SET title = EXCLUDED.title, source_hash = EXCLUDED.source_hash, updated_at = now()
       RETURNING *`,
      [userId, lecture.id, documentId, lecture.subject_id, lecture.title, lecture.file_hash]
    );
    return insertRes.rows[0];
  });
}

export async function getOrCreateLibraryStudyPack(documentId: string, userId: string): Promise<StudyPack> {
  const document = await getAccessibleLibraryDocument(userId, documentId);
  if (!document.subjectId) throw new Error("لا يمكن إنشاء حزمة دراسة لمصدر غير مرتبط بمادة");

  return withIdentity(userId, async (client) => {
    const existing = await client.query<StudyPack>(
      "SELECT * FROM study_packs WHERE user_id = $1 AND document_id = $2 AND lecture_id IS NULL LIMIT 1",
      [userId, documentId]
    );
    if (existing.rows[0]) {
      const pack = existing.rows[0];
      if (pack.source_hash !== document.fileHash || pack.title !== document.title) {
        const updated = await client.query<StudyPack>(
          `UPDATE study_packs SET source_hash = $1, title = $2, subject_id = $3, updated_at = now()
           WHERE id = $4 AND user_id = $5 RETURNING *`,
          [document.fileHash, document.title, document.subjectId, pack.id, userId]
        );
        return updated.rows[0];
      }
      return pack;
    }

    const inserted = await client.query<StudyPack>(
      `INSERT INTO study_packs (user_id, lecture_id, document_id, subject_id, title, status, source_hash)
       VALUES ($1, NULL, $2, $3, $4, 'ready', $5)
       ON CONFLICT (user_id, document_id) WHERE lecture_id IS NULL AND document_id IS NOT NULL
       DO UPDATE SET title = EXCLUDED.title, subject_id = EXCLUDED.subject_id,
                     source_hash = EXCLUDED.source_hash, updated_at = now()
       RETURNING *`,
      [userId, documentId, document.subjectId, document.title, document.fileHash]
    );
    return inserted.rows[0];
  });
}

export async function getStudyPackById(studyPackId: string, userId: string): Promise<StudyPack | null> {
  const db = identityDb(userId);
  const res = await db.query<StudyPack>(
    "SELECT * FROM study_packs WHERE id = $1 AND user_id = $2",
    [studyPackId, userId]
  );
  return res.rows[0] ?? null;
}

export async function getStudyPackContentRow(
  studyPackId: string,
  contentType: StudyContentType,
  userId: string
): Promise<{
  id: string;
  study_pack_id: string;
  content_type: StudyContentType;
  content_json: unknown;
  source_hash: string;
  generation_status: GenerationStatus;
  generated_at: string;
  updated_at: string;
} | null> {
  const db = identityDb(userId);
  const res = await db.query<{
    id: string;
    study_pack_id: string;
    content_type: StudyContentType;
    content_json: unknown;
    source_hash: string;
    generation_status: GenerationStatus;
    generated_at: string;
    updated_at: string;
  }>(
    `SELECT c.* FROM study_pack_content c
     JOIN study_packs sp ON sp.id = c.study_pack_id
     WHERE c.study_pack_id = $1 AND c.content_type = $2 AND sp.user_id = $3`,
    [studyPackId, contentType, userId]
  );
  return res.rows[0] ?? null;
}

export async function setStudyPackContentStatus(
  studyPackId: string,
  contentType: StudyContentType,
  status: GenerationStatus,
  sourceHash: string,
  userId: string
): Promise<void> {
  await withIdentity(userId, async (client) => {
    await client.query(
      `INSERT INTO study_pack_content (study_pack_id, content_type, content_json, source_hash, generation_status)
       VALUES ($1, $2, '{}'::jsonb, $3, $4)
       ON CONFLICT (study_pack_id, content_type)
       DO UPDATE SET generation_status = $4, source_hash = $3, updated_at = now()`,
      [studyPackId, contentType, sourceHash, status]
    );
  });
}

export async function saveStudyPackContent(
  studyPackId: string,
  contentType: StudyContentType,
  contentJson: unknown,
  sourceHash: string,
  userId: string
): Promise<void> {
  await withIdentity(userId, async (client) => {
    await client.query(
      `INSERT INTO study_pack_content (study_pack_id, content_type, content_json, source_hash, generation_status, generated_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, 'ready', now(), now())
       ON CONFLICT (study_pack_id, content_type)
       DO UPDATE SET content_json = EXCLUDED.content_json, source_hash = EXCLUDED.source_hash,
                     generation_status = 'ready', generated_at = now(), updated_at = now()`,
      [studyPackId, contentType, JSON.stringify(contentJson), sourceHash]
    );
  });
}

export async function getExtractedPagesForLecture(
  lectureId: string,
  userId: string
): Promise<ExtractedPageItem[]> {
  const db = identityDb(userId);
  const res = await db.query<{ extracted_pages_json: ExtractedPageItem[] }>(
    "SELECT extracted_pages_json FROM knowledge_documents WHERE lecture_id = $1 AND owner_id = $2",
    [lectureId, userId]
  );
  const pages = res.rows[0]?.extracted_pages_json;
  if (Array.isArray(pages) && pages.length > 0) {
    return pages;
  }

  // Fallback: If knowledge_documents extracted_pages_json is not yet populated or legacy,
  // load chunks from knowledge_chunks or lecture_chunks
  const chunksRes = await db.query<{ content: string; page_number: number | null; chunk_index: number }>(
    `SELECT content, page_number, chunk_index FROM knowledge_chunks
     WHERE document_id = (SELECT id FROM knowledge_documents WHERE lecture_id = $1 AND owner_id = $2 LIMIT 1)
     ORDER BY chunk_index ASC`,
    [lectureId, userId]
  );
  if (chunksRes.rows.length > 0) {
    // Group chunks by page_number
    const pageMap = new Map<number, string[]>();
    for (const c of chunksRes.rows) {
      const p = c.page_number ?? 1;
      const list = pageMap.get(p) ?? [];
      list.push(c.content);
      pageMap.set(p, list);
    }
    return Array.from(pageMap.entries()).map(([p, contents]) => ({
      pageNumber: p,
      text: contents.join("\n\n"),
    }));
  }

  return [];
}

export async function getExtractedPagesForDocument(
  documentId: string,
  userId: string
): Promise<ExtractedPageItem[]> {
  const db = identityDb(userId);
  const res = await db.query<{ extracted_pages_json: ExtractedPageItem[] }>(
    "SELECT extracted_pages_json FROM knowledge_documents WHERE id = $1",
    [documentId]
  );
  const pages = res.rows[0]?.extracted_pages_json;
  if (Array.isArray(pages) && pages.length > 0) return pages;

  const chunks = await db.query<{ content: string; page_number: number | null; chunk_index: number }>(
    `SELECT content, page_number, chunk_index FROM knowledge_chunks
     WHERE document_id = $1 ORDER BY chunk_index ASC`,
    [documentId]
  );
  const pageMap = new Map<number, string[]>();
  for (const chunk of chunks.rows) {
    const page = chunk.page_number ?? 1;
    const values = pageMap.get(page) ?? [];
    values.push(chunk.content);
    pageMap.set(page, values);
  }
  return Array.from(pageMap, ([pageNumber, contents]) => ({ pageNumber, text: contents.join("\n\n") }));
}

export async function getExtractedPagesForStudyPack(studyPack: StudyPack, userId: string) {
  if (studyPack.lecture_id) return getExtractedPagesForLecture(studyPack.lecture_id, userId);
  if (studyPack.document_id) return getExtractedPagesForDocument(studyPack.document_id, userId);
  return [];
}

export type SharedStudyContentRow = {
  document_id: string;
  source_hash: string;
  content_type: StudyContentType;
  content_json: unknown;
  generation_status: "generating" | "ready" | "failed";
  generated_at: string | null;
  updated_at: string;
};

export async function getSharedStudyContent(
  documentId: string,
  sourceHash: string,
  contentType: StudyContentType,
  userId: string
): Promise<SharedStudyContentRow | null> {
  const result = await identityDb(userId).query<SharedStudyContentRow>(
    `SELECT * FROM shared_study_content
     WHERE document_id = $1 AND source_hash = $2 AND content_type = $3`,
    [documentId, sourceHash, contentType]
  );
  return result.rows[0] ?? null;
}

export async function claimSharedStudyContent(
  documentId: string,
  sourceHash: string,
  contentType: StudyContentType
): Promise<boolean> {
  const result = await workerDb.query<{ claimed: boolean }>(
    `INSERT INTO shared_study_content(document_id,source_hash,content_type,content_json,generation_status,updated_at)
     VALUES($1,$2,$3,'{}'::jsonb,'generating',now())
     ON CONFLICT(document_id,source_hash,content_type) DO UPDATE
       SET generation_status='generating',content_json='{}'::jsonb,generated_at=NULL,updated_at=now()
       WHERE shared_study_content.generation_status='failed'
          OR (shared_study_content.generation_status='generating' AND shared_study_content.updated_at < now()-interval '60 seconds')
     RETURNING true AS claimed`,
    [documentId, sourceHash, contentType]
  );
  return result.rows[0]?.claimed ?? false;
}

export async function saveSharedStudyContent(
  documentId: string,
  sourceHash: string,
  contentType: StudyContentType,
  contentJson: unknown
) {
  await workerDb.query(
    `UPDATE shared_study_content SET content_json=$4::jsonb,generation_status='ready',generated_at=now(),updated_at=now()
     WHERE document_id=$1 AND source_hash=$2 AND content_type=$3`,
    [documentId, sourceHash, contentType, JSON.stringify(contentJson)]
  );
}

export async function failSharedStudyContent(documentId: string, sourceHash: string, contentType: StudyContentType) {
  await workerDb.query(
    `UPDATE shared_study_content SET generation_status='failed',updated_at=now()
     WHERE document_id=$1 AND source_hash=$2 AND content_type=$3`,
    [documentId, sourceHash, contentType]
  );
}
