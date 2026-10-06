import "server-only";
import type { PoolClient } from "pg";
import { identityDb, withIdentity } from "@/lib/tutor/db";
import { calculateMastery, masteryLabel, normalizeTopicIdentity, MINIMUM_MASTERY_EVIDENCE } from "./formula";
import type { MistakeRecord, MistakeStatus, TopicProgress } from "./types";

type Queryable = Pick<PoolClient, "query">;

export async function recalculateStudentTopicProgress(input: {
  userId: string;
  subjectId: string;
  topic: string;
  client?: Queryable;
  reason?: string;
  recordHistory?: boolean;
}) {
  const run = async (client: Queryable) => {
    const identity = normalizeTopicIdentity(input.topic);
    const [studyQuiz, practiceQuiz, chatQuiz, flashcards, mistakes, previous] = await Promise.all([
      client.query<{ is_correct: boolean; answered_at: string }>(
        `select a.is_correct,a.answered_at::text from student_quiz_answers a
         join student_quiz_attempts qa on qa.id=a.attempt_id
         join study_pack_quizzes q on q.id=qa.quiz_id join study_packs sp on sp.id=q.study_pack_id
         where qa.user_id=$1 and sp.subject_id=$2 and a.topic_key=$3 order by a.answered_at desc`,
        [input.userId, input.subjectId, identity.topicKey]
      ),
      client.query<{ is_correct: boolean; answered_at: string }>(
        `select a.is_correct,a.created_at::text as answered_at from student_exam_attempt_answers a
         join student_exam_attempts ea on ea.id=a.attempt_id
         where ea.user_id=$1 and ea.subject_id=$2 and a.topic_key=$3 order by a.created_at desc`,
        [input.userId, input.subjectId, identity.topicKey]
      ),
      client.query<{ is_correct: boolean; answered_at: string }>(
        `select result as is_correct,created_at::text as answered_at from learning_events
         where user_id=$1 and subject_id=$2 and conversation_id is not null
         and event_type in ('quiz_correct','quiz_incorrect')
         and ('v2:' || coalesce(nullif(left(trim(both '-' from regexp_replace(lower(topic), '[^[:alnum:]]+', '-', 'g')),80),''),'general'))=$3
         order by created_at desc`, [input.userId, input.subjectId, identity.topicKey]
      ),
      client.query<{ known: number; review_again: number; last_activity: string | null }>(
        `select count(*) filter(where p.status='known')::int as known,
          count(*) filter(where p.status='review_again')::int as review_again,max(p.last_reviewed_at)::text as last_activity
         from student_flashcard_progress p join study_pack_flashcards f on f.id=p.flashcard_id
         join study_packs sp on sp.id=f.study_pack_id
         where p.user_id=$1 and sp.subject_id=$2 and p.topic_key=$3`,
        [input.userId, input.subjectId, identity.topicKey]
      ),
      client.query<{ wrong_count: number; unresolved: number; recovery: number; last_activity: string | null }>(
        `select coalesce(sum(wrong_count),0)::int as wrong_count,
          count(*) filter(where review_status<>'mastered')::int as unresolved,
          coalesce(sum(recovery_correct_count),0)::int as recovery,max(greatest(last_wrong_at,last_reviewed_at))::text as last_activity
         from student_mistakes where user_id=$1 and subject_id=$2 and topic_key=$3 and mistake_key is not null`,
        [input.userId, input.subjectId, identity.topicKey]
      ),
      client.query<{ mastery_score: number }>(
        `select mastery_score::float as mastery_score from student_topic_progress
         where user_id=$1 and subject_id=$2 and topic_key=$3`,
        [input.userId, input.subjectId, identity.topicKey]
      ),
    ]);
    const quiz = [...studyQuiz.rows, ...practiceQuiz.rows, ...chatQuiz.rows].map((row) => ({ isCorrect: row.is_correct, answeredAt: row.answered_at }));
    const flash = flashcards.rows[0] ?? { known: 0, review_again: 0, last_activity: null };
    const mistake = mistakes.rows[0] ?? { wrong_count: 0, unresolved: 0, recovery: 0, last_activity: null };
    const result = calculateMastery({ quiz, flashcardKnown: flash.known, flashcardReviewAgain: flash.review_again,
      wrongCount: mistake.wrong_count, unresolvedMistakes: mistake.unresolved, recoveryCount: mistake.recovery });
    const correct = quiz.filter((item) => item.isCorrect).length;
    const lastQuiz = quiz[0]?.answeredAt ?? null;
    const lastActivity = [lastQuiz, flash.last_activity, mistake.last_activity].filter(Boolean).sort().at(-1) ?? null;

    await client.query(
      `insert into student_topic_progress(user_id,subject_id,topic_key,topic_name,questions_answered,correct_answers,wrong_answers,
        mastery_score,quiz_accuracy,quiz_answer_count,mistake_count,unresolved_mistake_count,flashcard_known_count,
        flashcard_review_count,recovery_count,evidence_count,generation,last_studied_at,last_activity_at,last_recalculated_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$5,$10,$11,$12,$13,$14,$15,3,$16,$16,now())
       on conflict(user_id,subject_id,topic_key) do update set topic_name=excluded.topic_name,
        questions_answered=excluded.questions_answered,correct_answers=excluded.correct_answers,wrong_answers=excluded.wrong_answers,
        mastery_score=excluded.mastery_score,quiz_accuracy=excluded.quiz_accuracy,quiz_answer_count=excluded.quiz_answer_count,
        mistake_count=excluded.mistake_count,unresolved_mistake_count=excluded.unresolved_mistake_count,
        flashcard_known_count=excluded.flashcard_known_count,flashcard_review_count=excluded.flashcard_review_count,
        recovery_count=excluded.recovery_count,evidence_count=excluded.evidence_count,generation=3,
        last_studied_at=excluded.last_studied_at,last_activity_at=excluded.last_activity_at,last_recalculated_at=now(),updated_at=now()`,
      [input.userId, input.subjectId, identity.topicKey, identity.topicName, quiz.length, correct, quiz.length - correct,
        result.score, result.quizAccuracy, mistake.wrong_count, mistake.unresolved, flash.known, flash.review_again,
        mistake.recovery, result.evidenceCount, lastActivity]
    );

    if (input.recordHistory && previous.rows[0]?.mastery_score !== result.score) {
      await client.query(
        `insert into student_learning_events(user_id,subject_id,event_type,topic_key,metadata_json)
         values($1,$2,'TOPIC_MASTERY_UPDATED',$3,$4::jsonb)`,
        [input.userId, input.subjectId, identity.topicKey, JSON.stringify({ topicName: identity.topicName,
          masteryScore: result.score, previousScore: previous.rows[0]?.mastery_score ?? null, reason: input.reason ?? "recalculated",
          evidenceCount: result.evidenceCount })]
      );
    }
    return { ...result, ...identity };
  };
  return input.client ? run(input.client) : withIdentity(input.userId, run);
}

