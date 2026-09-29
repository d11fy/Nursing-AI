import "server-only";
import { getPool } from "@/lib/db/pool";

/**
 * Normalizes text for similarity and duplicate comparison.
 */
function cleanQuestionForMatching(text: string): string {
  return text
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Computes word Jaccard similarity between two cleaned strings.
 */
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(" ").filter((w) => w.length > 2));
  const setB = new Set(b.split(" ").filter((w) => w.length > 2));
  if (!setA.size || !setB.size) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Clusters an extracted question into an existing question cluster or creates a new one.
 * Tracks recurring exam years (e.g. [2022, 2023, 2024, 2025]).
 */
export async function assignQuestionToCluster(
  questionId: string,
  subjectId: string,
  questionText: string,
  topic: string,
  examYear?: number | null
): Promise<{ clusterId: string; isNewCluster: boolean; occurrencesCount: number }> {
  const pool = getPool();
  const normalizedNew = cleanQuestionForMatching(questionText);

  // 1. Fetch existing clusters for this subject and topic
  const { rows: clusters } = await pool.query<{
    id: string;
    canonical_question: string;
    occurrences_count: number;
    exam_years_json: number[];
  }>(
    `SELECT id, canonical_question, occurrences_count, exam_years_json
     FROM public.question_clusters
     WHERE subject_id = $1 AND topic = $2
     ORDER BY occurrences_count DESC
     LIMIT 50`,
    [subjectId, topic]
  );

  let bestCluster: { id: string; occurrences_count: number; exam_years_json: number[] } | null = null;
  let bestSim = 0;

  for (const c of clusters) {
    const normalizedCanonical = cleanQuestionForMatching(c.canonical_question);

    // Exact match
    if (normalizedCanonical === normalizedNew) {
      bestCluster = c;
      bestSim = 1.0;
      break;
    }

    // High Jaccard similarity (> 0.72)
    const sim = jaccardSimilarity(normalizedCanonical, normalizedNew);
    if (sim > 0.72 && sim > bestSim) {
      bestSim = sim;
      bestCluster = c;
    }
  }

  // 2. If a matching cluster is found, add question to cluster members and update stats
  if (bestCluster) {
    const existingYears: number[] = Array.isArray(bestCluster.exam_years_json)
      ? bestCluster.exam_years_json
      : [];
    const updatedYears = examYear && !existingYears.includes(examYear)
      ? [...existingYears, examYear].sort((a, b) => a - b)
      : existingYears;

    await pool.query(
      `INSERT INTO public.question_cluster_members (cluster_id, question_id, similarity)
       VALUES ($1, $2, $3)
       ON CONFLICT (cluster_id, question_id) DO NOTHING`,
      [bestCluster.id, questionId, Number(bestSim.toFixed(3))]
    );

    const { rows: updatedRows } = await pool.query<{ occurrences_count: number }>(
      `UPDATE public.question_clusters
       SET occurrences_count = occurrences_count + 1,
           exam_years_json = $2::jsonb,
           updated_at = now()
       WHERE id = $1
       RETURNING occurrences_count`,
      [bestCluster.id, JSON.stringify(updatedYears)]
    );

    return {
      clusterId: bestCluster.id,
      isNewCluster: false,
      occurrencesCount: updatedRows[0]?.occurrences_count ?? bestCluster.occurrences_count + 1,
    };
  }

  // 3. Otherwise, create a new cluster with this question as canonical
  const initialYears = examYear ? [examYear] : [];
  const { rows: newCluster } = await pool.query<{ id: string }>(
    `INSERT INTO public.question_clusters (
       subject_id, topic, canonical_question, occurrences_count, exam_years_json
     ) VALUES ($1, $2, $3, 1, $4::jsonb)
     RETURNING id`,
    [subjectId, topic, questionText, JSON.stringify(initialYears)]
  );

  const clusterId = newCluster[0].id;
  await pool.query(
    `INSERT INTO public.question_cluster_members (cluster_id, question_id, similarity)
     VALUES ($1, $2, 1.0)`,
    [clusterId, questionId]
  );

  return {
    clusterId,
    isNewCluster: true,
    occurrencesCount: 1,
  };
}
