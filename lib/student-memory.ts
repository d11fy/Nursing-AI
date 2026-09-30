import "server-only";
import { identityDb } from "@/lib/tutor/db";

export type StudentContext = { text: string; summary: string; preferences: Record<string, unknown> };
const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim().slice(0, 120);
export function topicKey(question: string) { return clean(question).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 80) || "general"; }

export async function getStudentContext(userId: string, conversationId: string, subjectId: string | null, lectureId: string | null): Promise<StudentContext> {
  const pool = identityDb(userId);
  const [profile, memories, progress, conversation] = await Promise.all([
    pool.query<{full_name:string; nursing_year:string; university:string|null}>("select full_name,nursing_year,university from profiles where user_id=$1", [userId]),
    pool.query<{memory_key:string; memory_value_json:unknown}>("select memory_key,memory_value_json from student_memory where user_id=$1 and memory_type='preference' order by importance desc,updated_at desc limit 8", [userId]),
    pool.query<{topic_name:string; mastery_score:number}>(`SELECT aa.topic AS topic_name,
      round(100.0*count(*) filter (where aa.is_correct=true)/count(*))::int AS mastery_score
      FROM student_exam_attempt_answers aa
      JOIN student_exam_attempts a ON a.id=aa.attempt_id
      JOIN student_exam_attempt_questions aq ON aq.attempt_id=a.id AND aq.question_id=aa.question_id
      WHERE a.user_id=$1 AND ($2::uuid IS NULL OR a.subject_id=$2)
      GROUP BY aa.topic
      HAVING 100.0*count(*) filter (where aa.is_correct=true)/count(*) < 80
      ORDER BY mastery_score ASC LIMIT 6`, [userId,subjectId]),
    pool.query<{summary:string}>("select summary from conversation_memory where conversation_id=$1 and user_id=$2", [conversationId,userId]),
  ]);
  const p = profile.rows[0]; const preferences = Object.fromEntries(memories.rows.map((m) => [m.memory_key, m.memory_value_json]));
  const lines = [p && `Name: ${p.full_name}; academic year: ${p.nursing_year}`, subjectId && `Current subject id: ${subjectId}`, lectureId && `Current lecture id: ${lectureId}`, conversation.rows[0]?.summary && `Conversation summary: ${conversation.rows[0].summary}`, progress.rows.length && `Topics needing review: ${progress.rows.map(x => `${x.topic_name} (${x.mastery_score}%)`).join(", ")}`, Object.keys(preferences).length && `Preferences: ${JSON.stringify(preferences)}`].filter(Boolean);
  return { text: lines.join("\n"), summary: conversation.rows[0]?.summary ?? "", preferences };
}
export async function recordChatLearning(userId: string, subjectId: string | null, lectureId: string | null, question: string) {
  const key = topicKey(question); const name = clean(question) || "General nursing"; const pool = identityDb(userId);
  await pool.query("insert into student_learning_events(user_id,subject_id,lecture_id,event_type,topic_key,metadata_json) values($1,$2,$3,'CHAT_TOPIC_STUDIED',$4,$5)", [userId,subjectId,lectureId,key,JSON.stringify({question: name})]);
}
export async function recordUnanswered(userId: string, subjectId: string | null, lectureId: string | null, question: string, reason: "NO_SOURCE"|"LOW_CONFIDENCE"|"OUTSIDE_CURRICULUM"|"NON_NURSING") { await identityDb(userId).query("insert into unanswered_questions(user_id,subject_id,lecture_id,question,reason) values($1,$2,$3,$4,$5)",[userId,subjectId,lectureId,question,reason]); }
export async function updateConversationMemory(userId:string, conversationId:string, subjectId:string|null, lectureId:string|null, history:Array<{role:string;content:string}>, current:string) { const recent=[...history,{role:"user",content:current}].slice(-8).map(m=>`${m.role}: ${clean(m.content)}`).join("\n"); await identityDb(userId).query(`insert into conversation_memory(conversation_id,user_id,summary,current_subject_id,current_lecture_id,current_topics_json) values($1,$2,$3,$4,$5,$6) on conflict(conversation_id) do update set summary=excluded.summary,current_subject_id=excluded.current_subject_id,current_lecture_id=excluded.current_lecture_id,current_topics_json=excluded.current_topics_json,updated_at=now()`,[conversationId,userId,recent,subjectId,lectureId,JSON.stringify([topicKey(current)])]); }