function mapTopic(row: Record<string, unknown>): TopicProgress {
  const evidence = Number(row.evidence_count ?? 0);
  const score = Number(row.mastery_score ?? 0);
  return {
    subjectId: row.subject_id as string | null, subjectName: String(row.subject_name ?? "بدون مادة"),
    topicKey: String(row.topic_key), topicName: String(row.topic_name), masteryScore: score,
    quizAccuracy: row.quiz_accuracy == null ? null : Number(row.quiz_accuracy), quizAnswerCount: Number(row.quiz_answer_count ?? 0),
    mistakeCount: Number(row.mistake_count ?? 0), unresolvedMistakeCount: Number(row.unresolved_mistake_count ?? 0),
    flashcardKnownCount: Number(row.flashcard_known_count ?? 0), flashcardReviewCount: Number(row.flashcard_review_count ?? 0),
    recoveryCount: Number(row.recovery_count ?? 0), evidenceCount: evidence, hasEnoughEvidence: evidence >= MINIMUM_MASTERY_EVIDENCE,
    label: masteryLabel(score, evidence >= MINIMUM_MASTERY_EVIDENCE), lastActivityAt: row.last_activity_at as string | null,
  };
}

export async function getProgressDashboard(userId: string) {
  const db = identityDb(userId);
  const [topicsResult, currentMistakes] = await Promise.all([
    db.query<Record<string, unknown>>(
      `select p.*,coalesce(s.name_ar,s.name_en,'بدون مادة') as subject_name from student_topic_progress p
       left join subjects s on s.id=p.subject_id where p.user_id=$1 and p.evidence_count>0
       order by p.last_activity_at desc nulls last,p.topic_name`, [userId]),
    db.query<{ count: number }>(
      `select count(*)::int as count from student_mistakes where user_id=$1 and mistake_key is not null and review_status<>'mastered'`, [userId]),
  ]);
  const topics = topicsResult.rows.map(mapTopic);
  const sufficient = topics.filter((topic) => topic.hasEnoughEvidence);
  const totalEvidence = sufficient.reduce((sum, topic) => sum + topic.evidenceCount, 0);
  const overallMastery = totalEvidence
    ? Math.round(sufficient.reduce((sum, topic) => sum + topic.masteryScore * topic.evidenceCount, 0) / totalEvidence)
    : null;
  const weakTopics = sufficient.filter((topic) => topic.masteryScore < 60).sort((a, b) => a.masteryScore - b.masteryScore);
  const strongTopics = sufficient.filter((topic) => topic.masteryScore >= 85).sort((a, b) => b.masteryScore - a.masteryScore);
  const subjectMap = new Map<string, { subjectId: string; subjectName: string; topics: TopicProgress[] }>();
  for (const topic of topics) {
    if (!topic.subjectId) continue;
    const item = subjectMap.get(topic.subjectId) ?? { subjectId: topic.subjectId, subjectName: topic.subjectName, topics: [] };
    item.topics.push(topic); subjectMap.set(topic.subjectId, item);
  }
  const subjects = [...subjectMap.values()].map((subject) => {
    const measured = subject.topics.filter((topic) => topic.hasEnoughEvidence);
    const evidence = measured.reduce((sum, topic) => sum + topic.evidenceCount, 0);
    return { subjectId: subject.subjectId, subjectName: subject.subjectName,
      masteryScore: evidence ? Math.round(measured.reduce((sum, topic) => sum + topic.masteryScore * topic.evidenceCount, 0) / evidence) : null,
      topicsStudied: subject.topics.length, questionsAnswered: subject.topics.reduce((sum, topic) => sum + topic.quizAnswerCount, 0),
      weakTopics: measured.filter((topic) => topic.masteryScore < 60).length };
  });
  return { summary: { overallMastery, subjectsStudied: subjects.length,
    questionsAnswered: topics.reduce((sum, topic) => sum + topic.quizAnswerCount, 0), currentMistakes: currentMistakes.rows[0]?.count ?? 0,
    topicsNeedingReview: weakTopics.length }, subjects, weakTopics, strongTopics, topics,
    recommendation: weakTopics[0] ? `ابدأ بمراجعة ${weakTopics[0].topicName} لأنه أضعف موضوع لديك حاليًا.` : null };
}

