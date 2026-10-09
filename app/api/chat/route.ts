import { createClient } from '@/lib/db/server';
import { handleTutorChat } from '@/lib/tutor/chat';
import { chatErrorMessage } from '@/lib/chat/errors';
export const runtime='nodejs';
export async function POST(request:Request) {
  if(process.env.AI_ARCHITECTURE==='legacy') return (await import('@/lib/legacy/chat')).POST(request);
  try {return await handleTutorChat(request,await createClient());}
  catch(error) {
    // Failures before the answer starts (database, auth plumbing) are rare; log the type only, never the question.
    console.error('Chat request failed before streaming',{error:error instanceof Error?error.name:'Unknown'});
    return Response.json({error:chatErrorMessage('INTERNAL'),code:'INTERNAL'},{status:503});
  }
}
