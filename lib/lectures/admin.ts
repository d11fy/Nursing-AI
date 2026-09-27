import "server-only";
import { getPool } from "@/lib/db/pool";
import type { LectureStatus, LectureContributionStatus } from "@/types/database";

export type AdminLectureRow = {
  id: string;
  title: string;
  file_name: string;
  file_size_bytes: number;
  status: LectureStatus;
  uploaded_at: string;
  delete_after: string | null;
  deleted_at: string | null;
  contribution_status: LectureContributionStatus;
  student_name: string;
  student_email: string;
  subject_id: string;
  subject_name: string;
  academic_year_id: string | null;
  academic_year_name: string | null;
};

export async function getAdminLectures(filters: {
  subjectId?: string;
  academicYearId?: string;
  status?: LectureStatus;
  largeOnly?: boolean;
  expiringSoon?: boolean;
  contributionStatus?: LectureContributionStatus;
} = {}): Promise<AdminLectureRow[]> {
  const values: unknown[] = [];
  const where: string[] = ["1=1"];
  const bind = (v: unknown) => { values.push(v); return `$${values.length}`; };

  if (filters.subjectId) where.push(`l.subject_id = ${bind(filters.subjectId)}`);
  if (filters.academicYearId) where.push(`p.academic_year_id = ${bind(filters.academicYearId)}`);
  if (filters.status) where.push(`l.status = ${bind(filters.status)}`);
  if (filters.largeOnly) where.push(`l.delete_after IS NOT NULL`);
  if (filters.expiringSoon) where.push(`l.delete_after IS NOT NULL AND l.deleted_at IS NULL AND l.delete_after <= now() + interval '3 days'`);
  if (filters.contributionStatus) where.push(`l.contribution_status = ${bind(filters.contributionStatus)}`);

  const { rows } = await getPool().query<AdminLectureRow>(
    `SELECT l.id, l.title, l.file_name, l.file_size_bytes, l.status, l.uploaded_at, l.delete_after, l.deleted_at, l.contribution_status,
       p.full_name AS student_name, p.email AS student_email,
       s.id AS subject_id, s.name_ar AS subject_name,
       y.id AS academic_year_id, y.name_ar AS academic_year_name
     FROM lectures l
     JOIN profiles p ON p.user_id = l.user_id
     JOIN subjects s ON s.id = l.subject_id
     LEFT JOIN academic_years y ON y.id = p.academic_year_id
     WHERE ${where.join(" AND ")}
     ORDER BY l.uploaded_at DESC`,
    values
  );
  return rows;
}

export type LectureStorageStats = {
  totalStorageBytes: number;
  largeFileCount: number;
  scheduledForDeletionCount: number;
  deletedThisMonthCount: number;
  processingFailuresCount: number;
};

export async function getLectureStorageStats(): Promise<LectureStorageStats> {
  const { rows } = await getPool().query<{
    total_storage: string; large_count: string; scheduled_count: string; deleted_month: string; failed_count: string;
  }>(
    `SELECT
       COALESCE(SUM(file_size_bytes) FILTER (WHERE deleted_at IS NULL), 0) AS total_storage,
       COUNT(*) FILTER (WHERE delete_after IS NOT NULL AND deleted_at IS NULL) AS large_count,
       COUNT(*) FILTER (WHERE delete_after IS NOT NULL AND deleted_at IS NULL AND delete_after <= now() + interval '3 days') AS scheduled_count,
       (SELECT COUNT(*) FROM file_cleanup_logs WHERE status='success' AND attempted_at >= date_trunc('month', now())) AS deleted_month,
       COUNT(*) FILTER (WHERE status='failed') AS failed_count
     FROM lectures`
  );
  const r = rows[0];
  return {
    totalStorageBytes: Number(r.total_storage),
    largeFileCount: Number(r.large_count),
    scheduledForDeletionCount: Number(r.scheduled_count),
    deletedThisMonthCount: Number(r.deleted_month),
    processingFailuresCount: Number(r.failed_count),
  };
}

export type AdminContributionRow = {
  id: string;
  lecture_id: string;
  lecture_title: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  student_name: string;
  student_email: string;
  subject_name: string | null;
  classification: string;
  classification_confidence: number | null;
  privacy_flagged: boolean;
  status: string;
  created_at: string;
};

export async function getAdminContributions(status: "pending" | "approved" | "rejected" = "pending"): Promise<AdminContributionRow[]> {
  const { rows } = await getPool().query<AdminContributionRow>(
    `SELECT c.id, c.lecture_id, l.title AS lecture_title, l.file_name, l.mime_type, l.file_size_bytes,
       p.full_name AS student_name, p.email AS student_email, s.name_ar AS subject_name,
       c.classification, c.classification_confidence, c.privacy_flagged, c.status, c.created_at
     FROM knowledge_contributions c
     JOIN lectures l ON l.id = c.lecture_id
     JOIN profiles p ON p.user_id = c.user_id
     LEFT JOIN subjects s ON s.id = c.subject_id
     WHERE c.status = $1
     ORDER BY c.created_at DESC`,
    [status]
  );
  return rows;
}

export async function getContributionPreview(lectureId: string): Promise<string> {
  const { rows } = await getPool().query<{ content: string }>(
    `SELECT content FROM lecture_chunks WHERE lecture_id=$1 ORDER BY chunk_index ASC LIMIT 5`,
    [lectureId]
  );
  return rows.map((r) => r.content).join("\n\n");
}