export async function getSubjectProgress(userId: string, subjectId: string) {
  const dashboard = await getProgressDashboard(userId);
  return { subject: dashboard.subjects.find((item) => item.subjectId === subjectId) ?? null,
    weakTopics: dashboard.weakTopics.filter((item) => item.subjectId === subjectId),
    mistakes: dashboard.topics.filter((item) => item.subjectId === subjectId).reduce((sum, item) => sum + item.unresolvedMistakeCount, 0) };
}

export async function getMistakes(userId: string, filters: { subjectId?: string; topicKey?: string; status?: MistakeStatus } = {}) {
  const db = identityDb(userId);
  const values: unknown[] = [userId];
  const clauses = ["m.user_id=$1", "m.mistake_key is not null"];
  if (filters.subjectId) { values.push(filters.subjectId); clauses.push(`m.subject_id=$${values.length}`); }
  if (filters.topicKey) { values.push(filters.topicKey); clauses.push(`m.topic_key=$${values.length}`); }
  if (filters.status) { values.push(filters.status); clauses.push(`m.review_status=$${values.length}`); }
  const result = await db.query<Record<string, unknown>>(
    `select m.*,coalesce(s.name_ar,s.name_en) as subject_name,sp.title as study_pack_title,
      coalesce(m.question_snapshot,sq.question,eq.question_text) as display_question,
      coalesce(m.options_snapshot,sq.options_json,eq.options_json,'[]'::jsonb) as display_options,
      coalesce(m.rationale_snapshot,sq.rationale,eq.explanation) as display_rationale,
      coalesce(m.source_reference,sq.source_reference) as display_source
     from student_mistakes m join subjects s on s.id=m.subject_id
     left join study_packs sp on sp.id=m.study_pack_id left join study_pack_questions sq on sq.id=m.question_id
     left join exam_questions eq on eq.id=m.exam_question_id
     where ${clauses.join(" and ")} order by m.last_wrong_at desc`, values);
  return result.rows.map((row): MistakeRecord => ({ id: String(row.id), subjectId: String(row.subject_id),
    subjectName: String(row.subject_name), studyPackId: row.study_pack_id as string | null,
    studyPackTitle: row.study_pack_title as string | null, topicKey: String(row.topic_key), topic: String(row.topic),
    questionType: row.question_type as string | null, question: String(row.display_question),
    options: Array.isArray(row.display_options) ? row.display_options.map(String) : [], studentAnswer: String(row.student_answer),
    correctAnswer: String(row.correct_answer), rationale: row.display_rationale as string | null,
    sourceReference: row.display_source as string | null, wrongCount: Number(row.wrong_count), status: row.review_status as MistakeStatus,
    firstWrongAt: String(row.first_wrong_at), lastWrongAt: String(row.last_wrong_at), lastReviewedAt: row.last_reviewed_at as string | null }));
}

