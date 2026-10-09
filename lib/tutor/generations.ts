import 'server-only';
import { identityDb, withIdentity } from './db';

/** A running generation that has not reported progress for this long was lost (for example a server restart). */
export const STALE_AFTER_SECONDS = 240;

export type GenerationStatus = 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled';
export type GenerationRow = {
  id: string; user_id: string; conversation_id: string; request_id: string; status: GenerationStatus;
  user_message_id: string | null; assistant_message_id: string | null; error_code: string | null; attempts: number; stale: boolean;
};

const columns = `id,user_id,conversation_id,request_id,status,user_message_id,assistant_message_id,error_code,attempts,
  (status in ('pending','streaming') and updated_at < now() - make_interval(secs => ${STALE_AFTER_SECONDS})) as stale`;

export async function findGeneration(userId: string, requestId: string): Promise<GenerationRow | null> {
  return (await identityDb(userId).query<GenerationRow>(`select ${columns} from chat_generations where user_id=$1 and request_id=$2`, [userId, requestId])).rows[0] ?? null;
}

/** Inserts the generation; returns null when another request already owns this request id. */
export async function claimGeneration(userId: string, conversationId: string, requestId: string): Promise<GenerationRow | null> {
  return (await identityDb(userId).query<GenerationRow>(`insert into chat_generations(user_id,conversation_id,request_id) values($1,$2,$3)
    on conflict(user_id,request_id) do nothing returning ${columns}`, [userId, conversationId, requestId])).rows[0] ?? null;
}

/** Only one concurrent retry can move a failed generation back to pending. */
export async function restartGeneration(userId: string, id: string): Promise<GenerationRow | null> {
  return (await identityDb(userId).query<GenerationRow>(`update chat_generations set status='pending',attempts=attempts+1,error_code=null,started_at=null,completed_at=null,updated_at=now()
    where id=$1 and user_id=$2 and status in ('failed','cancelled') returning ${columns}`, [id, userId])).rows[0] ?? null;
}

export async function setUserMessage(userId: string, id: string, messageId: string) {
  await identityDb(userId).query('update chat_generations set user_message_id=$3,updated_at=now() where id=$1 and user_id=$2', [id, userId, messageId]);
}
export async function markStreaming(userId: string, id: string) {
  await identityDb(userId).query(`update chat_generations set status='streaming',started_at=coalesce(started_at,now()),updated_at=now() where id=$1 and user_id=$2 and status in ('pending','streaming')`, [id, userId]);
}
export async function touchGeneration(userId: string, id: string) {
  await identityDb(userId).query(`update chat_generations set updated_at=now() where id=$1 and user_id=$2 and status in ('pending','streaming')`, [id, userId]);
}
export async function failGeneration(userId: string, id: string, code: string, status: 'failed' | 'cancelled' = 'failed') {
  await identityDb(userId).query(`update chat_generations set status=$3,error_code=$4,updated_at=now() where id=$1 and user_id=$2 and status in ('pending','streaming')`, [id, userId, status, code]);
}

export type SavedAssistantMessage = {
  conversationId: string; generationId: string; content: string; tokensInput?: number; tokensOutput?: number; model?: string | null;
  answerOrigin?: string | null; sourceIds?: string[];
};
/**
 * Saves the assistant message and completes the generation in ONE transaction. A second save for the same
 * generation returns the first message, so a retry can never store (or bill for) a second answer.
 */
export async function saveAssistantMessage(userId: string, message: SavedAssistantMessage): Promise<{ id: string; created: boolean }> {
  return withIdentity(userId, async (db) => {
    const existing = (await db.query<{ id: string }>('select id from messages where generation_id=$1', [message.generationId])).rows[0];
    let id = existing?.id, created = false;
    if (!id) {
      id = (await db.query<{ id: string }>(`insert into messages(conversation_id,role,content,tokens_input,tokens_output,model,answer_origin,source_ids,generation_id)
        values($1,'assistant',$2,$3,$4,$5,$6,$7::jsonb,$8) returning id`,
      [message.conversationId, message.content, message.tokensInput ?? 0, message.tokensOutput ?? 0, message.model ?? null, message.answerOrigin ?? null,
        JSON.stringify(message.sourceIds ?? []), message.generationId])).rows[0].id;
      created = true;
    }
    await db.query(`update chat_generations set status='completed',assistant_message_id=$3,error_code=null,completed_at=now(),updated_at=now() where id=$1 and user_id=$2`, [message.generationId, userId, id]);
    return { id, created };
  });
}

export async function loadAssistantMessage(userId: string, generation: Pick<GenerationRow, 'assistant_message_id' | 'conversation_id'>): Promise<{ id: string; content: string } | null> {
  if (!generation.assistant_message_id) return null;
  return (await identityDb(userId).query<{ id: string; content: string }>(`select m.id,m.content from messages m join conversations c on c.id=m.conversation_id
    where m.id=$1 and c.user_id=$2`, [generation.assistant_message_id, userId])).rows[0] ?? null;
}

/** A lost generation becomes a visible, retryable failure instead of spinning forever. */
export async function failStaleGeneration(userId: string, row: GenerationRow): Promise<GenerationRow> {
  if (!row.stale) return row;
  await identityDb(userId).query(`update chat_generations set status='failed',error_code='STREAM_INTERRUPTED',updated_at=now()
    where id=$1 and user_id=$2 and status in ('pending','streaming')`, [row.id, userId]);
  return { ...row, status: 'failed', error_code: 'STREAM_INTERRUPTED', stale: false };
}

// Cancelling is explicit (the Stop button). A dropped connection must NOT cancel: the answer keeps generating and is saved.
const running = new Map<string, AbortController>();
export const registerGeneration = (id: string, controller: AbortController) => { running.set(id, controller); };
export const unregisterGeneration = (id: string) => { running.delete(id); };
export function cancelRunningGeneration(id: string): boolean {
  const controller = running.get(id);
  if (!controller) return false;
  controller.abort();
  return true;
}