export async function reviewMistake(userId: string, mistakeId: string, studentAnswer: string) {
  return withIdentity(userId, async (client) => {
    const result = await client.query<{ subject_id: string; topic: string; topic_key: string; correct_answer: string; review_status: MistakeStatus }>(
      `select subject_id,topic,topic_key,correct_answer,review_status from student_mistakes where id=$1 and user_id=$2 and mistake_key is not null for update`,
      [mistakeId, userId]);
    const mistake = result.rows[0];
    if (!mistake) throw new Error("الخطأ غير موجود");
    const isCorrect = mistake.correct_answer.trim().toLocaleLowerCase() === studentAnswer.trim().toLocaleLowerCase();
    const nextStatus: MistakeStatus = isCorrect
      ? (mistake.review_status === "new" ? "reviewing" : "mastered") : "reviewing";
    await client.query(
      `update student_mistakes set student_answer=$3,review_status=$4,last_reviewed_at=now(),updated_at=now(),
       recovery_correct_count=recovery_correct_count+$5,last_wrong_at=case when $6 then now() else last_wrong_at end,
       wrong_count=wrong_count+$7,resolved=$8 where id=$1 and user_id=$2`,
      [mistakeId, userId, studentAnswer, nextStatus, isCorrect ? 1 : 0, !isCorrect, isCorrect ? 0 : 1, nextStatus === "mastered"]);
    await client.query(
      `insert into student_learning_events(user_id,subject_id,event_type,topic_key,metadata_json)
       values($1,$2,'MISTAKE_REVIEWED',$3,$4::jsonb)`,
      [userId, mistake.subject_id, mistake.topic_key, JSON.stringify({ mistakeId, isCorrect, status: nextStatus })]);
    const progress = await recalculateStudentTopicProgress({ userId, subjectId: mistake.subject_id, topic: mistake.topic,
      client, reason: "mistake_review", recordHistory: true });
    return { isCorrect, status: nextStatus, correctAnswer: mistake.correct_answer, mastery: progress };
  });
}
